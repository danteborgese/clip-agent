-- Rename Google Drive columns to generic clip storage columns
ALTER TABLE jobs RENAME COLUMN drive_file_id TO clip_storage_path;
ALTER TABLE jobs RENAME COLUMN drive_link TO clip_url;
