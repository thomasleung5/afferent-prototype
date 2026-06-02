# Operational readiness — production launch

Pair this with [`docs/supabase-readiness.md`](supabase-readiness.md).
The other doc gets the project provisioned correctly; this one tells
on-call what to watch, what to do when something breaks, and how to
recover.

---

## 1. Backup and restore (Supabase data)

### What's at risk

| Table | Loss impact | Recoverable from |
|---|---|---|
| `studies` | Study metadata (name, fiscal year). Cheap to recreate. | Supabase backup, then re-link `organization_members`. |
| `study_drafts` | The live editing snapshot per study. **High** impact — these are the work-in-progress numbers. | Supabase backup; an analyst's localStorage if their browser hasn't cleared since the last edit; last `study_versions` cut. |
| `study_versions` | The authoritative immutable history. **Highest** impact — these are the council-ready snapshots. | Supabase backup. Cold export recommended (below). |
| `study_imports`, `study_audit_events` | Breadcrumb trails. Useful for incident response within the audit retention window. | Supabase backup. |
| `organizations`, `organization_members` | Tenancy. Lock-out impact if lost. | Supabase backup; re-seed via `docs/supabase-readiness.md` § 4. |

### Supabase point-in-time recovery (PITR)

- **Supabase Pro plan (or higher)** ships PITR. Enable it in the
  project dashboard under **Database → Backups**.
- PITR rolls the entire project DB to any timestamp within the
  retention window (default 7 days; configurable up to 28).
- Practice the restore once before launch on a clone / staging
  project: write a known row, PITR back to before it, verify it's
  gone. A PITR you've never executed is not a backup plan.

### Cold export of `study_versions` (recommended)

Versions are the durable record; even if PITR is enabled, keeping a
weekly off-platform export is a cheap defense against losing the
entire Supabase project. The snapshot column is jsonb so the export
is round-trippable.

```bash
# Weekly cron — run from anywhere that can reach the DB with the
# service-role connection string. Output is one JSON line per
# version (study_id, version_number, label, status, snapshot,
# created_*).
psql "$DATABASE_URL" \
  -c "copy (
        select to_jsonb(v) from public.study_versions v
         order by study_id, version_number
      ) to stdout
     " \
  | gzip > "backups/study_versions-$(date -u +%Y%m%d).jsonl.gz"
```

Store the resulting file in a separate cloud bucket with versioning
enabled (S3, GCS, R2 — any object store with object-lock /
versioning). Retain 12 months minimum.

`study_drafts` is **not** in the cold export by design: it's the
live editing slice and changes constantly. Versions capture the
"committed" state at human checkpoints, which is what we'd recover
to anyway.

### Restore checklist

If you ever execute one:

1. Stop writes — take the server out of the load balancer rotation
   or roll back to a maintenance image.
