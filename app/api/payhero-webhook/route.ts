import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { messenger } from '@/lib/messenger';
import { payhero } from '@/lib/payhero';

const BASE_URL = process.env.BASE_URL ?? 'https://opportunities-xi.vercel.app';

export async function POST(req: NextRequest) {
  try {
    // 0. Security Verification: Validate webhook token
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const expectedToken = process.env.PAYHERO_WEBHOOK_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      console.warn('[PayHero Webhook Warning] Unauthorized webhook request ignored.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // 1. Verify payment status is successful
    if (body.Status !== 'Success' && body.status !== 'Success') {
      console.warn('[PayHero Webhook] Received unsuccessful transaction notification — ignoring.');
      return NextResponse.json({ ok: true });
    }

    // Extract transaction metadata
    const orderId = body.ExternalReference || body.external_reference;
    const amountPaid = parseFloat(body.Amount || body.amount); // total paid in KSh

    if (!orderId) {
      console.warn('[PayHero Webhook] Missing order reference.');
      return NextResponse.json({ ok: true });
    }

    // 1.5. Intercept and handle dynamic shop subscription renewals
    if (orderId.startsWith('renew_')) {
      const shopId = orderId.replace('renew_', '');
      
      const { data: shop } = await supabase
        .from('shops')
        .select('*, owner:profiles!owner_id(*)')
        .eq('id', shopId)
        .single();

      if (!shop || !shop.owner) {
        console.error('[PayHero Webhook] Renewal failed: Shop or owner not found for ID:', shopId);
        return NextResponse.json({ ok: true });
      }

      const currentExpiry = shop.subscription_expires_at ? new Date(shop.subscription_expires_at) : new Date();
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await supabase
        .from('shops')
        .update({ 
          is_active: true, 
          subscription_expires_at: newExpiry 
        })
        .eq('id', shopId);

      await messenger.sendText(
        shop.owner.whatsapp_id,
        `✅ *WhatsCommerce Subscription Renewed!*\n\n` +
        `Thank you for your payment of *KSh ${amountPaid.toLocaleString()}*.\n\n` +
        `Your WhatsApp storefront *${shop.name}* has been successfully reactivated and is valid for another 30 days!\n\n` +
        `📅 New Expiration: *${new Date(newExpiry).toLocaleDateString()}*\n\n` +
        `Let's keep selling! 🚀`,
        shop.wa_instance_name
      );

      return NextResponse.json({ ok: true });
    }

    // 2. Fetch order details from database
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      console.error('[PayHero Webhook] Order record not resolved for reference:', orderId);
      return NextResponse.json({ ok: true });
    }

    // Check if the order is already processed to prevent duplicate payouts on retries
    if (order.status === 'PAID') {
      return NextResponse.json({ ok: true });
    }

    // 3. Mark the order as PAID in Supabase
    const { data: updatedOrder } = await supabase
      .from('orders')
      .update({ status: 'PAID', paystack_ref: body.CheckoutRequestID || 'payhero_ref' })
      .eq('id', orderId)
      .select('*')
      .single();

    // 4. Resolve the shop and owner configuration
    const { data: shop } = await supabase
      .from('shops')
      .select('*, owner:profiles!owner_id(*)')
      .eq('id', order.shop_id)
      .single();

    if (!shop || !shop.owner) {
      console.error('[PayHero Webhook] Shop or owner profile missing for shop_id:', order.shop_id);
      return NextResponse.json({ ok: true });
    }

    const ownerWhatsapp = shop.owner.whatsapp_id;
    const customerWhatsapp = order.customer_whatsapp;
    const instance = shop.wa_instance_name;

    if (!instance) {
      console.error(`[PayHero Webhook Error] wa_instance_name missing for shop: ${shop.name}`);
      return NextResponse.json({ ok: true });
    }

    // 5. IF MODEL B (COMMISSION SPLIT) -> EXECUTE PROGRAMMATIC INSTANT PAYOUT
    if (shop.split_model === 'commission') {
      // Calculate 95% merchant share (deducting your 5% platform cut upfront)
      const merchantShare = Math.round(amountPaid * 0.95);
      
      if (shop.merchant_payout_phone) {
        console.log(`[PayHero Split Split] Triggering instant B2C split payout: KSh ${merchantShare} to ${shop.merchant_payout_phone}`);
        try {
          await payhero.sendB2CPayout(shop.merchant_payout_phone, merchantShare, order.id);
        } catch (payoutErr: any) {
          console.error(`[PayHero Webhook B2C payout failed for shop ${shop.name}]`, payoutErr.message);
          // Alert Admin of payout failure so they can inspect immediately, but keep transaction complete
          await messenger.sendText(
            ownerWhatsapp,
            `⚠️ *Payout Failure Alert!*\n\nOrder #${order.id.slice(0, 8)} payment succeeded, but the automated B2C payout of KSh ${merchantShare} to your phone number ${shop.merchant_payout_phone} failed.\n\nError: ${payoutErr.message}`,
            instance
          );
        }
      } else {
        console.warn(`[PayHero Webhook Warning] Shop ${shop.name} is on Split model, but merchant_payout_phone is not set. Split held.`);
      }
    }

    // 6. Notify the shop owner (Alert)
    await messenger.sendText(
      ownerWhatsapp,
      `💰 *New Payment Received!*\n\n` +
      `Order: #${order.id.slice(0, 8)}\n` +
      `Amount: *KSh ${amountPaid.toLocaleString()}*\n` +
      `Customer: ${customerWhatsapp}\n\n` +
      `Please prepare the order for delivery. 🚀`,
      instance
    );

    // 7. Confirm to the Customer
    await messenger.sendText(
      customerWhatsapp,
      `✅ *Payment Confirmed!*\n\n` +
      `Amount: KSh ${amountPaid.toLocaleString()}\n` +
      `Your order is being prepared by *${shop.name}* and will be delivered shortly.\n\n` +
      `_Sending your official receipt..._`,
      instance
    );

    // Send the dynamic PDF receipt document
    const receiptUrl = `${BASE_URL}/api/receipt/${order.id}`;
    await messenger.sendDocument(
      customerWhatsapp,
      receiptUrl,
      `Receipt-${order.id.slice(0, 8)}.pdf`,
      instance
    );

    // Reset customer conversation session state
    await supabase.from('profiles')
      .update({ state: 'START', state_data: null })
      .eq('whatsapp_id', customerWhatsapp);

    await messenger.sendText(
      customerWhatsapp,
      `Thank you for ordering via WhatsCommerce! 🙏\n\nSession ended. Type *hi* anytime to start a new order.`,
      instance
    );

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('[PayHero Webhook Process Error]', err.message);
    return NextResponse.json({ ok: true });
  }
}
