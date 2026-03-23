-- Supabase schema for clip-agent jobs

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  instruction text not null,
  status text not null check (status in (
    'pending','ingesting','moments','clipping','notion','done','failed'
  )),
  platform text not null default 'youtube',
  metadata jsonb,
  selected_candidate_id uuid,
  clip_storage_path text,
  clip_url text,
  notion_page_id text,
  error text,
  step text default 'ingest',
  step_output jsonb default '{}'::jsonb,
  step_details jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  start_seconds numeric not null,
  end_seconds numeric not null,
  title text not null,
  description text not null,
  reason text not null,
  score numeric
);

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  start_seconds numeric not null,
  end_seconds numeric not null,
  text text not null
);
