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

    // Check if a shop already exists for this owner to make retries fully idempotent
    const { data: existingShop, error: existShopErr } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', profile.id)
      .maybeSingle();

    if (existShopErr) throw new Error(`Shop lookup failed: ${existShopErr.message}`);

    // If shop already exists, reuse its existing instance slug; otherwise, generate one
    let instanceName = existingShop?.wa_instance_name;
    if (!instanceName) {
      const instanceSlug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      instanceName = `${instanceSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    // 3. Register or Update Shop in Supabase (Approved automatically via Form portal)
    const expiresAt = splitModel === 'flat' 
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30-day initial trial/paid window
      : null;

    let shop;
    if (existingShop) {
      // Update existing shop settings
      const { data: updatedShop, error: shopErr } = await supabase
        .from('shops')
        .update({
          name: businessName,
          owner_phone: ownerPhone,
          contact_email: ownerEmail,
          is_active: true,
          is_approved: true,
          split_model: splitModel,
          merchant_payout_phone: splitModel === 'commission' ? payoutPhone : null,
          merchant_till_number: splitModel === 'flat' ? tillNumber : null,
          wa_instance_name: instanceName,
          subscription_expires_at: expiresAt
        })
        .eq('id', existingShop.id)
        .select('*')
        .single();

      if (shopErr) throw new Error(`Shop settings update failed: ${shopErr.message}`);
      shop = updatedShop;
    } else {
      // Insert new shop
      const { data: newShop, error: shopErr } = await supabase
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
      shop = newShop;
    }

    // 4. Check if the WhatsApp session is already connected
    let isConnected = false;
    if (existingShop && instanceName) {
      try {
        console.log(`[Evolution Onboarding] Checking connection state for ${instanceName}...`);
        const stateRes = await axios.get(
          `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
          {
            headers: { apikey: EVOLUTION_API_KEY }
          }
        );
        const state = stateRes.data?.instance?.state || stateRes.data?.state;
        if (state === 'open') {
          isConnected = true;
          console.log(`[Evolution Onboarding] Instance ${instanceName} is already connected! Skipping QR code generation.`);
        }
      } catch (stateErr: any) {
        console.warn(`[Evolution ConnectionState Warning] Could not check status for ${instanceName}:`, stateErr.message);
      }
    }

    let qrcodeBase64 = '';

    if (isConnected) {
      // If already connected, return a beautiful success checkmark SVG badge as the image so it shows "CONNECTED!" on the screen and doesn't crash the frontend.
      qrcodeBase64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMjIwIiBoZWlnaHQ9IjIyMCI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNDUiIGZpbGw9IiMxMGI5ODEiIC8+PHBhdGggZD0iTTM1IDUwIEw0NSA2MCBMNjUgNDAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBmaWxsPSJub25lIiAvPjx0ZXh0IHg9IjUwIiB5PSI4MCIgZm9udC1mYW1pbHk9Ik91dGZpdCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DT05ORUNURUQhPC90ZXh0Pjwvc3ZnPg==';
    } else {
      // 5. Call Evolution API to initialize WhatsApp Session Instance
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

      // 6. Configure Webhook for this instance (Nested properly under the "webhook" property!)
      console.log(`[Evolution Onboarding] Setting webhook for ${instanceName}...`);
      try {
        const webhookUrl = `${process.env.BASE_URL}/api/webhook`;
        const webhookToken = process.env.EVOLUTION_WEBHOOK_TOKEN!;
        
        await axios.post(
          `${EVOLUTION_API_URL}/webhook/set/${instanceName}`,
          {
            webhook: {
              enabled: true,
              url: webhookUrl,
              headers: {
                "x-webhook-token": webhookToken
              },
              events: [
                "MESSAGES_UPSERT",
                "CONNECTION_UPDATE"
              ]
            }
          },
          {
            headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' }
          }
        );
        console.log(`[Evolution Onboarding] Webhook successfully set for ${instanceName}!`);
      } catch (webErr: any) {
        console.error(`[Evolution Onboarding Webhook Error] Failed to set webhook:`, webErr.response?.data ?? webErr.message);
      }

      // 7. Retrieve base64 connection QR code
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
    }

    return NextResponse.json({
      success: true,
      shopId: shop.id,
      instanceName: instanceName,
      qrcode: qrcodeBase64, // base64 QR code image string or success checkmark
      subscription_expires_at: expiresAt
    });

  } catch (err: any) {
    console.error('[Onboarding API Error]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
