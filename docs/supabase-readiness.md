# Supabase production-readiness checklist

Walk this top-to-bottom before pointing a real Supabase project at a
production-shaped deploy. Every box is a hard gate — skip none.

The behavior referenced below comes from these source files; consult
them if the contract here is ambiguous:

- `supabase/migrations/*.sql` — schema + RLS.
- `server/studies/authorization.ts` — server-side role helpers.
- `server/studies/index.ts` — handler chain that mirrors RLS.
- `server/db.ts` — service-role key wiring.
- `lib/auth/AuthContext.tsx` — SPA auth surface (signIn, signOut,
  resetPasswordForEmail, updatePassword — no OAuth, no signup).
- `docs/persistence-design.md` — the design context.

---

## 1. Required migrations

Both files in `supabase/migrations/` must be applied to the target
project, in order.

| # | File | What it provisions |
|---|---|---|
| 1 | `20260601000000_initial_persistence_schema.sql` | `organizations`, `organization_members`, `studies`, `study_drafts`, `study_versions`, `study_imports`, `study_audit_events`. Enables RLS on every table. Provisions the full policy set. Enables `pgcrypto` for `gen_random_uuid()`. |
| 2 | `20260601000001_study_drafts_revision_id.sql` | Adds `study_drafts.revision_id uuid not null default gen_random_uuid()`. Required by the optimistic-lock 409 path in `PUT /api/studies/:id/snapshot`. |

Apply locally:

```bash
supabase link --project-ref <project-ref>   # one-time per project
supabase db push
```

Or directly via `psql` (idempotent — re-running is a no-op):

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260601000000_initial_persistence_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/20260601000001_study_drafts_revision_id.sql
```

**Verify** (run as `postgres` / `service_role`):

```sql
-- All 7 tables present.
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('organizations','organization_members','studies',
                      'study_drafts','study_versions','study_imports',
                      'study_audit_events');
-- Expect: 7 rows.

-- revision_id column present.
select column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'study_drafts'
   and column_name = 'revision_id';
