# Persistence design — server-side study storage

Design doc for moving the build model off browser `localStorage` and
onto Supabase, with row-level security and a clean migration path from
existing localStorage snapshots. **Not yet implemented in code.** The
working app today still persists to localStorage (`lib/store.ts`,
`STORAGE_KEY = "afferent.build.v1"`).

This is a design contract for the next step, not a description of
the current state.

## Current state

- **Where state lives.** `lib/store.ts` wraps the Zustand build store
  in `persist({ name: "afferent.build.v1", ... })`. Every write to
  the store flushes a JSON-serialized `BuildSnapshot` (~the entire
  cost-of-service model: services, volume, operating, CAP pools,
  policy targets, lineage, imports log, study context, …) into
  `window.localStorage` under that key.
- **Versioning.** `makeStudyVersion()` (`lib/storeSnapshot.ts`) cuts
  immutable snapshots into a `versions: StudyVersion[]` array on the
  same store; the comparison drawer reads from this array. Versions
  also live in localStorage.
- **Migration.** `lib/storeMigration.ts` runs in `onRehydrateStorage`
  to upgrade legacy shapes when the persisted JSON predates a schema
  change.
- **Tenant model.** None. The localStorage origin (`localhost:3000`
  or the prod domain) is the only scope. Two analysts can't share a
  study; clearing site data wipes the work.

## Why localStorage is not a production substrate

