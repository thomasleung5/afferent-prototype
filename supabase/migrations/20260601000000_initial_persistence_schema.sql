-- ====================================================================
-- Initial persistence schema for studies + versions + drafts + audit.
--
-- Naming maps onto docs/persistence-design.md, with two renames vs. the
-- design draft: jurisdictions → organizations, memberships →
-- organization_members. (Tenant boundary unchanged.)
--
-- All snapshots are stored as JSONB matching the BuildSnapshot shape
-- from lib/store.ts. Future work may normalize sub-models out of the
-- JSONB; this first cut keeps the model flat for velocity and lets the
-- application-side migrations in lib/storeMigration.ts continue to
-- evolve the snapshot without round-tripping DDL.
--
-- Server access goes through the service-role key (server/db.ts).
-- Authorization is enforced both at the app layer (handlers under
-- server/studies/) and as RLS defense-in-depth — these policies define
-- what's permissible at the database layer if the service-role path is
-- ever bypassed or replaced by direct PostgREST.
-- ====================================================================

create extension if not exists "pgcrypto";

-- ====================================================================
-- Tables
-- ====================================================================

-- organizations -------------------------------------------------------
-- Tenant boundary. One row per municipal client / consulting engagement.
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 200),
  created_at  timestamptz not null default now()
);

-- organization_members -----------------------------------------------
-- User ↔ organization with a role. Roles drive both RLS policies
-- below and the app-layer authorization helpers in
-- server/studies/authorization.ts.
create table if not exists public.organization_members (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null check (role in ('owner','admin','analyst','viewer')),
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists organization_members_user_idx
  on public.organization_members (user_id);

-- studies ------------------------------------------------------------
-- One row per cost-of-service study within an organization. Archive
-- via archived_at (soft delete) rather than DELETE so version history
-- and audit events keep referencing a real row.
create table if not exists public.studies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  jurisdiction_id  text check (jurisdiction_id is null or length(jurisdiction_id) between 1 and 100),
  name             text not null check (length(name) between 1 and 200),
  fiscal_year      text check (fiscal_year is null or length(fiscal_year) between 1 and 50),
  created_by       uuid not null references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);
create index if not exists studies_org_idx
  on public.studies (organization_id);
create index if not exists studies_org_jurisdiction_idx
  on public.studies (organization_id, jurisdiction_id);

-- study_drafts -------------------------------------------------------
-- The live, mutable working snapshot. One row per study (PK = study_id).
-- Upserted whenever the SPA pushes a save; older versions live in
-- study_versions, not in this table's history.
create table if not exists public.study_drafts (
  study_id    uuid primary key references public.studies(id) on delete cascade,
  snapshot    jsonb not null,
  updated_by  uuid not null references auth.users(id),
  updated_at  timestamptz not null default now()
);

-- study_versions -----------------------------------------------------
-- Immutable named cuts of the snapshot. (version_number, study_id) is
-- unique — the server assigns the next integer atomically at insert.
-- No UPDATE / DELETE policy on this table → versions are append-only by
-- RLS (the service-role path enforces the same contract in code).
create table if not exists public.study_versions (
  id              uuid primary key default gen_random_uuid(),
  study_id        uuid not null references public.studies(id) on delete cascade,
  version_number  int  not null check (version_number > 0),
  label           text not null check (length(label) between 1 and 200),
  status          text not null check (status in ('draft','review','published','adopted','archived')),
  notes           text check (notes is null or length(notes) <= 10000),
  snapshot        jsonb not null,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (study_id, version_number)
);
create index if not exists study_versions_study_idx
  on public.study_versions (study_id, version_number desc);

-- study_imports ------------------------------------------------------
-- Per-file import audit. Original PDF / xlsx bytes are NOT stored —
-- the parser keeps only the normalized result + structured metadata.
-- Mirrors the "no payload bytes in logs" invariant from server/logger.ts.
create table if not exists public.study_imports (
  id               uuid primary key default gen_random_uuid(),
  study_id         uuid not null references public.studies(id) on delete cascade,
  domain           text not null check (domain in ('fees','services','volume','labor','operating','cap')),
  source           text not null check (source in ('pdf-ai','excel-deterministic','manual-paste')),
  file_name        text not null check (length(file_name) between 1 and 500),
  file_size_bytes  bigint not null check (file_size_bytes >= 0),
  mapped_count     int  not null default 0 check (mapped_count    >= 0),
  duplicate_count  int  not null default 0 check (duplicate_count >= 0),
  skipped_count    int  not null default 0 check (skipped_count   >= 0),
  imported_by      uuid not null references auth.users(id),
  imported_at      timestamptz not null default now()
);
create index if not exists study_imports_study_idx
  on public.study_imports (study_id, imported_at desc);

