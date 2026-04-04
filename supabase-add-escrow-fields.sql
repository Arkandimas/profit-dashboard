-- Migration: add full escrow fields to orders table
-- Run this in the Supabase SQL editor or via psql.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS commission_fee_actual   numeric(12,2),
  ADD COLUMN IF NOT EXISTS service_fee_actual      numeric(12,2),
  ADD COLUMN IF NOT EXISTS ams_commission          numeric(12,2),
  ADD COLUMN IF NOT EXISTS processing_fee          numeric(12,2),
  ADD COLUMN IF NOT EXISTS shopee_shipping_rebate  numeric(12,2),
  ADD COLUMN IF NOT EXISTS voucher_from_seller     numeric(12,2),
  ADD COLUMN IF NOT EXISTS voucher_from_shopee     numeric(12,2),
  ADD COLUMN IF NOT EXISTS escrow_synced           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS escrow_synced_at        timestamptz;

-- Update net_profit formula comment:
-- net_profit = revenue - cogs - commission_fee_actual - service_fee_actual
--              - ams_commission - processing_fee - voucher_from_seller
-- (shipping is excluded: shopee_shipping_rebate typically covers actual_shipping_fee fully)

-- Back-fill: mark existing rows as unsynced
UPDATE orders SET escrow_synced = false WHERE escrow_synced IS NULL;

-- Index for escrow sync queries (status + synced flag)
CREATE INDEX IF NOT EXISTS idx_orders_escrow_sync
  ON orders(platform, status, escrow_synced)
  WHERE escrow_synced = false OR escrow_synced IS NULL;
