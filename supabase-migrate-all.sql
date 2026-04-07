-- Comprehensive migration: add ALL columns used by sync routes.
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS).
-- Run in Supabase Dashboard → SQL Editor for project fyhowdwscyzongvqtmli.

ALTER TABLE orders
  -- Core financial columns (may be missing on older DB instances)
  ADD COLUMN IF NOT EXISTS gmv                    numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_paid_amount       numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voucher_amount          numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee             numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_amount           numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at                 timestamptz,

  -- Escrow-detail columns (populated by /api/shopee/sync/escrow)
  ADD COLUMN IF NOT EXISTS commission_fee_actual   numeric(12,2),
  ADD COLUMN IF NOT EXISTS service_fee_actual      numeric(12,2),
  ADD COLUMN IF NOT EXISTS ams_commission          numeric(12,2),
  ADD COLUMN IF NOT EXISTS processing_fee          numeric(12,2),
  ADD COLUMN IF NOT EXISTS shopee_shipping_rebate  numeric(12,2),
  ADD COLUMN IF NOT EXISTS voucher_from_seller     numeric(12,2),
  ADD COLUMN IF NOT EXISTS voucher_from_shopee     numeric(12,2),
  ADD COLUMN IF NOT EXISTS escrow_synced           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS escrow_synced_at        timestamptz;

-- Back-fill gmv for rows that existed before the column was added
UPDATE orders SET gmv = revenue WHERE (gmv = 0 OR gmv IS NULL) AND revenue > 0;

-- Mark existing rows as not yet escrow-synced
UPDATE orders SET escrow_synced = false WHERE escrow_synced IS NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_paid_at     ON orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_escrow_sync  ON orders(platform, status, escrow_synced)
  WHERE escrow_synced = false OR escrow_synced IS NULL;
