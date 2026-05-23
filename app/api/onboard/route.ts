import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      businessName, 
      ownerEmail, 
      ownerPhone, 
      splitModel, 
      payoutPhone, 
      tillNumber 
    } = body;

    // 1. Validation Checks
    if (!businessName || !ownerEmail || !ownerPhone || !splitModel) {
      return NextResponse.json({ error: 'Missing mandatory onboarding details.' }, { status: 400 });
    }

    // Format instance name from business name (alphanumeric only)
    const instanceSlug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const instanceName = `${instanceSlug}-${Math.random().toString(36).substring(2, 6)}`;

    // 2. Register Merchant Profile in Supabase
    // Format phone to E.164 (+254...)
    let formattedPhone = ownerPhone.replace(/\s+/g, '').replace('+', '');
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.slice(1);
    const whatsappId = `+${formattedPhone}`;

    // Upsert merchant profile
    let { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('whatsapp_id', whatsappId)
      .maybeSingle();

    if (profErr) throw new Error(`Profile query failed: ${profErr.message}`);

    if (!profile) {
      const { data: newProfile, error: insErr } = await supabase
        .from('profiles')
        .insert([{ whatsapp_id: whatsappId, state: 'REGISTERED', role: 'ADMIN' }])
        .select('*')
        .single();
      
      if (insErr) throw new Error(`Profile creation failed: ${insErr.message}`);
      profile = newProfile;
    } else {
      // Force update to ADMIN role in case they were registered as user
      await supabase.from('profiles').update({ role: 'ADMIN', state: 'REGISTERED' }).eq('id', profile.id);
    }

    // 3. Register Shop in Supabase (Approved automatically via Form portal)
    const expiresAt = splitModel === 'flat' 
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30-day initial trial/paid window
      : null;

    const { data: shop, error: shopErr } = await supabase
      .from('shops')
      .insert([{
        owner_id: profile.id,
        name: businessName,
        owner_phone: ownerPhone,
        contact_email: ownerEmail,
        is_active: true,
        is_approved: true,
        split_model: splitModel,
        merchant_payout_phone: splitModel === 'commission' ? payoutPhone : null,
        merchant_till_number: splitModel === 'flat' ? tillNumber : null,
        wa_instance_name: instanceName,
        subscription_expires_at: expiresAt,
        delivery_info: 'Delivery within Nairobi CBD • 30–45 min'
      }])
      .select('*')
      .single();

    if (shopErr) throw new Error(`Shop registration failed: ${shopErr.message}`);

    // 4. Call Evolution API to initialize WhatsApp Session Instance
    console.log(`[Evolution Onboarding] Initializing instance for ${instanceName}...`);
    try {
      await axios.post(
        `${EVOLUTION_API_URL}/instance/create`,
        {
          instanceName: instanceName,
          token: `token_${instanceName}_${Date.now().toString().slice(-6)}`,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        },
        {
          headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' }
        }
      );
    } catch (createErr: any) {
      console.warn(`[Evolution Instance warning] Instance might already exist or creation lagged:`, createErr.response?.data ?? createErr.message);
    }

    // 5. Retrieve base64 connection QR code
    let qrcodeBase64 = '';
    try {
      const qrRes = await axios.get(
        `${EVOLUTION_API_URL}/instance/connect/${instanceName}`,
        {
          headers: { apikey: EVOLUTION_API_KEY }
        }
      );
      
      // Evolution API connects base64 code under base64 or code keys
      qrcodeBase64 = qrRes.data.base64 || qrRes.data.code || '';
    } catch (qrErr: any) {
      console.error(`[Evolution Connect Error] Failed to fetch QR code:`, qrErr.message);
    }

    return NextResponse.json({
      success: true,
      shopId: shop.id,
      instanceName: instanceName,
      qrcode: qrcodeBase64, // base64 QR code image string
      subscription_expires_at: expiresAt
    });

  } catch (err: any) {
    console.error('[Onboarding API Error]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
