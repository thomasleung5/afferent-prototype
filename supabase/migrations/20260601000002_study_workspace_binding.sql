-- Bind studies to the workspace/jurisdiction they belong to.
--
-- Existing rows are left nullable so deployments can roll forward safely.
-- The API backfills legacy studies from the next saved snapshot's
-- activeJurisdictionId, while all newly-created studies write this column
-- immediately.

alter table public.studies
  add column if not exists jurisdiction_id text
    check (jurisdiction_id is null or length(jurisdiction_id) between 1 and 100);

update public.studies s
set jurisdiction_id = d.snapshot ->> 'activeJurisdictionId'
from public.study_drafts d
where d.study_id = s.id
  and s.jurisdiction_id is null
  and d.snapshot ? 'activeJurisdictionId'
  and length(d.snapshot ->> 'activeJurisdictionId') between 1 and 100;

create index if not exists studies_org_jurisdiction_idx
  on public.studies (organization_id, jurisdiction_id);
