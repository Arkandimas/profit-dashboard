-- Migration: Add extended financial columns to orders table
-- Run this in the Supabase Dashboard → SQL Editor
-- After running, re-sync from the dashboard to populate existing orders.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS total_amount         numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_paid_amount     numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_shipping_fee   numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_fee        numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee           numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_discount       numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voucher_from_seller   numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voucher_from_shopee   numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method        text,
  ADD COLUMN IF NOT EXISTS item_list             jsonb;

-- Back-fill buyer_paid_amount from existing revenue column (best approximation
-- for rows that existed before the migration).
UPDATE orders
SET buyer_paid_amount = revenue
WHERE buyer_paid_amount = 0 AND revenue > 0;

-- Back-fill actual_shipping_fee + commission_fee from denormalised columns.
UPDATE orders
SET actual_shipping_fee = shipping_fee
WHERE actual_shipping_fee = 0 AND shipping_fee > 0;

UPDATE orders
SET commission_fee = platform_fee
WHERE commission_fee = 0 AND platform_fee > 0;
