import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { payhero } from '@/lib/payhero';
import { messenger } from '@/lib/messenger';
import axios from 'axios';

const EVOLUTION_API_URL     = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY     = process.env.EVOLUTION_API_KEY!;
const EVOLUTION_WEBHOOK_TOKEN = process.env.EVOLUTION_WEBHOOK_TOKEN!;
const BASE_URL              = process.env.BASE_URL ?? 'https://opportunities-xi.vercel.app';

// ─── Local aliases for messenger (configured dynamically with instance) ───────────
const sendMessage = (to: string, body: string, instance: string) => messenger.sendText(to, body, instance);
const sendImageMessage = (to: string, url: string, caption: string, instance: string) => messenger.sendImage(to, url, caption, instance);

/**
 * Downloads media file from Evolution API and decodes the base64 payload
 */
async function downloadEvolutionMedia(messageInfo: any, instance: string): Promise<Buffer> {
  const res = await axios.post(
    `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instance}`,
    {
      message: messageInfo
    },
    {
      headers: { apikey: EVOLUTION_API_KEY }
    }
  );

  const base64Data = res.data.base64 || res.data;
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  return Buffer.from(cleanBase64, 'base64');
}

/**
 * Uploads Evolution API message image to Supabase Storage
 */
async function uploadEvolutionImageToSupabase(messageInfo: any, shopId: string, instance: string): Promise<string> {
  const buffer = await downloadEvolutionMedia(messageInfo, instance);
  const mediaId = messageInfo?.key?.id || `img_${Date.now()}`;
  const filename = `products/${shopId}/${mediaId}.jpg`;

  const { error } = await supabase.storage
    .from('whatscommerce')
    .upload(filename, buffer, { contentType: 'image/jpeg', upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from('whatscommerce').getPublicUrl(filename);
  return urlData.publicUrl;
}

// ─── Build the consolidated numbered menu grid ────────────────────────────────
function buildMenuText(shopName: string, deliveryInfo: string, products: any[]): { text: string; index: Record<number, any> } {
  const groups: Record<string, any[]> = {};
  for (const p of products) {
    const cat = p.category ?? 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  }

  const index: Record<string, any> = {};
  let num = 1;
  let text = `🛍️ *${shopName} — Menu*\n━━━━━━━━━━━━━━━━━━\n`;

  for (const [cat, items] of Object.entries(groups)) {
    text += `  ${cat.toUpperCase()}\n━━━━━━━━━━━━━━━━━━\n`;
    for (const p of items) {
      index[num.toString()] = { id: p.id, name: p.name, price: p.price, image_url: p.image_url };
      const namePad = p.name.padEnd(18, ' ');
      text += `${num}. ${namePad} KSh ${p.price}\n`;
      num++;
    }
  }

  text += `━━━━━━━━━━━━━━━━━━\n📍 Delivery: ${deliveryInfo}\n━━━━━━━━━━━━━━━━━━\n\nReply with the item number and quantity.\nFor example, to order 2 of item #1 and 1 of item #3, reply:\n1x2, 3x1\n\nType cancel to start over.`;
  return { text, index };
}

// ─── Parse cart reply e.g. "1x2, 3x1" ────────────────────────────────
function parseCartReply(raw: string): Array<{ num: number; qty: number }> | null {
  const parts = raw.split(',').map(s => s.trim().replace(/^[*_~]+|[*_~]+$/g, ''));
  const result: Array<{ num: number; qty: number }> = [];

  for (const part of parts) {
    const match = part.match(/^(\d+)\s*[xX×\*\-]\s*(\d+)$/);
    if (!match) return null;
    result.push({ num: parseInt(match[1]), qty: parseInt(match[2]) });
  }
  return result.length > 0 ? result : null;
}

// ─── Format and Validate M-Pesa Number ──────────────────────────────────
function formatMpesaNumber(phone: string): string | null {
  const clean = phone.replace(/[^\d]/g, '');
  if (clean.length === 10 && clean.startsWith('0')) {
    return '254' + clean.slice(1);
  }
  if (clean.length === 9 && (clean.startsWith('7') || clean.startsWith('1'))) {
    return '254' + clean;
  }
  if (clean.length === 12 && clean.startsWith('254')) {
    return clean;
  }
  return null;
}

// GET: Verifies connection endpoint status
export async function GET() {
  return NextResponse.json({ active: true, service: 'WhatsCommerce Webhook' });
}

// POST: Main webhook event receiver for Evolution API
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log(`[Webhook Event Received] Instance: ${body.instance}, Event: ${body.event}`);

    // 1. Webhook Signature Authorization Check
    const webhookToken = req.headers.get('x-webhook-token');
    console.log(`[Webhook Auth Check] Header Token: ${webhookToken ? 'Exists' : 'Missing'}, Expected: ${EVOLUTION_WEBHOOK_TOKEN ? 'Exists' : 'Missing'}`);
    if (webhookToken !== EVOLUTION_WEBHOOK_TOKEN) {
      console.warn('[Webhook Warning] Unauthorized webhook request ignored. Received: ' + webhookToken);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }



    // 3. Extract instance details
    const instance = body.instance;
    if (!instance) {
      return NextResponse.json({ error: 'Missing instance name' }, { status: 400 });
    }

    // 4. Resolve the merchant shop from instance
    console.log(`[Webhook Db Lookup] Finding shop for wa_instance_name: ${instance}...`);
    const { data: shop } = await supabase
      .from('shops')
      .select('*')
      .eq('wa_instance_name', instance)
      .single();

    if (!shop) {
      console.warn(`[Webhook Warning] Shop not resolved in database for instance: ${instance}`);
      return NextResponse.json({ ok: true });
    }
    console.log(`[Webhook Success] Resolved shop: ${shop.name} (ID: ${shop.id}), is_approved: ${shop.is_approved}, is_active: ${shop.is_active}`);

    // Check manual approval and subscription expiration gate
    const now = new Date();
    const isExpired = shop.split_model === 'flat' && 
                      shop.subscription_expires_at && 
                      new Date(shop.subscription_expires_at) < now;

    if (isExpired || !shop.is_approved || !shop.is_active) {
      const senderJid = body.data?.key?.remoteJid || '';
      const cleanSender = senderJid.split('@')[0];
      const { data: ownerProfile } = await supabase.from('profiles').select('id').eq('whatsapp_id', `+${cleanSender}`).maybeSingle();
      const isOwner = (ownerProfile && ownerProfile.id === shop.owner_id) || body.data?.key?.fromMe;

      // If it's a customer, show offline notice
      if (!isOwner) {
        if (isExpired && shop.is_active) {
          // Auto-disable in database to save future cycles
          await supabase.from('shops').update({ is_active: false }).eq('id', shop.id);
        }
        await messenger.sendText(
          cleanSender,
          `⚠️ *Store Currently Offline*\n\nThis storefront is currently offline due to a pending monthly subscription renewal. Please contact the seller directly to complete your purchase.`,
          instance
        );
        return NextResponse.json({ ok: true });
      }
      
      // If the owner themselves is texting their expired/inactive shop, let them process /renew or /help!
      const text = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text || '';
      const lowerText = text.toLowerCase().trim();
      
      if (lowerText !== '/renew' && lowerText !== '/help') {
        await messenger.sendText(
          cleanSender,
          `⚠️ *WhatsCommerce Subscription Expired!*\n\n` +
          `Your storefront *${shop.name}* is paused because your flat monthly subscription has expired.\n\n` +
          `👉 *How to renew instantly:* Reply with \`/renew\` right here to trigger an KSh 3,500 M-Pesa STK Push prompt to your phone and instantly reactivate your storefront!`,
          instance
        );
        return NextResponse.json({ ok: true });
      }
    }

    // 5. Parse WhatsApp Payload Fields
    const remoteJid = body.data?.key?.remoteJid || '';
    const rawNumber = remoteJid.split('@')[0].replace('+', '').trim();
    const senderId = `+${rawNumber}`;

    const msg = body.data?.message;
    if (!msg) return NextResponse.json({ ok: true });

    const text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '';
    const messageId = body.data?.key?.id || `msg_${Date.now()}`;
    const msgType = body.data?.messageType || 'conversation';

    // 2. Filter out bot's own outgoing replies to prevent loops,
    // but allow the admin's own manual commands starting with "/"
    if (body.data?.key?.fromMe && !text.startsWith('/')) {
      return NextResponse.json({ ok: true });
    }

    // 6. Idempotency Check
    const { data: seen } = await supabase
      .from('processed_messages')
      .select('message_id')
      .eq('message_id', messageId)
      .maybeSingle();

    if (seen) return NextResponse.json({ ok: true });
    await supabase.from('processed_messages').insert([{ message_id: messageId }]);

    // 7. Hand over to Multi-tenant State Machine
    await handleMessage(senderId, text, msgType, messageId, shop, instance, body.data);
    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('[Webhook Route Process Error]', err.message);
    return NextResponse.json({ ok: true });
  }
}

