-- WhatsCommerce v3 Migration — Paste this into the Supabase SQL Editor and click Run

-- 1. Add connection and manual approval columns to shops
ALTER TABLE shops ADD COLUMN IF NOT EXISTS wa_instance_name VARCHAR(100) UNIQUE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS wa_connection_status VARCHAR(50) DEFAULT 'DISCONNECTED';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

-- 2. Create indices for speed
CREATE INDEX IF NOT EXISTS shops_wa_instance_idx ON shops (wa_instance_name);
CREATE INDEX IF NOT EXISTS shops_is_approved_idx ON shops (is_approved);
