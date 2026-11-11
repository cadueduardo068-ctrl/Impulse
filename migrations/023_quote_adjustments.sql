ALTER TABLE quotes ADD COLUMN adjustment_requested_at timestamptz;
ALTER TABLE quotes ADD COLUMN adjustment_contact text;
ALTER TABLE quotes ADD COLUMN adjustment_message text;
