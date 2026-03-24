-- Add clip_transcript column to store transcript segments for the clipped portion
alter table jobs add column if not exists clip_transcript jsonb;
