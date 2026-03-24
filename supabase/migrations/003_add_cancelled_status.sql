-- Allow 'cancelled' as a job status
alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check check (status in (
  'pending','ingesting','moments','clipping','notion','done','failed','cancelled'
));
