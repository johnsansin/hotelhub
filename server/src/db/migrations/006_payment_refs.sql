ALTER TABLE payments ADD COLUMN IF NOT EXISTS ref_type text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS ref_id uuid;
CREATE INDEX IF NOT EXISTS payments_ref_idx ON payments (ref_type, ref_id);
