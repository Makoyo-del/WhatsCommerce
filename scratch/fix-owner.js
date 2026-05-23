const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const REAL_OWNER_NUMBER = '+254794877125';
const DUMMY_ID = 'demo_admin_whatscommerce';

async function fixOwner() {
  console.log('🚀 Starting Database Ownership Transfer...');

  // 1. Check if the real profile exists
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('whatsapp_id', REAL_OWNER_NUMBER)
    .single();

  if (!profile) {
    console.log('📝 Creating real profile for owner...');
    const { data, error } = await supabase
      .from('profiles')
      .insert([{ 
        whatsapp_id: REAL_OWNER_NUMBER, 
        state: 'REGISTERED'
      }])
      .select()
      .single();
    profile = data;
    if (error) {
      console.error('❌ Error creating profile:', error);
      return;
    }
  }

  // 2. Find dummy admin UUID
  const { data: dummyProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('whatsapp_id', DUMMY_ID)
    .single();

  if (dummyProfile) {
    console.log(`🔗 Transferring shops from ${DUMMY_ID} (${dummyProfile.id}) to ${REAL_OWNER_NUMBER} (${profile.id})...`);
    const { error: shopError } = await supabase
      .from('shops')
      .update({ owner_id: profile.id })
      .eq('owner_id', dummyProfile.id);

    if (shopError) {
      console.error('❌ Error transferring shops:', shopError);
    } else {
      console.log('✅ Shops transferred successfully.');
      
      // Clean up the dummy admin
      console.log('🧹 Cleaning up dummy admin profile...');
      await supabase.from('profiles').delete().eq('id', dummyProfile.id);
    }
  } else {
    console.log('ℹ️ No dummy admin found. You might already be the owner.');
  }

  console.log('✨ Transfer Complete.');
}

fixOwner();
