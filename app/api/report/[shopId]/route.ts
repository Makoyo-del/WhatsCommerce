import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';

export async function GET(
  req: NextRequest,
  { params }: { params: { shopId: string } }
) {
  const { shopId } = params;
  const { searchParams } = new URL(req.url);
  
  // 0. Security Verification: Validate access token
  const token = searchParams.get('token');
  if (!token || token !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const range = searchParams.get('range') || 'weekly'; // 'daily' or 'weekly'

  // 1. Resolve date boundaries
  const now = new Date();
  const startDate = new Date();
  if (range === 'daily') {
    startDate.setHours(0, 0, 0, 0); // Start of today
  } else {
    startDate.setDate(startDate.getDate() - 7); // Past 7 days
  }

  // 2. Fetch Shop Details + Orders
  const { data: shop } = await supabase.from('shops').select('*').eq('id', shopId).single();
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('shop_id', shopId)
    .eq('status', 'PAID')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (!shop || !orders) {
    return new NextResponse('Data not found', { status: 404 });
  }

  // 3. Calculate Ledger Statistics
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price), 0);
  const orderCount = orders.length;
  const avgOrderValue = orderCount > 0 ? (totalRevenue / orderCount).toFixed(0) : '0';

  // Aggregate popular items
  const itemCounts: Record<string, { qty: number; total: number }> = {};
  orders.forEach((o: any) => {
    const items = o.items || [];
    items.forEach((item: any) => {
      if (!itemCounts[item.name]) {
        itemCounts[item.name] = { qty: 0, total: 0 };
      }
      itemCounts[item.name].qty += item.qty;
      itemCounts[item.name].total += item.price * item.qty;
    });
  });

  // 4. Generate jsPDF A4 Document
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  let y = 20;

  // Header Style (Sleek Dark charcoal background header block)
  doc.setFillColor(31, 41, 55); 
  doc.rect(0, 0, 210, 38, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(shop.name.toUpperCase(), 15, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const dateStr = `${startDate.toLocaleDateString()} to ${now.toLocaleDateString()}`;
  doc.text(`BUSINESS LEDGER REPORT  •  ${dateStr}`, 15, 28);
  
  y = 48;
  doc.setTextColor(0, 0, 0);

  // SUMMARY CARD BOXES (A4 grids)
  doc.setFillColor(243, 244, 246); // light grey background
  doc.rect(15, y, 55, 22, 'F');
  doc.rect(78, y, 55, 22, 'F');
  doc.rect(140, y, 55, 22, 'F');

  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text('TOTAL REVENUE', 18, y + 6);
  doc.text('TOTAL ORDERS', 81, y + 6);
  doc.text('AVG ORDER VALUE', 143, y + 6);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`KSh ${totalRevenue.toLocaleString()}`, 18, y + 14);
  doc.text(`${orderCount} Paid Orders`, 81, y + 14);
  doc.text(`KSh ${Number(avgOrderValue).toLocaleString()}`, 143, y + 14);

  y += 32;

  // SECTION 1: POPULAR PRODUCTS TABLE
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Product Performance', 15, y);
  y += 3;
  doc.line(15, y, 195, y);
  y += 5;

  doc.setFontSize(8.5);
  doc.text('Item Name', 18, y);
  doc.text('Units Sold', 110, y);
  doc.text('Gross Sales', 160, y);
  y += 3;
  doc.line(15, y, 195, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  Object.entries(itemCounts).forEach(([name, data]) => {
    doc.text(name, 18, y);
    doc.text(data.qty.toString(), 110, y);
    doc.text(`KSh ${data.total.toLocaleString()}`, 160, y);
    y += 5.5;
  });

  y += 8;

  // SECTION 2: TRANSACTION HISTORY TABLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Transaction Details', 15, y);
  y += 3;
  doc.line(15, y, 195, y);
  y += 5;

  doc.setFontSize(8.5);
  doc.text('Date', 18, y);
  doc.text('Order ID', 55, y);
  doc.text('Customer Phone', 105, y);
  doc.text('Amount Paid', 160, y);
  y += 3;
  doc.line(15, y, 195, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  orders.forEach((o: any) => {
    const oDate = new Date(o.created_at).toLocaleDateString();
    doc.text(oDate, 18, y);
    doc.text(`#${o.id.slice(0, 8)}`, 55, y);
    doc.text(o.customer_whatsapp, 105, y);
    doc.text(`KSh ${o.total_price.toLocaleString()}`, 160, y);
    y += 5.5;
    if (y > 260) {
      doc.addPage();
      y = 20; // reset y on page overflow
    }
  });

  // LEDGER LEGAL DISCLAIMER (Pruning Notification)
  y += 10;
  if (y > 255) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(254, 242, 242); // very light red warning background
  doc.rect(15, y, 180, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(185, 28, 28); // warning red text
  doc.text('⚠️ DATA PRUNING NOTICE:', 18, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('To keep active database instances lightweight, WhatsCommerce prunes historical transaction', 18, y + 9);
  doc.text('details weekly. Please download and save this official PDF ledger for your taxation and business records.', 18, y + 13);

  const pdfBuffer = doc.output('arraybuffer');
  
  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${range}-report-${shopId.slice(0, 8)}.pdf"`,
    },
  });
}
