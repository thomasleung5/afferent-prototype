# Persistence design — server-side study storage

Design doc for moving the build model off browser `localStorage` and
onto Supabase, with row-level security and a clean migration path
from existing localStorage snapshots.

**Status (as of this commit): first persistence layer is shipped.**
The migration in
[`supabase/migrations/`](../supabase/migrations/) provisions the
schema; the `/api/studies/*` Hono routes in `server/studies/`
implement CRUD over `studies`, `study_drafts`, and `study_versions`
with explicit authorization; and the browser adapter in
`lib/studies/studiesApi.ts` exposes the endpoints to UI code. The
SPA's Zustand/localStorage editing model is intentionally
unchanged — see "Migration path" below for how the two layers
will eventually compose.

**Naming note.** The implementation went with `organizations` /
`organization_members` rather than the `jurisdictions` /
`memberships` names used in earlier drafts of this doc. Tenant
boundary is unchanged; the names just match the Supabase
ecosystem's conventional terminology more closely. Existing
references below have been updated.

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

Single Postgres database in Supabase. The implemented first cut
goes through the Hono server with the service-role key
(`server/db.ts`), with authorization enforced in code via
`requireAuth()` plus the role helpers in
`server/studies/authorization.ts`. RLS is still enabled on every
table as defense-in-depth and as the contract for future direct
PostgREST reads from the browser.

A later iteration is expected to move list / read paths to direct
PostgREST + the publishable key so they ride Supabase's edge cache,
keeping the Hono server in the loop only for the writes that need
transactional guarantees (version cuts, atomic multi-row updates).
The schema is identical either way.

### Tables (implemented)

The schema below matches `supabase/migrations/20260601000000_initial_persistence_schema.sql`
exactly. Roles are `owner | admin | analyst | viewer`.

```
organizations            ── one row per municipal client / engagement.
  id              uuid pk
  name            text not null         -- ≤ 200 chars
  created_at      timestamptz default now()

organization_members     ── user ↔ org with a role.
  organization_id uuid references organizations
  user_id         uuid references auth.users
  role            text not null         -- owner | admin | analyst | viewer
  created_at      timestamptz default now()
  primary key (organization_id, user_id)

studies                  ── one row per study.
  id              uuid pk
  organization_id uuid references organizations
  name            text not null         -- ≤ 200 chars
  fiscal_year     text                  -- nullable, ≤ 50 chars
  created_by      uuid references auth.users
  created_at      timestamptz default now()
  updated_at      timestamptz default now()
  archived_at     timestamptz

study_drafts             ── the live, mutable edit slice (one per study).
  study_id    uuid pk references studies
  snapshot    jsonb not null            -- BuildSnapshot from lib/store.ts
  updated_by  uuid references auth.users
  updated_at  timestamptz default now()

study_versions           ── immutable named cuts.
  id              uuid pk
  study_id        uuid references studies
  version_number  int  not null         -- assigned server-side, > 0
  label           text not null         -- ≤ 200 chars
  status          text not null         -- draft|review|published|adopted|archived
  notes           text                  -- ≤ 10 000 chars
  snapshot        jsonb not null
  created_by      uuid references auth.users
  created_at      timestamptz default now()
  unique (study_id, version_number)

study_imports            ── per-file import audit; original bytes NOT stored.
  id               uuid pk
  study_id         uuid references studies
  domain           text not null        -- fees|services|volume|labor|operating|cap
  source           text not null        -- pdf-ai|excel-deterministic|manual-paste
  file_name        text not null
  file_size_bytes  bigint not null
  mapped_count     int    not null default 0
  duplicate_count  int    not null default 0
  skipped_count    int    not null default 0
  imported_by      uuid references auth.users
  imported_at      timestamptz default now()

study_audit_events       ── append-only granular audit.
  id             uuid pk
  study_id       uuid references studies
  event_type     text not null         -- e.g. 'draft.upsert', 'version.created'
  payload        jsonb                 -- structured context; never raw bodies
  actor_user_id  uuid references auth.users
  occurred_at    timestamptz default now()
```

Note: we deliberately do not store the original uploaded file bytes
server-side. The product surface ingests them, normalizes them into
domain rows, and discards the file. Re-import requires re-upload.
Trade-off is privacy-positive (no long-lived PDF/Excel content) and
matches the observability invariants in
[`README.md → What is intentionally NOT logged`](../README.md).

### Row-level security (implemented)

Every table ships with RLS enabled. Policies are written against
`auth.uid()` and join through `organization_members`:

- **`organizations`** — `SELECT` allowed iff `auth.uid()` has an
  `organization_members` row for that org. Writes are service-role only.

- **`organization_members`** — `SELECT` returns the caller's own
  rows. Writes are service-role only (membership grants are an
  admin op out of band).

- **`studies`** — `SELECT` follows the membership. `INSERT` requires
  `role IN ('owner','admin','analyst')`. `UPDATE` restricted to
  `role IN ('owner','admin')`.

- **`study_drafts`** — `SELECT` follows the parent study.
  `INSERT` / `UPDATE` require `role IN ('owner','admin','analyst')`.

- **`study_versions`** — `SELECT` follows the parent study. `INSERT`
  requires `role IN ('owner','admin','analyst')`. No `UPDATE` /
  `DELETE` policy → immutable by RLS default. Status changes will
  be modeled as new rows (future "publish" endpoint).

- **`study_imports`** — `SELECT` follows the parent study. `INSERT`
  requires `role IN ('owner','admin','analyst')`. No `UPDATE` /
  `DELETE` — append-only audit.

- **`study_audit_events`** — `SELECT` follows the parent study.
  `INSERT` requires `role IN ('owner','admin','analyst')`. No
  `UPDATE` / `DELETE` — append-only.

