-- ====================================================================
-- study_drafts: add revision_id for optimistic-lock conflict detection.
--
-- Background: docs/persistence-design.md → "Concurrency: optimistic
-- locking". The previous behavior on PUT /api/studies/:id/snapshot was
-- last-writer-wins; two analysts editing the same study would silently
-- lose the earlier writer's changes. This column lets the server reject
-- a save whose `expected_revision_id` doesn't match the current row.
--
-- Implementation choice: handler-side mint (the PUT handler explicitly
-- writes a fresh uuid on each successful upsert) rather than an UPDATE
-- trigger. The trigger would be cleaner long-term but the design doc
-- explicitly calls out the handler-side path as the simpler first cut
-- and we have a single writer for this column.
--
-- Backfill: the column is NOT NULL with a volatile DEFAULT, so Postgres
-- generates a unique uuid for every existing draft row at ALTER time.
-- That means any client already holding a load is treated as having an
-- unknown revision on its next save — exactly the conservative behavior
-- we want until clients re-fetch.
-- ====================================================================

alter table public.study_drafts
  add column if not exists revision_id uuid not null default gen_random_uuid();
