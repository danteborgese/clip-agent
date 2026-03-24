-- Add platform column to distinguish between YouTube URL and direct upload jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'youtube';