-- study_audit_events -------------------------------------------------
-- Granular append-only audit for sensitive actions (draft.upsert,
-- version.created, study.created, study.archived, etc.). payload is
-- intentionally JSONB + free-form so handlers can include relevant
-- structured context without DDL. NEVER store request bodies, auth
-- headers, or full URLs here.
create table if not exists public.study_audit_events (
  id             uuid primary key default gen_random_uuid(),
  study_id       uuid not null references public.studies(id) on delete cascade,
  event_type     text not null check (length(event_type) between 1 and 100),
  payload        jsonb,
  actor_user_id  uuid references auth.users(id),
  occurred_at    timestamptz not null default now()
);
create index if not exists study_audit_events_study_idx
  on public.study_audit_events (study_id, occurred_at desc);

-- ====================================================================
-- Row-level security
-- ====================================================================
-- Every table is RLS-enabled. Policies are written against `auth.uid()`
-- and the membership table; the service-role key bypasses RLS by design
-- (the server enforces the same contract in code via requireAuth() +
-- server/studies/authorization.ts).
-- ====================================================================

alter table public.organizations          enable row level security;
alter table public.organization_members   enable row level security;
alter table public.studies                enable row level security;
alter table public.study_drafts           enable row level security;
alter table public.study_versions         enable row level security;
alter table public.study_imports          enable row level security;
alter table public.study_audit_events     enable row level security;

-- organizations -------------------------------------------------------
create policy "members can read their organizations"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
    )
  );
-- INSERT/UPDATE/DELETE intentionally restricted to service-role —
-- organizations are provisioned by admin scripts, not by analysts.

-- organization_members -----------------------------------------------
create policy "users can read their own memberships"
  on public.organization_members for select
  to authenticated
  using (user_id = auth.uid());
-- Writes are service-role only; membership grants are an admin op.

-- studies ------------------------------------------------------------
create policy "members can read studies in their org"
  on public.studies for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = studies.organization_id
        and m.user_id = auth.uid()
    )
  );

create policy "owners/admins/analysts can create studies"
  on public.studies for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = studies.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin','analyst')
    )
  );

create policy "owners/admins can update studies"
  on public.studies for update
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = studies.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

-- study_drafts --------------------------------------------------------
create policy "members can read drafts of studies in their org"
  on public.study_drafts for select
  to authenticated
  using (
    exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_drafts.study_id
    )
  );

create policy "owners/admins/analysts can insert drafts"
  on public.study_drafts for insert
  to authenticated
  with check (
    updated_by = auth.uid()
    and exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_drafts.study_id
        and m.role in ('owner','admin','analyst')
    )
  );

create policy "owners/admins/analysts can update drafts"
  on public.study_drafts for update
  to authenticated
  using (
    exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_drafts.study_id
        and m.role in ('owner','admin','analyst')
    )
  );

-- study_versions ------------------------------------------------------
create policy "members can read versions of studies in their org"
  on public.study_versions for select
  to authenticated
  using (
    exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_versions.study_id
    )
  );

create policy "owners/admins/analysts can insert versions"
  on public.study_versions for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_versions.study_id
        and m.role in ('owner','admin','analyst')
    )
  );
-- No UPDATE / DELETE — versions are immutable; status changes go
-- through a future server-side "publish" endpoint that mints a new
-- row rather than mutating an old one.

-- study_imports -------------------------------------------------------
create policy "members can read imports of studies in their org"
  on public.study_imports for select
  to authenticated
  using (
    exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_imports.study_id
    )
  );

create policy "owners/admins/analysts can insert imports"
  on public.study_imports for insert
  to authenticated
  with check (
    imported_by = auth.uid()
    and exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_imports.study_id
        and m.role in ('owner','admin','analyst')
    )
  );

-- study_audit_events --------------------------------------------------
create policy "members can read audit events of studies in their org"
  on public.study_audit_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_audit_events.study_id
    )
  );

create policy "owners/admins/analysts can insert audit events"
  on public.study_audit_events for insert
  to authenticated
  with check (
    actor_user_id = auth.uid()
    and exists (
      select 1
      from public.studies s
      join public.organization_members m
        on m.organization_id = s.organization_id and m.user_id = auth.uid()
      where s.id = study_audit_events.study_id
        and m.role in ('owner','admin','analyst')
    )
  );
