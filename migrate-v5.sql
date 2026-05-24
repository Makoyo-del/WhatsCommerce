-- WhatsCommerce v5 Migration — Paste this into the Supabase SQL Editor and click Run
-- 1. Add delivery fee column to shops
ALTER TABLE shops ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;

-- 2. Create speed indices
CREATE INDEX IF NOT EXISTS shops_delivery_fee_idx ON shops (delivery_fee);