The current `/api/studies/*` handlers use the service-role key
(which bypasses RLS), so they enforce the same contract in code
via `requireAuth()` plus
`server/studies/authorization.ts`. RLS remains the source of truth
for the day the SPA queries Supabase directly with the publishable
key.

### API surface (implemented today)

All reads and writes go through `/api/studies/*` in this first cut.
The browser adapter is in `lib/studies/studiesApi.ts`.

```
GET    /api/studies                      list visible studies
POST   /api/studies                      create a study (owner|admin|analyst)
GET    /api/studies/:id                  metadata + current draft
PUT    /api/studies/:id/snapshot         upsert draft (owner|admin|analyst)
GET    /api/studies/:id/versions         list named versions (no snapshot body)
POST   /api/studies/:id/versions         cut an immutable version (owner|admin|analyst)
```

The handlers (`server/studies/index.ts`) emit a `study_audit_events`
row on every state-changing call. Audit insert failures are logged
through `server/logger.ts` but do not roll back the user-visible
write.

### Future API work (not yet implemented)

- **Direct PostgREST from the browser** for hot read paths
  (`study_drafts` reads, `study_versions` list with snapshot
  hydration on demand). Lands once the RLS policies have been
  exercised against the user JWT in a staging environment.
- **`POST /api/studies/:id/publish`** — atomic "make this version
  the published one" — currently the `status` field on
  `study_versions` carries the intent but the publish workflow is
  manual.
- **`POST /api/studies/:id/imports`** — record the existing client
  ImportApplyResult shape into `study_imports` for cross-device
  audit. Today, the client only persists imports into the localStorage
  `imports` array.

### Browser-side composition (not yet implemented)

The Zustand store keeps its `persist({ name: "afferent.build.v1" })`
configuration today — the localStorage editing model is unchanged.
The intended next step is a small sync adapter that:

1. Hydrates the store from `GET /api/studies/:id` on study switch
   (running the snapshot through `migratePersistedState` first, the
   same way `parseSnapshotJson` does).
2. Pushes diffs to `PUT /api/studies/:id/snapshot` on a debounced
   timer (1 s is the planned default).
3. Promotes localStorage entries on first sign-in via the migration
   flow described below.

Until that adapter ships, the server-side `/api/studies/*` surface
is exercised only by external callers / power-user scripts. The SPA
keeps editing locally.

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

## Concurrency: optimistic locking (implemented)

Previously last-writer-wins on `study_drafts.upsert`; two analysts
saving simultaneously would silently lose the earlier writer's
edits. The shipped implementation matches the plan below.

### Migration (sketch)

```sql
alter table public.study_drafts
  add column revision_id uuid not null default gen_random_uuid();
-- Optional: regenerate the default on UPDATE via a trigger, so the
-- handler doesn't have to compute it. The handler-side option below
-- is simpler and works without a trigger.
```

### Handler change

`PUT /api/studies/:id/snapshot` accepts an optional
`expected_revision_id` in the request body. The server:

1. Reads the current row's `revision_id`.
2. If the caller supplied an `expected_revision_id` AND it doesn't
   match the current row, returns `409 { ok: false, message: "stale
   revision", current_revision_id }`.
3. Otherwise upserts a new `revision_id = gen_random_uuid()` along
   with the snapshot.
4. Returns the new `revision_id` in the success payload.

`GET /api/studies/:id` returns `draft.revision_id` so clients can
quote it on subsequent saves.

### Client change

`useAutoSaveStudy` tracks `lastKnownRevisionId` per active study:

- Updated on every successful load / save / version-load (when the
  server reports it).
- Sent as `expected_revision_id` on the next save.
- On `409`, the hook surfaces a new `SyncStatus.kind = "conflict"`
  with a "Refresh" action that re-fetches and re-applies the
  server's snapshot (with confirm).

Local edits are NEVER discarded on a conflict — the user always
sees the option to overwrite or reload before any destructive
action.

### Out of scope

Operational-transform / Yjs-style real-time merging. The 409 +
reload-or-overwrite flow is the cheapest correct primitive; a
shared-real-time model can be layered on later.

## Audit retention (recommendation)

`study_audit_events` is append-only and will grow forever without
maintenance. The events are useful for short-term incident response
("who saved at 14:32?") but lose value rapidly: the `study_versions`
table is the durable record for snapshot-level history. A 90-day
retention window strikes a reasonable balance.

### Recommended policy

- Retain all `study_audit_events` rows for **90 days** by default.
- Tag any event that should outlive the window with a different
  `event_type` (e.g. `study.archived`, `study.published`); the
  cleanup script preserves those.
- Versions remain forever — they're the authoritative history;
  `study_audit_events` is a thin operational breadcrumb log.

### Implementation options (pick one)

**A. Manual cron-driven DELETE (lowest setup cost).** Run a
nightly job from anywhere that can reach the DB:

```sql
delete from public.study_audit_events
where occurred_at < now() - interval '90 days'
  and event_type not in (
    'study.archived',
    'study.published'
  );
```

Wrap with a service-role connection string. GitHub Actions
`schedule` works, as does any external scheduler.

**B. Supabase Edge Function on a cron trigger.** Same SQL, scheduled
inside the project. Lower latency to the DB; no external secrets
needed.

**C. PostgreSQL `pg_partman`-style partitioning.** Bigger lift —
only worth it once event volume crosses ~10M rows. Out of scope
for the current scale.

We're going with (A) — easiest to set up, no infra dependency,
trivially auditable. A future implementation will add a
`.github/workflows/audit-cleanup.yml` running the SQL above.

## Open questions

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
