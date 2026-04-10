ALTER TABLE orders ADD COLUMN IF NOT EXISTS details_synced boolean DEFAULT false;
UPDATE orders SET details_synced = true WHERE revenue > 0;
