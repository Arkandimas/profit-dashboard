-- Migration: add gmv column and performance indexes
-- Run this in the Supabase SQL editor or via psql.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS gmv numeric(12,2) DEFAULT 0;

-- Back-fill existing rows: set gmv = revenue where gmv is not yet set
UPDATE orders SET gmv = revenue WHERE gmv = 0 OR gmv IS NULL;

-- Indexes for dashboard date-range and status queries
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