| Limitation | Impact |
|---|---|
| Per-browser, per-origin | An analyst can't open the study on a different machine or in incognito. |
| ~5–10 MB hard cap | Real CAPs with full lineage + multiple versions are pushing 1–2 MB today; growth runway is months not years. |
| No shared edit / handoff | Two analysts working the same study clobber each other invisibly. |
| No audit trail | "Who changed the BLDG target last week?" is unanswerable. |
| No backup | Browser quota eviction, profile reset, or a wrong "clear site data" loses everything. |
| Same-origin only | Sharing a study with a council member requires a separate export channel (and there's no live one). |

Versions + lineage in localStorage are a useful interim that has
already paid for itself (we can answer "what changed between v3 and
v4" in-app), but they don't outlive a single browser.

## Target architecture

Single Postgres database in Supabase, accessed through Supabase's
PostgREST + RLS layer using the user JWT we already verify on the
server (`server/auth.ts` + `server/requireAuth.ts`). No new auth
hop; row visibility is enforced by Postgres policies, not by app
code.

### Tables

```
jurisdictions      ── one row per municipal client (city of …, county of …).
  id              uuid pk
  name            text not null
  created_at      timestamptz default now()

memberships       ── user ↔ jurisdiction with a role.
  user_id         uuid not null references auth.users
  jurisdiction_id uuid not null references jurisdictions
  role            text not null   -- 'owner' | 'analyst' | 'viewer'
  primary key (user_id, jurisdiction_id)

studies            ── one row per cost-of-service study (e.g. "FY26 fee study").
  id              uuid pk
  jurisdiction_id uuid not null references jurisdictions
  name            text not null
  fiscal_year     text not null
  created_by      uuid not null references auth.users
  created_at      timestamptz default now()
  archived_at     timestamptz

study_versions    ── immutable snapshots; one per "save" / "publish" cut.
  id              uuid pk
  study_id        uuid not null references studies
  version_number  int  not null
  label           text
  status          text not null   -- 'draft' | 'review' | 'published' | 'adopted' | 'archived'
  notes           text
  snapshot        jsonb not null  -- BuildSnapshot shape from lib/storeSnapshot.ts
  created_by      uuid not null references auth.users
  created_at      timestamptz default now()
  unique (study_id, version_number)

study_drafts      ── the live, mutable edit slice (one per study).
  study_id        uuid pk references studies
  snapshot        jsonb not null
  updated_by      uuid not null references auth.users
  updated_at      timestamptz default now()

study_imports     ── per-file import audit (PDFs, Excel workbooks, AI parses).
  id              uuid pk
  study_id        uuid not null references studies
  domain          text not null   -- 'fees' | 'services' | 'volume' | 'labor' | 'operating' | 'cap'
  file_name       text not null
  file_size_bytes int  not null
  source          text not null   -- 'pdf-ai' | 'excel-deterministic' | 'manual-paste'
  mapped_count    int  not null
  duplicate_count int  not null
  skipped_count   int  not null
  imported_by     uuid not null references auth.users
  imported_at     timestamptz default now()
  -- file bytes are NOT stored; only the structured result + audit metadata
```

Note: we deliberately do not store the original uploaded file bytes
server-side. The product surface ingests them, normalizes them into
domain rows, and discards the file. Re-import requires re-upload.
Trade-off is privacy-positive (no long-lived PDF/Excel content) and
matches the observability invariants in
[`README.md → What is intentionally NOT logged`](../README.md).

### Row-level security expectations

Every table above ships with RLS enabled and the following policies:

- **`jurisdictions`** — `SELECT` allowed iff
  `auth.uid()` has a `memberships` row for that jurisdiction.
  `INSERT` allowed for service-role only (jurisdictions are
  provisioned by an admin script, not by analysts).

- **`memberships`** — `SELECT` allowed for the same `user_id` (an
  analyst can see their own memberships). `INSERT` / `UPDATE` /
  `DELETE` for service-role only.

- **`studies`** — `SELECT` allowed iff the caller has a membership
  for that `jurisdiction_id`. `INSERT` allowed for `role IN
  ('owner','analyst')`. `UPDATE` (rename, archive) and `DELETE`
  restricted to `role = 'owner'`.

- **`study_versions`** — `SELECT` follows the parent study. `INSERT`
  allowed for `role IN ('owner','analyst')`. `UPDATE` /
  `DELETE` denied for everyone — versions are immutable; "delete
  the v3 draft" is modeled as `status = 'archived'`.

- **`study_drafts`** — same `SELECT` rule as the parent study.
  `INSERT` and `UPDATE` allowed for `role IN ('owner','analyst')`.
  `DELETE` allowed for `role = 'owner'`.

- **`study_imports`** — `SELECT` follows the parent study.
  `INSERT` allowed for `role IN ('owner','analyst')`. No `UPDATE`,
  no `DELETE` — audit trail.

All policies are written against `auth.uid()` and join through
`memberships`, so a user JWT (the one we already verify in
`server/auth.ts`) is sufficient. The server never needs the
service-role key for normal traffic; admin provisioning runs out of
band.

### API surface

Two layers:

1. **Direct PostgREST from the browser** for `study_drafts` reads /
   writes and `study_versions` reads. The autosave loop in the SPA
   talks to Supabase directly using the same publishable key the
   login flow uses. RLS makes this safe — the browser cannot see
   rows it doesn't have a membership for.

2. **A small new server surface on the Hono app** for the operations
   that need server-side authority:

   ```
   POST   /api/studies                     create study     (auth + 'owner'|'analyst')
   POST   /api/studies/:id/versions        cut a version    (auth, transactional)
   POST   /api/studies/:id/publish         publish version  (auth + 'owner')
   POST   /api/studies/:id/import          record an import (auth)
   ```

   These wrap multi-statement writes that we want to bound to the
   server's `req_id` / structured-log envelope. Each handler reuses
   `requireAuth` and emits a tag-line into `server/logger.ts` for
   correlation.

3. **No `/api/studies/:id/load` etc.** Reads stay direct-to-Supabase
   so they ride the publishable-key cache path and don't fan
   through the Hono process.

The browser store wraps Supabase reads + writes behind the same
`useBuildState` hook callers use today. The Zustand store stops
calling `persist({ name: "afferent.build.v1" })`; instead, a small
sync adapter pushes diffs to `study_drafts.snapshot` (debounced,
e.g. 1 s) and pulls a fresh snapshot on study switch.

## Migration path

Migration runs once per browser, surfaced as a banner on `/` when
the SPA detects:

- a valid Supabase session is active, AND
- `localStorage.getItem("afferent.build.v1")` returns a non-empty
  JSON value, AND
- the user has at least one `studies` row visible via RLS where
  `study_drafts.snapshot` is empty.

Migration steps, executed atomically server-side via a new
`POST /api/studies/import-from-localstorage`:

1. Browser reads + parses the legacy snapshot.
2. Browser POSTs the snapshot to the new endpoint along with a
   target `study_id`.
3. Server runs `migratePersistedState(snapshot)` (reusing
   `lib/storeMigration.ts`) so any legacy shapes upgrade to the
   current `BuildSnapshot` contract.
4. Server `INSERT`s a `study_versions` row with
   `label = 'Imported from localStorage YYYY-MM-DD'`, `status =
   'archived'` (so it shows up in version history as a starting
   point but doesn't become the live draft).
5. Server `UPSERT`s `study_drafts` for the same study with the
   migrated snapshot.
6. Browser, on `2xx`, deletes `localStorage["afferent.build.v1"]`.

Failure modes are recoverable: leaving the legacy entry in place
keeps the offline-only flow working until migration succeeds.

For users who can't access Supabase yet (e.g. local-only
development), the JSON snapshot export/import helper in
`lib/snapshotIO.ts` provides a manual escape hatch — the same JSON
shape the migration endpoint accepts.

## Open questions

- **Concurrent editing.** Two analysts on the same draft: do we
  last-writer-wins on debounced flushes, or move to an
  operational-transform / Yjs model? Last-writer-wins is acceptable
  near-term given the typical analyst pair flow (handoff, not
  simultaneous edit), but should be revisited if the product
  pushes into shared real-time editing.
- **Snapshot size growth.** A jsonb snapshot is convenient but
  diffs poorly. If snapshots routinely cross ~5 MB, factor out
  the largest sub-models (services, lineage, imports) into
  separate normalized tables and reconstitute on read.
- **Fiscal-year tenancy.** Today's app already understands
  `studyContext.fiscalYear`; the `studies` table makes that a
  first-class identifier. Pulling a multi-year comparison
  ("what did BLDG fees do FY24→FY26?") becomes a server query
  instead of a localStorage walk.

## Not in scope here

- Schema migrations for the existing CAP / fee-study / FBHR
  derivations — those continue to live in `lib/store.ts` +
  `lib/storeMigration.ts` and apply on snapshot rehydration the
  same way they do today.
- Real-time presence indicators ("Alex is editing this dept").
- Public sharing / read-only council view. Both are easy follow-ons
  once the membership model lands.
