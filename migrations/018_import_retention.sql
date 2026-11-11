ALTER TABLE import_jobs ADD COLUMN row_count integer NOT NULL DEFAULT 0;
UPDATE import_jobs SET row_count=jsonb_array_length(rows);
UPDATE import_jobs SET rows='[]' WHERE status='done';
