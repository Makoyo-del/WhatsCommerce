import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

export async function GET() {
  const pings: Array<{ shop: string; instance: string; state: string; reconnected: boolean; webhookRegistered: boolean; error?: string }> = [];

  const BASE_URL = process.env.BASE_URL;
  const WEBHOOK_TOKEN = process.env.EVOLUTION_WEBHOOK_TOKEN;

  try {
    // 1. Fetch all active and approved merchant shops
    const { data: shops, error: dbErr } = await supabase
      .from('shops')
      .select('wa_instance_name, name')
      .eq('is_active', true)
      .eq('is_approved', true);

    if (dbErr) {
      throw new Error(`Failed to query shops from Supabase: ${dbErr.message}`);
    }

    // 2. Query each active instance to verify and maintain its Baileys socket connection
    if (shops && shops.length > 0 && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      for (const shop of shops) {
        if (!shop.wa_instance_name) continue;

        let state = 'unknown';
        let reconnected = false;
        let webhookRegistered = false;
        let errorMsg = undefined;

        try {
          // Step A: Check connection state
          const stateRes = await axios.get(
            `${EVOLUTION_API_URL}/instance/connectionState/${shop.wa_instance_name}`,
            {
              headers: { apikey: EVOLUTION_API_KEY },
              timeout: 4000
            }
          );
          state = stateRes.data?.instance?.state || stateRes.data?.state || 'unknown';

          // Step B: If disconnected, trigger reconnect
          if (state !== 'open') {
            console.log(`[Keep-Alive] Session for ${shop.name} (${shop.wa_instance_name}) is ${state}. Re-triggering connection...`);
            await axios.get(
              `${EVOLUTION_API_URL}/instance/connect/${shop.wa_instance_name}`,
              {
                headers: { apikey: EVOLUTION_API_KEY },
                timeout: 5000
              }
            );
            reconnected = true;
          }

          // Step C: ALWAYS re-register the webhook on every ping cycle.
          // This is the critical fix: Render container restarts wipe Evolution API's in-memory
          // webhook registrations. Without re-registering, messages arrive at Evolution API
          // but are never forwarded to Next.js — making the bot go completely silent.
          if (BASE_URL && WEBHOOK_TOKEN) {
            await axios.post(
              `${EVOLUTION_API_URL}/webhook/set/${shop.wa_instance_name}`,
              {
                webhook: {
                  enabled: true,
                  url: `${BASE_URL}/api/webhook`,
                  headers: {
                    'x-webhook-token': WEBHOOK_TOKEN
                  },
                  events: [
                    'MESSAGES_UPSERT',
                    'CONNECTION_UPDATE'
                  ]
                }
              },
              {
                headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
                timeout: 5000
              }
            );
            webhookRegistered = true;
          }

        } catch (err: any) {
          errorMsg = err.response?.data?.message || err.message;
          console.error(`[Keep-Alive Warning] Could not maintain session for ${shop.name}:`, errorMsg);
        }

        pings.push({
          shop: shop.name,
          instance: shop.wa_instance_name,
          state,
          reconnected,
          webhookRegistered,
          ...(errorMsg && { error: errorMsg })
        });
      }
    }

    return NextResponse.json({
      status: 'ok',
      alive: true,
      timestamp: new Date().toISOString(),
      activeInstancesChecked: pings.length,
      instances: pings
    });

  } catch (err: any) {
    console.error('[Keep-Alive Ping General Error]', err.message);
    return NextResponse.json({
      status: 'error',
      alive: true,
      timestamp: new Date().toISOString(),
      error: err.message
    }, { status: 500 });
  }
}

