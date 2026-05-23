// update-menu.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const newMenu = [
  { name: 'Beef Stew & Ugali', price: 350, category: 'General' },
  { name: 'Chicken Pilau', price: 450, category: 'General' },
  { name: 'Fried Tilapia & Ugali', price: 550, category: 'General' },
  { name: 'Chapati & Ndengu', price: 200, category: 'General' },
  { name: 'Fresh Mango Juice', price: 120, category: 'General' },
];

async function run() {
  console.log('Updating Mama Wanjiru\'s Kitchen menu...');

  // 1. Find the active shop
  const { data: shop } = await supabase
    .from('shops')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!shop) {
    console.error('No active shop found!');
    return;
  }

  console.log(`Found shop: ${shop.name} (${shop.id})`);

  // 2. Clear existing products (optional, but cleaner for this request)
  await supabase.from('products').delete().eq('shop_id', shop.id);

  // 3. Insert new products
  const productsToInsert = newMenu.map(p => ({
    ...p,
    shop_id: shop.id,
    is_available: true
  }));

  const { error } = await supabase.from('products').insert(productsToInsert);

  if (error) {
    console.error('Error inserting products:', error.message);
  } else {
    console.log('Successfully updated menu!');
  }
}

run();
