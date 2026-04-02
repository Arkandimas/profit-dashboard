-- Run once on existing Supabase projects (safe to re-run):
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
