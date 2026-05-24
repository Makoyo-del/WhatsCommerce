import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function POST(request: Request) {
  // Secure this endpoint
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, any> = {};

  try {
    // 1. Get all instances currently registered in Evolution API
    const listRes = await axios.get(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_API_KEY },
      timeout: 5000
    });

    const allInstances: string[] = (listRes.data || []).map((i: any) =>
      i.instance?.instanceName || i.name || i.instanceName
    ).filter(Boolean);

    results.allEvolutionInstances = allInstances;

    // 2. Get all instance names that are currently valid in the DB
    const { data: activeShops } = await supabase
      .from('shops')
      .select('wa_instance_name, name')
      .not('wa_instance_name', 'is', null);

    const validInstances = new Set((activeShops || []).map((s: any) => s.wa_instance_name));
    results.validDBInstances = [...validInstances];

    // 3. Delete ghost instances (in Evolution but NOT in DB)
    const ghosts = allInstances.filter(name => !validInstances.has(name));
    results.ghostsDeleted = [];

    for (const ghost of ghosts) {
      try {
        await axios.delete(`${EVOLUTION_API_URL}/instance/delete/${ghost}`, {
          headers: { apikey: EVOLUTION_API_KEY },
          timeout: 5000
        });
        results.ghostsDeleted.push(ghost);
        console.log(`[Admin Fix] Deleted ghost instance: ${ghost}`);
      } catch (e: any) {
        results.ghostsDeleted.push(`${ghost} (error: ${e.message})`);
      }
    }

    // 4. Logout active instances to clear corrupted Signal sessions
    // This forces the merchant to re-scan QR — required after SessionError decryption failures
    const logoutResults = [];
    for (const instanceName of validInstances) {
      try {
        await axios.delete(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          headers: { apikey: EVOLUTION_API_KEY },
          timeout: 5000
        });
        logoutResults.push(`${instanceName}: logged out ✓`);
        console.log(`[Admin Fix] Logged out instance: ${instanceName}`);
      } catch (e: any) {
        logoutResults.push(`${instanceName}: ${e.response?.data?.message || e.message}`);
      }
    }
    results.logoutResults = logoutResults;

    return NextResponse.json({
      success: true,
      message: 'Ghost instances deleted. Active sessions logged out — merchant must re-scan QR.',
      ...results
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