2. Decide the target timestamp; confirm what data will be lost
   between target and now (verbalize it: "we will lose every save
   after 14:32 PT today").
3. Execute the PITR in the Supabase dashboard.
4. Re-run the production smoke (`npm run smoke:prod`) against the
   restored project to confirm `/healthz` + an authed
   `/api/studies` call both pass.
5. Re-open the load balancer.
6. Post-incident: notify every analyst whose work falls in the
   discarded window. Their browser `localStorage` may still hold
   the lost edits — they can re-save via the StudyMenu.

---

## 2. Audit event retention

Already specified in
[`docs/persistence-design.md` → "Audit retention (recommendation)"](persistence-design.md#audit-retention-recommendation).
Short version:

- **`study_audit_events` retention: 90 days.** A nightly cron-driven
  DELETE removes rows older than 90 days, preserving
  `event_type IN ('study.archived', 'study.published')` forever as
  the durable history marker.
- **Versions retention: forever.** `study_versions` is the
  authoritative snapshot history. Never schedule a delete against
  it.
- The actual cleanup job (Option A in the design doc) is not yet
  wired. Track it as a launch follow-up; a single
  `.github/workflows/audit-cleanup.yml` + the SQL from the design
  doc is the smallest implementation. Without it, `study_audit_events`
  grows indefinitely — fine for the first ~6 months, worth
  monitoring after.

### Watch

```sql
-- Row count and span. If span exceeds 90 days, the cleanup job is
-- either not running or failing silently.
select count(*)                       as rows,
       min(occurred_at)               as oldest,
       max(occurred_at)               as newest,
       max(occurred_at) - min(occurred_at) as span
  from public.study_audit_events;
```

---

## 3. Error monitoring and log review

### What's emitted

The server logger (`server/logger.ts`) writes one JSON object per
line to stdout, structured as:

```
{"ts":"…","level":"info|warn|error","msg":"…","route":"/api/…","status":200,"latency_ms":42,"req_id":"…","tag":"…",…}
```

Every `/api/*` request also gets a `request` log line via
`server/requestLogger.ts` with the method, route, status, latency,
and a request id. Handler-side errors quote the same `req_id`.

### What's **never** in the log

- `Authorization` headers / bearer tokens.
- Request bodies (uploaded PDFs, Excel, snapshots).
- Full URLs with query strings (recovery tokens land in the query
  string of magic-link callbacks — the logger drops them).
- Email addresses / PII.

These are invariants. The `server/__tests__/logger.fixture.ts` and
`server/__tests__/observability.fixture.ts` tests pin them; don't
relax them.

### What to ingest

Pipe stdout into your aggregator of choice (Datadog, Loki, Cloud
Logging, fluent-bit). Recommended saved searches:

| Saved view | Query (Datadog-flavored — adapt syntax) | Action threshold |
|---|---|---|
| **5xx rate by route** | `level:error route:/api/*` count by route, 5m | >5/min sustained ≥10m → page |
| **Auth failures** | `level:warn msg:"auth failed"` count, 5m | >100/min → likely token / JWKS issue |
| **DB unconfigured** | `msg:"Study persistence is not configured"` | Any in production → page (means `SUPABASE_SERVICE_ROLE_KEY` got cleared) |
| **Audit insert failures** | `msg:"audit event insert failed"` | >1% of `draft.upsert` events → investigate (RLS regression?) |
| **AI parse failures** | `tag:ai-parse-* level:error` | >10/min → check Anthropic status page |
| **Origin rejections** | `msg:"origin rejected"` | Any from your own production origin → `ALLOWED_ORIGINS` drift |

### What to alert on

- `/healthz` 5xx for >30s.
- 5xx rate on any `/api/*` route >2% over a 5-minute window.
- Server process exits (boot-time env validator catching a config
  issue). The platform's restart policy plus
  `ALLOWED_ORIGINS`-shaped messages in stderr should make these
  diagnosable in <1 minute.

---

## 4. Health check endpoint

- **Path:** `GET /healthz`.
- **Response:** `200 { ok: true, uptime: <seconds>, at: <iso8601> }`.
- **Auth:** unauthenticated by design. Registered ahead of every
  middleware so it doesn't trip CORS / origin / auth / rate-limit
  gates and doesn't appear in the per-request log stream.
- **Container-level fallback:** `Dockerfile` defines a
  `HEALTHCHECK` that polls `/healthz` every 30s with a 3s timeout
  and 3 retries. The orchestrator's own probes should be the
  primary; this is defense-in-depth.
- **What it does NOT check:** Supabase reachability, Anthropic
  reachability, RLS policy state. It's a liveness probe, not a
  full readiness probe. The production smoke (`npm run smoke:prod`)
  is the readiness probe.

Platforms that need richer readiness signals should orchestrate
`npm run smoke:prod` as a post-deploy job. Don't add the heavy
checks to `/healthz` directly — the load balancer hits it every
few seconds and the cost matters.

---

## 5. Rollback plan

### Server / SPA (forward-recoverable)

The compiled artifact is `dist-server/index.mjs` + `dist/`, both
generated from the source at build time and shipped in the same
container image.

- **To roll back:** redeploy the previous image tag. Both halves
  travel together (`dist-server` + `dist`), so a single tag bump
  reverts the server and the SPA atomically.
- **Time to recovery:** whatever your platform's image-rollback
  takes. Usually <2 minutes.
- **Required validation after rollback:** run the production smoke
  against the rolled-back image. Confirm `/healthz` + the authed
  `/api/studies` round-trip both pass.

### Database (NOT forward-recoverable)

`supabase/migrations/` are **forward-only**. There is no `down`
script in this repo.

If a bad migration shipped:

1. **Triage first** — check what the migration actually changed.
   For pure `add column` / `add table` migrations, the safest path
   is to ignore the unused column / table and ship a code revert
   that stops reading from it. Don't roll back the DDL unless the
   migration is actively breaking writes.
2. **PITR for an actively-broken DB** — see § 1. Restore to a
   timestamp before the migration ran, then redeploy the server
   image from that era.
3. **Surgical revert** — write a new migration that undoes the bad
   one (`alter table … drop column`, etc.). Apply it the same way
   you'd apply any other migration. Keeps the forward-only contract.

**Never** edit a migration file that has run in production. Add a
new one instead — the version-history of migrations is your audit
trail.

### SPA-only emergency

If only the client bundle is broken (e.g. a CSS regression that
blocks a page) and the server is fine, you can rebuild the SPA from
the previous commit:

```bash
STRICT_BUILD=1 \
VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… \
  npm run build:client
# Deploy ONLY the dist/ output — the server bundle from the bad
# tag still serves correctly.
```

In practice the image-rollback path is faster and less error-prone;
keep this option in reserve.

---

## 6. Smoke test cadence

| When | What runs | Why |
|---|---|---|
| Every CI build (PR + main) | `npm test` (33 fixtures), `npm run test:smoke` (Playwright chromium), `npm run build` with `STRICT_BUILD=1` | Catches regressions before merge / before image build. |
| Every container build | Same as CI build + Docker `HEALTHCHECK` polls `/healthz` once the container is up. | Catches packaging regressions (missing runtime dep, wrong start command). |
| Pre-deploy (manual gate) | `npm run smoke:prod` against staging | Catches env-contract regressions and Supabase-config drift before the real deploy. |
| Post-deploy to prod | `npm run smoke:prod` against prod (with `SMOKE_BEARER`) | Confirms the live deploy serves `/healthz` AND the authed `/api/studies` round-trip. |
| Daily (recommended) | `npm run smoke:prod` against prod, scheduled | Detects silent config drift (e.g. `SUPABASE_SERVICE_ROLE_KEY` rotated without the deploy env being updated) within 24h instead of "next time someone tries to save a study". |
| After any Supabase project change | Migrations applied → `npm run smoke:prod`; RLS policy change → re-run the verification queries from `docs/supabase-readiness.md` § 2 | Same reason — config drift surfaces quietly. |

The daily smoke can be a GitHub Actions `schedule:` job that
checks out the repo, builds the server, and runs
`scripts/prod-smoke.sh` with a long-lived service-account bearer
stored as a workflow secret. Halt the pipeline on failure and page
on-call.

---

## 7. Incident checklists

Each section is a top-down triage tree for the named failure class.
Stop at the first matching branch.

### 7a. Auth failures

**Symptom:** users can't sign in; `/api/*` 401s; reset-password
email never arrives.

| Likely cause | Confirm | Fix |
|---|---|---|
| Supabase project paused / suspended | Dashboard → project status | Reactivate / pay bill / contact Supabase support. |
| `SUPABASE_URL` env drift on server | `curl /healthz` and check the server's `mode=production ai=… db=…` boot log | Restore env; restart. |
| JWKS fetch failing | Server logs `msg:"jwks fetch failed"` | Network egress, DNS, or `SUPABASE_URL` typo. |
| Token expired (per-user, not systemic) | One user reports it; others fine | User signs out + back in. |
| Reset email broken | Recovery email arrives but `/reset-password` says "Auth session missing" | **Authentication → Email Templates → Reset Password** customized away from `{{ .ConfirmationURL }}`. See `docs/supabase-readiness.md` § 6. |
| Reset email never arrives | Supabase Auth logs show send | Check **Auth → Email Settings → SMTP** + sender domain reputation. |
| Wrong redirect URL allowlist | Recovery email link 404s or shows Supabase error | Add `{origin}/reset-password` to **Auth → URL Configuration → Redirect URLs**. See `docs/supabase-readiness.md` § 3. |

### 7b. Persistence failures

**Symptom:** users see `Save failed` or `Storage not configured` in
the StudyMenu; saves 5xx; conflicts that never resolve.

| Likely cause | Confirm | Fix |
|---|---|---|
| `503 Study persistence is not configured` | StudyMenu shows "Storage not configured"; server logs `msg:"persistence: not configured"` | `SUPABASE_SERVICE_ROLE_KEY` is unset/empty on the server env. Restore + restart. |
| `404 Study not found` on save | Server logs the user's `study_id`; the row is missing or `archived_at` set | Confirm the analyst's active-id is stale; the StudyMenu auto-clears + drops back to `Local only`. If the row was deleted by mistake, PITR (see § 1). |
| Repeated `409 stale revision` from one user | StudyMenu trigger reads `Conflict`; server logs `msg:"stale revision"` for the same `req_id`'s user | Another tab / analyst has been saving. The user reloads via the popover; local edits stay intact. |
| Audit insert failures (`msg:"audit event insert failed"`) | Server logs that message after each `draft.upsert` | The user write succeeded; only the audit insert failed. RLS policy regression or table-locked; investigate but don't roll back the user write. |
| Many users hitting 5xx on `/api/studies/*` | `level:error route:/api/studies/*` rate spike | Likely a Supabase outage (status.supabase.com) or service-role key rotated without env update. |

### 7c. Import failures

**Symptom:** Excel preview / PDF parse uploads fail; the table
doesn't populate; users see a parse error.

| Likely cause | Confirm | Fix |
|---|---|---|
| Body too large | Server logs `status:413`; user sees "Payload too large" | Confirm the file is reasonable (<5 MB default). If legitimately larger, bump `STUDY_SNAPSHOT_MAX_MB` (snapshot path) or `AI_UPLOAD_MAX_MB` (AI path) and redeploy. Don't disable the cap. |
| Origin rejected | Server logs `msg:"origin rejected"`; user sees 403 from `/api/import/*` | `ALLOWED_ORIGINS` drift. Add the deployed origin and restart. |
| Excel parser regression | `level:error tag:excel-preview` spike after a deploy | Roll back the image (§ 5). The deterministic parser shouldn't fail on previously-working files. |
| Auth failure on a normally-authenticated user | `status:401 route:/api/import/*` for an established user | See 7a. |

### 7d. AI parse failures

**Symptom:** PDF parse uploads return 5xx; "AI parse failed" toast;
`/api/ai/*` returns `503` or `429`.

| Likely cause | Confirm | Fix |
|---|---|---|
| `ANTHROPIC_API_KEY` unset / rotated | Server logs `msg:"ai disabled"` at boot, or `503` from `/api/ai/*` | Restore the env var and restart. AI endpoints fail closed by design when the key is missing — non-AI features still work. |
| Anthropic outage | `tag:ai-parse-* level:error` spike across all parse routes; [status.anthropic.com](https://status.anthropic.com) confirms | Surface a banner to users; queue the work for retry. No code change. |
| Rate limit reached (`429`) | Server logs `msg:"ai rate limit exceeded"` | The in-process rate limiter (`server/aiRateLimit.ts`) is intentional — caps per-user burst. Either wait, or for a real promotion event, bump the per-user quota. |
| Model-side timeout / slow response | Latency_ms in request log >30s for `/api/ai/*` | Anthropic-side; no app-level mitigation beyond surfacing a retry-friendly error. |
| AI extracted bad data (looks parsed, numbers wrong) | User reports a single file; logs show `200`s | The AI is non-deterministic. Re-upload, or use the deterministic Excel preview path for the same domain when available. The user can always edit by hand. |

---

## Sign-off

Operationally ready when the team can answer "yes" to all of these
without checking the docs again:

- Where do we find production logs? How do we trigger an on-call
  page?
- Where is the Supabase backup configured, and how do we run a
  restore?
- What is the rollback command, and how long does it take?
- Who runs the daily smoke, and what's the alert path on failure?
- For each of the four incident classes above, what's the first
  thing to look at?

If any answer requires re-reading this file from scratch, run an
actual fire drill with the team before launch.
