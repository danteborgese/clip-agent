-- Add confidence scoring columns for AI accuracy improvements
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS confidence float;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS confidence_signals jsonb;

-- Add needs_review status to the check constraint if one exists
-- (allows jobs to be flagged for human review when confidence is low)