-- Expect: revision_id | NO | gen_random_uuid()
```

---

## 2. RLS expectations

RLS is the **defense-in-depth contract**. The current
`/api/studies/*` handler chain uses the service-role key (which
bypasses RLS) and enforces the same rules via
`server/studies/authorization.ts`, but RLS is still authoritative
for the day a direct-PostgREST read path lands.

Roles: `owner`, `admin`, `analyst`, `viewer`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `organizations` | members of the org | service-role only | service-role only | service-role only |
| `organization_members` | own rows only | service-role only | service-role only | service-role only |
| `studies` | members of parent org | owner / admin / analyst | owner / admin | — (soft-delete via `archived_at`) |
| `study_drafts` | members of parent study's org | owner / admin / analyst | owner / admin / analyst | — |
| `study_versions` | members of parent study's org | owner / admin / analyst | **none — immutable** | **none — immutable** |
| `study_imports` | members of parent study's org | owner / admin / analyst | **none — append-only** | **none — append-only** |
| `study_audit_events` | members of parent study's org | owner / admin / analyst | **none — append-only** | **none — append-only** |

**Verify** RLS is enabled on every table:

```sql
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('organizations','organization_members','studies',
                     'study_drafts','study_versions','study_imports',
                     'study_audit_events');
-- Expect: rowsecurity = true on every row.
```

**Verify** policy count (10+ policies expected across these tables):

```sql
select schemaname, tablename, count(*) as policy_count
  from pg_policies
 where schemaname = 'public'
 group by 1, 2
 order by 2;
-- Expect: organizations 1, organization_members 1, studies 3,
-- study_drafts 3, study_versions 2, study_imports 2, study_audit_events 2.
```

If `rowsecurity = false` on **any** of these tables in a real
project, halt — that's the equivalent of an open S3 bucket and any
client knowing the publishable key can read every row.

---

## 3. Required auth redirect URLs

The SPA uses email + password auth only — no OAuth, no signup flow.
The only redirect path is **password recovery**.

In Supabase Dashboard → **Authentication → URL Configuration**:

1. **Site URL** — set to the production origin (e.g.
   `https://your-prod-domain`). Recovery emails use this as the
   default redirect base. Wrong value → recovery links 404 or land
   on the wrong host.

2. **Redirect URLs** allowlist — add each environment's
   `/reset-password` path:
   - `http://localhost:3000/reset-password` (local dev)
   - `https://your-staging-domain/reset-password` (staging, if separate project)
   - `https://your-prod-domain/reset-password` (production)

   The login page passes `redirectTo = ${window.location.origin}/reset-password`
   on `resetPasswordForEmail` (`lib/auth/AuthContext.tsx:91`), which
   Supabase honors **only** when the URL is on this allowlist.
   Missing entries → "Email link is invalid or has expired" with no
   useful detail.

**Verify** in the dashboard: click the **Reset Password** link in an
incognito session, confirm the email link lands on the right
`/reset-password` page, and that `updatePassword` succeeds.

---

## 4. Required org / member seed data for first users

Brand-new Supabase project state: `auth.users` is empty, `organizations`
is empty, `organization_members` is empty. A user who signs in with
no membership row will hit:

- `GET /api/organizations` → `{ ok: true, organizations: [] }` (handler
  filters by membership).
- `GET /api/studies` → `{ ok: true, studies: [] }`.
- StudyMenu shows "No studies yet… you don't have permission to create
  studies in any organization. Ask your admin."

So launch needs at least **one org row** and **one membership row
per launch user**.

Seed via the dashboard (Auth → Users → Add user) plus SQL run as
service-role:

```sql
-- 1. Create the org.
insert into public.organizations (name) values ('Acme City')
  returning id;
-- Note the returned uuid; call it $ORG.

-- 2. Find the launch user's auth.uid().
select id, email from auth.users where email = 'analyst@acme.gov';
-- Note the returned uuid; call it $USER.

-- 3. Grant membership.
insert into public.organization_members (organization_id, user_id, role)
  values ($ORG, $USER, 'owner');
```

Repeat step 2-3 for each launch user. Pick the role thoughtfully:

| Role | Can edit drafts? | Can create studies? | Can create versions? | Can update study metadata? |
|---|:-:|:-:|:-:|:-:|
| `owner` | ✓ | ✓ | ✓ | ✓ |
| `admin` | ✓ | ✓ | ✓ | ✓ |
| `analyst` | ✓ | ✓ | ✓ | — |
| `viewer` | — | — | — | — |

(Role helpers: `server/studies/authorization.ts`. RLS policies and
this file must stay in sync — the test
`server/__tests__/studyAuthorization.fixture.ts` enforces that.)

**Verify** after seeding:

```sql
-- Membership count by role.
select role, count(*) from public.organization_members
 group by role;
-- Expect at least one owner per organization.

-- Cross-check: every launch user has at least one membership.
select u.email
  from auth.users u
  left join public.organization_members m on m.user_id = u.id
 where m.user_id is null;
-- Expect: 0 rows. Any row here is a launch user with no org access.
```

**UI verification:** sign in as one of the launch users in an
incognito browser. The Studies popover should populate the
organizations dropdown and the "New study…" action should be
enabled.

---

## 5. Service-role key handling

The server uses **only** the service-role key (`server/db.ts`). The
SPA only ever sees the publishable / anon key.

| Key | Where it lives | Where it MUST NOT appear |
|---|---|---|
| **Publishable / anon** (`VITE_SUPABASE_ANON_KEY`) | SPA build env, baked into the bundle, public by design. | — (it's already public) |
| **Service role** (`SUPABASE_SERVICE_ROLE_KEY`) | Server-side env only — secret manager, container env, or `.env.local` (gitignored). | The browser bundle, source files, README, commit messages, logs, error responses, smoke-test transcripts. |

Rules to enforce at launch:

- The platform's secret store (Vercel project env, Fly secrets, k8s
  Secret, etc.) is the single source of truth. **Do not** put
  `SUPABASE_SERVICE_ROLE_KEY` in any committed file.
- Build pipelines for the SPA bundle never need the service-role
  key — only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. If a
  build job has `SUPABASE_SERVICE_ROLE_KEY` in scope, narrow it.
- The server's logger (`server/logger.ts`) strips authorization
  headers and request bodies from structured output. Don't undo this
  for "easier debugging" — every prior incident in this category was
  worth more than the saved triage time.
- Production fail-fast: when `NODE_ENV=production`, `server/env.ts`
  refuses to boot without `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  + `ALLOWED_ORIGINS`. Don't relax this guard.

**Verify** the key isn't leaked into the bundle (build with the
production strict env contract, then grep the dist tree):

```bash
STRICT_BUILD=1 \
VITE_SUPABASE_URL=https://<project>.supabase.co \
VITE_SUPABASE_ANON_KEY=<publishable-key> \
  npm run build

grep -r "SUPABASE_SERVICE_ROLE_KEY\|sb_secret" dist/ || \
  echo "OK: service-role marker absent from SPA bundle"
```

(`sb_secret` is the Supabase service-role key prefix.) If the grep
finds anything, halt — a config drift has shipped the secret.

**If the key is exposed** (commit, log, browser bundle, screenshot):
rotate it in Supabase Dashboard → **Settings → API → Rotate**, then
roll the new value into the deploy env and restart. The old key is
revoked at rotation.

---

## 6. Recovery email template expectations

In Supabase Dashboard → **Authentication → Email Templates → Reset
Password**:

- **Leave the template at the default.** The default body uses
  `{{ .ConfirmationURL }}`, which Supabase fills with the recovery
  hash AND respects the `redirectTo` parameter the SPA passes from
  `resetPasswordForEmail`.
- A customized template that hard-codes a URL or drops the
  `{{ .ConfirmationURL }}` placeholder will silently break the flow:
  the SPA's `/reset-password` page won't receive the recovery hash
  and `updatePassword` returns "Auth session missing".
- The **Subject** line is safe to customize.
- The **From** address (Authentication → Email Settings →
  SMTP / Sender) should match your domain so links don't trip user
  spam filters in production.

**Verify** end-to-end: from an incognito browser at the production
domain, click "Forgot your password?" on the login page, request a
recovery email, click the link from the email, and complete
`updatePassword` on the redirected `/reset-password` page. The
session should sign you in afterward.

---

## 7. Manual verification queries / UI steps

A 10-minute walk-through to run against a fresh / re-seeded project
before declaring readiness.

### Server boot

```bash
# Production-shaped boot with the real project — see docs/prod-smoke
# or README → "Production smoke" for the SMOKE_BEARER flow.
NODE_ENV=production \
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<secret> \
ALLOWED_ORIGINS=https://<your-domain> \
  node dist-server/index.mjs &
curl -sf http://127.0.0.1:8787/healthz
# Expect: {"ok":true,"uptime":…,"at":"…"}
```

The boot logs must include `mode=production ai=… db=enabled`. If
`db=disabled` appears, `SUPABASE_SERVICE_ROLE_KEY` is unset or
malformed.

### Authed round-trip (with a real bearer)

```bash
SMOKE_BEARER='<real user JWT>' \
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ALLOWED_ORIGINS=… \
  npm run smoke:prod
```

Expect `[prod-smoke] /api/studies status: 200` and `[prod-smoke] PASS`.

### Browser walk-through

1. Sign in as a launch user with `owner` role at the production URL.
2. StudyMenu trigger should read `● Local ▾` (no active study yet).
3. Click trigger → popover lists organizations; pick the seeded one.
4. Click **New study…** → enter a name; trigger flips to
   `● Saved ▾` once the seed save completes.
5. Edit any input field → trigger pulses `● Saving ▾` → settles to
   `● Saved ▾`. Hover the trigger; tooltip shows `Active study: <name>
   · Saved · just now`.
6. Sign out, sign back in. The active study should persist (it's in
   `localStorage["afferent.activeStudyId"]`) and the popover should
   re-list it after the first fetch.
7. **Cross-tab conflict check:** open the same study in a second
   tab as the same user. Edit + save in tab B. Edit in tab A; tab A's
   trigger should flip to `● Conflict ▾`. Tooltip says
   "Conflict — reload to resolve". Local edits in tab A must NOT
   have been wiped (verify a field still shows the unsaved value).

### Audit trail

```sql
-- One row per state-changing action; should grow as you edit.
select event_type, count(*)
  from public.study_audit_events
 group by 1
 order by 1;
-- Expect: study.created (≥1), draft.upsert (≥1 per saved study).
```

### Tear-down

If this was a staging walk-through, leave the data in place — it's
how you'll re-validate the next release. If it was a pre-prod
rehearsal on the real project, decide deliberately whether to keep
the seeded test rows; deleting them later is harmless.

---

## Sign-off

The launch is ready when every box above is checked and the
following statement is true at deploy time:

> The server is running `dist-server/index.mjs` with `NODE_ENV=production`,
> the SPA bundle was built with `STRICT_BUILD=1`, both Supabase migrations
> have been applied to the target project, RLS is enabled with the policy
> counts above, the launch user list has membership rows, the
> service-role key lives only in the platform's secret manager, and
> `npm run smoke:prod` (with a real `SMOKE_BEARER`) returns `PASS`.

If any of those is uncertain, do not launch.
