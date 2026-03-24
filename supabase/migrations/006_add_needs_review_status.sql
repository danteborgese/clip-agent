-- Add needs_review as a valid job status (was missing from constraint in migration 004)
alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check check (status in (
  'pending','ingesting','moments','clipping','notion','done','failed','cancelled','needs_review'
));
