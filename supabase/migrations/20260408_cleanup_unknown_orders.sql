-- Remove stale stubs created with missing data from a broken earlier sync run.
-- Targets only orders where status is UNKNOWN *and* created_at is null,
-- which precisely identifies rows that never received valid Shopee data.
-- The 204 valid COMPLETED orders are unaffected.
DELETE FROM orders
WHERE platform = 'Shopee'
  AND status = 'UNKNOWN'
  AND created_at IS NULL;
