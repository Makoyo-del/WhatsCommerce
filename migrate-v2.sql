-- WhatsCommerce v2 — Paste ALL of this into Supabase SQL Editor and click Run

-- Add missing enum states for the new cart flow
ALTER TYPE onboarding_state ADD VALUE IF NOT EXISTS 'CART_REVIEW';
ALTER TYPE onboarding_state ADD VALUE IF NOT EXISTS 'CART_CONFIRM';

ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state_data JSONB DEFAULT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';

CREATE TABLE IF NOT EXISTS carts (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_whatsapp TEXT NOT NULL,
  shop_id           UUID REFERENCES shops(id) ON DELETE CASCADE,
  items             JSONB NOT NULL DEFAULT '[]',
  total_price       NUMERIC DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS carts_customer_idx ON carts (customer_whatsapp);
