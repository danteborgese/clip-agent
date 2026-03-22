-- Add step-machine columns to the jobs table
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS step text DEFAULT 'ingest',
  ADD COLUMN IF NOT EXISTS step_output jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS step_details jsonb DEFAULT '[]'::jsonb;
