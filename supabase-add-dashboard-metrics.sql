-- Run once on existing Supabase projects (safe-ish to re-run with IF NOT EXISTS).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gmv numeric(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_paid_amount numeric(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_amount numeric(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_fee numeric(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee numeric(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS escrow_amount numeric(12,2) DEFAULT 0;

