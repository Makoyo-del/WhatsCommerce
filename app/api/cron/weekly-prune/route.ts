import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { messenger } from '@/lib/messenger';

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL    = process.env.BASE_URL ?? 'https://opportunities-xi.vercel.app';

async function handleWeeklyPrune(req: NextRequest) {
  // 1. Authorization Gate (inspect header or query parameter)
  const authHeader = req.headers.get('authorization');
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get('secret');

  const isAuthorized = 
    authHeader === `Bearer ${CRON_SECRET}` || 
    (secretParam && secretParam === CRON_SECRET);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Fetch all approved active shops
  const { data: shops } = await supabase
    .from('shops')
    .select('*, owner:profiles!owner_id(*)')
    .eq('is_active', true)
    .eq('is_approved', true);

  if (!shops || shops.length === 0) {
    return NextResponse.json({ message: 'No active approved shops to prune.' });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7); // past 7 days boundary
  let successCount = 0;
  const processedShops: string[] = [];

  for (const shop of shops) {
    const ownerWhatsapp = shop.owner?.whatsapp_id;
    const instance = shop.wa_instance_name;

    if (!ownerWhatsapp || !instance) {
      console.warn(`[Cron Weekly Prune] Shop ${shop.name} is missing owner WhatsApp or Evolution instance name.`);
      continue;
    }

    try {
      // a. Generate and deliver the A4 Weekly PDF Report URL
      const reportUrl = `${BASE_URL}/api/report/${shop.id}?range=weekly`;
      const filename = `Weekly-Ledger-${shop.name.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;

      // b. Send PDF document via Evolution API
      await messenger.sendDocument(ownerWhatsapp, reportUrl, filename, instance);

      // c. Send database pruning explanation alert
      await messenger.sendText(
        ownerWhatsapp,
        `📅 *Weekly Business Report Generated!*\n\n` +
        `Attached above is your official financial ledger for *${shop.name}* over the last 7 days.\n\n` +
        `⚠️ *Database Cleared:* In alignment with database efficiency standards, your historical transaction records have been pruned from our active tables.\n\n` +
        `*Please save the attached PDF securely for your permanent business records.* 🙏`,
        instance
      );

      // d. Hard Delete paid orders older than 7 days for this specific shop
      const { count, error: delErr } = await supabase
        .from('orders')
        .delete({ count: 'exact' })
        .eq('shop_id', shop.id)
        .eq('status', 'PAID')
        .lte('created_at', startDate.toISOString());

      if (delErr) {
        console.error(`[Prune Error] Failed to delete orders for shop ${shop.name}:`, delErr.message);
      } else {
        console.log(`[Prune Success] Deleted ${count} paid orders for shop ${shop.name}`);
        successCount++;
        processedShops.push(shop.name);
      }

      // e. Clean up any unpaid/abandoned pending orders older than 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      await supabase
        .from('orders')
        .delete()
        .eq('shop_id', shop.id)
        .neq('status', 'PAID')
        .lte('created_at', oneDayAgo.toISOString());

    } catch (err: any) {
      console.error(`[Cron Weekly Prune Error] Failed for shop ${shop.name}:`, err.message);
    }
  }

  return NextResponse.json({ 
    success: true, 
    shopsProcessedCount: processedShops.length, 
    shopsProcessed: processedShops,
    completedAt: new Date().toISOString()
  });
}

// Support both GET and POST for convenience
export async function GET(req: NextRequest) {
  return handleWeeklyPrune(req);
}

export async function POST(req: NextRequest) {
  return handleWeeklyPrune(req);
}