async function handleMessage(
  senderId: string, 
  text: string, 
  msgType: string, 
  messageId: string, 
  shop: any, 
  instance: string,
  messageInfo?: any
) {
  const lowerText = text.toLowerCase().trim();

  // ── Upsert Profile ──────────────────────────────────────────────────────────
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('whatsapp_id', senderId)
    .maybeSingle();

  if (!profile) {
    const { data: newProfile, error: insertErr } = await supabase
      .from('profiles')
      .insert([{ whatsapp_id: senderId, state: 'START', role: 'USER' }])
      .select('*')
      .single();
    if (insertErr) {
      console.error('[DB] Profile insert error:', insertErr.message);
      return;
    }
    profile = newProfile;
  }

  const state = profile.state as string;
  const fromMe = messageInfo?.key?.fromMe === true;
  const isMerchantAdmin = (profile.role === 'ADMIN' && shop.owner_id === profile.id) || fromMe;

  // ── MERCHANT ADMIN COMMAND FLOW ─────────────────────────────────────────────
  if (isMerchantAdmin) {
    
    // a. Report PDF Generation Command
    if (lowerText === '/report daily' || lowerText === '/report weekly') {
      const range = lowerText.includes('daily') ? 'daily' : 'weekly';
      const reportUrl = `${BASE_URL}/api/report/${shop.id}?range=${range}`;
      const filename = `${range.charAt(0).toUpperCase() + range.slice(1)}-Ledger-${shop.name.replace(/\s+/g, '-')}.pdf`;
      
      await sendMessage(senderId, `📊 *Generating your A4 ${range} business report...*\nConnecting to secure billing ledger...`, instance);
      await messenger.sendDocument(senderId, reportUrl, filename, instance);
      return;
    }

    if (lowerText === '/list') {
      const { data: products } = await supabase.from('products').select('*').eq('shop_id', shop.id).eq('is_available', true).order('category').order('created_at', { ascending: true });
      if (!products || products.length === 0) { 
        await sendMessage(senderId, `Your menu is empty.\n\nAdd first product:\`/add [Name], KSh [Price], [Category]\``, instance); 
        return; 
      }
      const list = products.map((p, i) => `${i + 1}. *${p.name}* [${p.category ?? 'General'}] — KSh ${p.price}`).join('\n');
      await sendMessage(senderId, `📋 *Your Menu (${products.length} items):*\n\n${list}`, instance);
      return;
    }

    if (lowerText.startsWith('/delete ')) {
      const productName = text.slice(8).trim();
      const { data: deleted, error: delErr } = await supabase.from('products').delete().eq('shop_id', shop.id).ilike('name', productName).select().single();
      await sendMessage(senderId, (delErr || !deleted) ? `❌ Could not find "*${productName}*" in your menu.` : `✅ *${deleted.name}* removed.`, instance);
      return;
    }

    if (lowerText === '/orders') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: orders } = await supabase.from('orders').select('*').eq('shop_id', shop.id).eq('status', 'PAID').gte('created_at', today.toISOString()).order('created_at', { ascending: false });
      if (!orders || orders.length === 0) { 
        await sendMessage(senderId, `No paid orders today yet.`, instance); 
        return; 
      }
      const total = orders.reduce((sum, o) => sum + Number(o.total_price), 0);
      const list  = orders.map((o, i) => `${i + 1}. ${o.customer_whatsapp} — KSh ${o.total_price}`).join('\n');
      await sendMessage(senderId, `📦 *Today's Orders (${orders.length}):*\n\n${list}\n\n*Total: KSh ${total}*`, instance);
      return;
    }

    if (lowerText.startsWith('/delivery ')) {
      const newDelivery = text.slice(10).trim();
      if (!newDelivery) {
        await sendMessage(senderId, `❌ Use:\`/delivery [New Delivery Details]\`\nExample: _/delivery Delivery within Nairobi CBD & Kilimani • KSh 100_`, instance);
        return;
      }
      const { error: shopErr } = await supabase
        .from('shops')
        .update({ delivery_info: newDelivery })
        .eq('id', shop.id);
      if (shopErr) {
        await sendMessage(senderId, `❌ Failed to update delivery details: ${shopErr.message}`, instance);
      } else {
        await sendMessage(senderId, `✅ *Delivery Details Updated!*\n\nNew Delivery Info:\n"${newDelivery}"`, instance);
      }
      return;
    }

    if (lowerText === '/renew') {
      await sendMessage(senderId, `📲 *Initiating secure M-Pesa STK Push for subscription renewal...*\n\nAmount: *KSh 3,500*\nService: *WhatsCommerce 30-Day License*`, instance);
      try {
        await payhero.initiateStkPush(
          senderId,
          3500,
          `renew_${shop.id}`,
          { split_model: 'flat', merchant_till_number: process.env.PAYHERO_PLATFORM_CHANNEL_ID }
        );
      } catch (err: any) {
        await sendMessage(senderId, `❌ Failed to initiate payment: ${err.message}`, instance);
      }
      return;
    }

    if (lowerText === '/help') {
      await sendMessage(senderId,
        `📖 *Admin Commands:*\n\n` +
        `📸 Photo + \`/add [Name], [Price], [Category]\` — Add product with image\n` +
        `📝 \`/add [Name], [Price], [Category]\` — Add text-only product\n` +
        `📋 */list* — View menu\n` +
        `📊 */report daily* — Generate daily A4 PDF report\n` +
        `📈 */report weekly* — Generate weekly A4 PDF report\n` +
        `🗑️ */delete [Name]* — Remove product\n` +
        `📦 */orders* — Today's paid orders\n` +
        `📍 \`/delivery [Details]\` — Update delivery areas\n` +
        `🔄 \`/renew\` — Renew monthly license (KSh 3,500)`,
        instance
      );
      return;
    }

    // Image-based /add product with caption parsing
    const hasImage = msgType === 'imageMessage' || (messageInfo && msgType === 'image');
    if (hasImage && text.startsWith('/add')) {
      const caption = text.replace('/add', '').trim();
      const parts   = caption.split(',').map((s: string) => s.trim());
      const [name, priceStr, category] = parts;
      const price = parseFloat(priceStr);
      if (!name || isNaN(price) || price <= 0) {
        await sendMessage(senderId, `❌ Use:\`/add [Name], [Price], [Category]\`\n\nExample: _/add Beef Stew, 250, Main Dishes_`, instance);
        return;
      }
      try {
        await sendMessage(senderId, `⏳ *Uploading image to storage...*`, instance);
        const imageUrl = await uploadEvolutionImageToSupabase(messageInfo, shop.id, instance);
        await supabase.from('products').insert([{ shop_id: shop.id, name, price, category: category ?? 'General', image_url: imageUrl, is_available: true }]);
        await sendMessage(senderId, `✅ *${name}* (KSh ${price}) [${category ?? 'General'}] added to storefront!`, instance);
      } catch (err: any) {
        console.error('[Add Product Error]', err.message);
        await sendMessage(senderId, `❌ Failed to add product: ${err.message}`, instance);
      }
      return;
    }

    // Text-only /add product
    if (lowerText.startsWith('/add ') && !hasImage) {
      const caption = text.slice(5).trim();
      const parts   = caption.split(',').map((s: string) => s.trim());
      const [name, priceStr, category] = parts;
      const price = parseFloat(priceStr);
      if (!name || isNaN(price) || price <= 0) {
        await sendMessage(senderId, `❌ Use:\`/add [Name], [Price], [Category]\`\nExample: _/add Beef Stew, 250, Main Dishes_`, instance);
        return;
      }
      await supabase.from('products').insert([{ shop_id: shop.id, name, price, category: category ?? 'General', is_available: true }]);
      await sendMessage(senderId, `✅ *${name}* (KSh ${price}) [${category ?? 'General'}] added!\n\n_To add a photo, send the image directly with the caption:_ \`/add ${name}, ${price}, ${category ?? 'General'}\``, instance);
      return;
    }

    // Default admin fallback greeting to present the owner control panel commands instantly
    await sendMessage(senderId,
      `🏪 *WhatsCommerce — Merchant Admin Panel*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Welcome back! You are the authorized owner of *${shop.name}*.\n\n` +
      `Here is your direct command control panel. You do not need to guess:\n\n` +
      `📝 *Manage Your Store Menu & Operations:*\n` +
      `• Add product (with image): Send product photo + caption: \`/add [Name], [Price], [Category]\`\n` +
      `• Add product (text-only): \`/add [Name], [Price], [Category]\`\n` +
      `• View active menu: \`/list\`\n` +
      `• Delete a product: \`/delete [Name]\`\n` +
      `• Update delivery details: \`/delivery [New Details]\`\n\n` +
      `📊 *Business Ledger, Analytics & Billing:*\n` +
      `• Daily business ledger PDF: \`/report daily\`\n` +
      `• Weekly business ledger PDF: \`/report weekly\`\n` +
      `• Today's paid order list: \`/orders\`\n` +
      `• Renew 30-day monthly license: \`/renew\` (KSh 3,500)\n\n` +
      `💡 *Tip:* Type \`/help\` at any time to display this menu.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      instance
    );
    return;
  }

  // ── CUSTOMER FLOW (STATE MACHINE) ──────────────────────────────────────────
  switch (state) {

    // ── START ─────────────────────────────────────────────────────────────────
    case 'START': {
      if (['browse', 'menu', 'shop', 'hi', 'hello'].includes(lowerText)) {
        const { data: products } = await supabase.from('products').select('*').eq('shop_id', shop.id).eq('is_available', true).order('category').order('created_at', { ascending: true });
        if (!products || products.length === 0) { 
          await sendMessage(senderId, `*${shop.name}* has no products yet! Check back soon.`, instance); 
          break; 
        }
        const { text: menuText, index } = buildMenuText(shop.name, shop.delivery_info ?? 'Within Nairobi CBD', products);
        
        await supabase.from('profiles')
          .update({ state: 'CART_REVIEW', state_data: { shop_id: shop.id, index } })
          .eq('id', profile.id);

        await sendMessage(senderId, menuText, instance);
        break;
      }

      await sendMessage(senderId,
        `👋 Welcome to *${shop.name}*!\n\n` +
        `Order food and essentials directly here and check out instantly via M-Pesa.\n\n` +
        `Reply *BROWSE* or *MENU* to see what is available! 🛍️`,
        instance
      );
      break;
    }

    // ── CART_REVIEW ───────────────────────────────────────────────────────────
    case 'CART_REVIEW': {
      if (lowerText === 'cancel') {
        await supabase.from('profiles').update({ state: 'START', state_data: null }).eq('whatsapp_id', senderId);
        await sendMessage(senderId, `🔄 Cancelled. Type *menu* to browse again.`, instance);
        break;
      }

      if (lowerText === 'menu' || lowerText === 'hi') {
        const { data: products } = await supabase.from('products').select('*').eq('shop_id', shop.id).eq('is_available', true).order('category').order('created_at', { ascending: true });
        if (!products) break;
        const { text: menuText, index } = buildMenuText(shop.name, shop.delivery_info ?? 'Within Nairobi CBD', products);
        await supabase.from('profiles').update({ state_data: { shop_id: shop.id, index } }).eq('whatsapp_id', senderId);
        await sendMessage(senderId, menuText, instance);
        break;
      }

      const stateData = profile.state_data as any;
      const productIndex = stateData?.index ?? {};
      const parsed = parseCartReply(text);
      
      if (!parsed) {
        await sendMessage(senderId,
          `❌ I couldn't understand that format.\n\nPlease reply like this:\n1x2, 3x1\n(item number x quantity)\n\nOr type menu to see the menu again.`,
          instance
        );
        break;
      }

      // Validate all items exist in index
      const cartItems: Array<{ product_id: string; name: string; price: number; qty: number }> = [];
      let invalid = false;
      for (const { num, qty } of parsed) {
        const prod = productIndex[num];
        if (!prod || qty < 1) { 
          await sendMessage(senderId, `❌ Item *#${num}* not found. Type *menu* to see valid items.`, instance); 
          invalid = true; 
          break; 
        }
        cartItems.push({ product_id: prod.id, name: prod.name, price: prod.price, qty });
      }
      if (invalid) break;

      const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
      const deliveryFee = Number(shop.delivery_fee ?? 0);
      const grandTotal = subtotal + deliveryFee;

      // Build summary
      let summary = `🛒 *Order Summary*\n━━━━━━━━━━━━━━━━━━\n`;
      const uniqueItems: any[] = [];
      for (const item of cartItems) {
        summary += `• ${item.name} ×${item.qty}  → KSh ${item.price * item.qty}\n`;
        if (!uniqueItems.find(u => u.product_id === item.product_id)) {
          uniqueItems.push(item);
        }
      }
      summary += `━━━━━━━━━━━━━━━━━━\n`;
      summary += `Subtotal: KSh ${subtotal}\n`;
      summary += `Delivery: ${deliveryFee > 0 ? `KSh ${deliveryFee}` : 'Free'}\n`;
      summary += `━━━━━━━━━━━━━━━━━━\n`;
      summary += `*Total: KSh ${grandTotal}*\n\nReply *confirm* to pay using this phone number (${senderId})\nOr reply *confirm [M-Pesa Number]* (e.g. *confirm 0712345678*) to pay using a different line.\n\nType *cancel* to start over.`;

      // 1. Deliver text summary
      await sendMessage(senderId, summary, instance);

      // 2. Deliver product photos for item verification
      for (const item of uniqueItems) {
        const prodData = Object.values(productIndex).find((p: any) => p.id === item.product_id) as any;
        if (prodData?.image_url) {
          await sendImageMessage(senderId, prodData.image_url, `📸 *${item.name}*`, instance);
        }
      }

      // Save to cart session
      await supabase.from('profiles')
        .update({ state: 'CART_CONFIRM', state_data: { shop_id: shop.id, cart: cartItems, total: grandTotal, index: productIndex } })
        .eq('whatsapp_id', senderId);

      break;
    }

    // ── CART_CONFIRM ──────────────────────────────────────────────────────────
    case 'CART_CONFIRM': {
      if (lowerText === 'cancel') {
        await supabase.from('profiles').update({ state: 'START', state_data: null }).eq('whatsapp_id', senderId);
        await sendMessage(senderId, `🔄 Order cancelled. Type *menu* to start over.`, instance);
        break;
      }

      if (!lowerText.startsWith('confirm')) {
        await sendMessage(senderId, `Reply *confirm* to pay or *cancel* to start over.`, instance);
        break;
      }

      const stateData = profile.state_data as any;
      const { cart, total } = stateData ?? {};

      if (!cart) {
        await supabase.from('profiles').update({ state: 'START', state_data: null }).eq('whatsapp_id', senderId);
        await sendMessage(senderId, `Something went wrong. Type *menu* to start over.`, instance);
        break;
      }

      // Verify payment routing credentials exist based on shop split model
      const canCollect = 
        (shop.split_model === 'flat' && shop.merchant_till_number) ||
        (shop.split_model === 'commission' && shop.merchant_payout_phone);

      if (!canCollect) {
        await sendMessage(senderId, `Sorry, this shop is not configured to accept automated online payments yet. Please contact the seller directly.`, instance);
        break;
      }

      // Resolve and validate target M-Pesa phone number
      let mpesaPhone: string | null = null;
      const customPhoneMatch = text.match(/confirm\s+([\d+]+)/i);

      if (customPhoneMatch) {
        mpesaPhone = formatMpesaNumber(customPhoneMatch[1]);
      } else {
        mpesaPhone = formatMpesaNumber(senderId);
      }

      if (!mpesaPhone) {
        await sendMessage(
          senderId,
          `⚠️ *Invalid M-Pesa Number*\n\n` +
          `Your phone number could not be recognized as a valid Kenyan Safaricom line.\n\n` +
          `Please reply with: *confirm [M-Pesa Number]*\n` +
          `Example: _confirm 0712345678_`,
          instance
        );
        break;
      }

      // Create PENDING database order
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert([{ shop_id: shop.id, customer_whatsapp: senderId, total_price: total, status: 'PENDING', items: cart }])
        .select()
        .single();

      if (orderErr || !order) {
        console.error('[DB] Order insert error:', orderErr?.message);
        await sendMessage(senderId, `Something went wrong creating your order. Please try again.`, instance);
        break;
      }

      try {
        await sendMessage(senderId, `📲 *Initiating secure M-Pesa STK Push...*`, instance);
        
        await payhero.initiateStkPush(
          mpesaPhone,
          total,
          order.id,
          shop
        );
        
        await supabase.from('profiles').update({ state: 'START', state_data: null }).eq('whatsapp_id', senderId);

        await sendMessage(senderId,
          `📲 *M-Pesa STK Push Sent!*\n\n` +
          `Amount: *KSh ${total}*\n` +
          `Target Phone: *0${mpesaPhone.slice(3)}*\n\n` +
          `👇 Please check the screen of that phone, enter your M-Pesa PIN, and click Send.\n\n` +
          `_You will receive your PDF receipt here instantly once the transaction is completed._`,
          instance
        );
      } catch (err: any) {
        console.error('[PayHero STK Push Error]', err.message);
        // Delete the pending order from the database since payment initiation failed
        await supabase.from('orders').delete().eq('id', order.id);
        await sendMessage(senderId, `❌ Could not initiate M-Pesa STK Push. Please verify the phone number and try again.`, instance);
      }
      break;
    }

    default: {
      await sendMessage(senderId, `Type *hi* or *menu* to get started. 😊`, instance);
    }
  }
}
