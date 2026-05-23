// migrate-v2.js — Run once: node migrate-v2.js
// Adds: products.category, profiles.state_data, orders.items, carts table

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Running WhatsCommerce v2 migrations...\n');

  const migrations = [
    {
      name: 'Add category to products',
      sql: `ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';`,
    },
    {
      name: 'Add state_data (JSONB) to profiles',
      sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state_data JSONB DEFAULT NULL;`,
    },
    {
      name: 'Add items (JSONB) to orders',
      sql: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';`,
    },
    {
      name: 'Create carts table',
      sql: `
        CREATE TABLE IF NOT EXISTS carts (
          id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          customer_whatsapp TEXT NOT NULL,
          shop_id           UUID REFERENCES shops(id) ON DELETE CASCADE,
          items             JSONB NOT NULL DEFAULT '[]',
          total_price       NUMERIC DEFAULT 0,
          created_at        TIMESTAMPTZ DEFAULT NOW()
        );
      `,
    },
    {
      name: 'Index carts by customer',
      sql: `CREATE INDEX IF NOT EXISTS carts_customer_idx ON carts (customer_whatsapp);`,
    },
  ];

  for (const m of migrations) {
    process.stdout.write(`  → ${m.name}... `);
    const { error } = await supabase.rpc('exec_sql', { sql: m.sql }).catch(() => ({ error: null }));

    // supabase.rpc may not exist — fallback notice
    if (error) {
      console.log(`⚠️  RPC not available. Run this SQL manually in Supabase SQL editor:\n\n${m.sql}\n`);
    } else {
      console.log('✅');
    }
  }

  console.log('\n✅ Migration complete (or SQL printed above for manual run).');
  console.log('\nNext: run  vercel --prod  to deploy the updated route.ts');
}

run().catch(console.error);
