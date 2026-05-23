-- WhatsCommerce v4 Migration — Paste this into the Supabase SQL Editor and click Run

-- 1. Add subscription and routing columns to shops
ALTER TABLE shops ADD COLUMN IF NOT EXISTS split_model VARCHAR(20) DEFAULT 'commission'; -- 'flat' or 'commission'
ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS merchant_payout_phone VARCHAR(50) DEFAULT NULL; -- M-Pesa number for 95% B2C splits
ALTER TABLE shops ADD COLUMN IF NOT EXISTS merchant_till_number VARCHAR(50) DEFAULT NULL; -- Merchant's physical Lipa na M-Pesa Till

-- 2. Add verification indices
CREATE INDEX IF NOT EXISTS shops_split_model_idx ON shops (split_model);
CREATE INDEX IF NOT EXISTS shops_subscription_expires_idx ON shops (subscription_expires_at);
