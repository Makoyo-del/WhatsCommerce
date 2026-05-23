import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';

export async function GET(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params;

  // 1. Fetch order details
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*, shops(*)')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return new NextResponse('Order not found', { status: 404 });
  }

  const shop = order.shops;
  const items = order.items || [];
  const total = order.total_price;

  // 2. Create PDF (Thermal Receipt Size: 80mm wide, variable height)
  // Height = Header + Items + Footer
  const doc = new jsPDF({
    unit: 'mm',
    format: [80, 150], // 80mm wide, 150mm height (can adjust)
  });

  // Settings
  doc.setFont('helvetica', 'normal');
  let y = 10;

  // Shop Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(shop.name || 'WhatsCommerce Shop', 40, y, { align: 'center' });
  y += 6;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('OFFICIAL RECEIPT', 40, y, { align: 'center' });
  y += 8;

  // Order Info
  doc.text(`Order ID: #${order.id.slice(0, 8)}`, 5, y);
  y += 4;
  doc.text(`Date: ${new Date(order.created_at).toLocaleString()}`, 5, y);
  y += 4;
  doc.text(`Customer: ${order.customer_whatsapp}`, 5, y);
  y += 6;

  // Items Header
  doc.line(5, y, 75, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Item', 5, y);
  doc.text('Qty', 45, y);
  doc.text('Total', 75, y, { align: 'right' });
  y += 4;
  doc.line(5, y, 75, y);
  y += 6;

  // Items List
  doc.setFont('helvetica', 'normal');
  items.forEach((item: any) => {
    doc.text(item.name.substring(0, 25), 5, y);
    doc.text(item.qty.toString(), 45, y);
    doc.text(`KSh ${(item.price * item.qty).toLocaleString()}`, 75, y, { align: 'right' });
    y += 5;
  });

  // Total
  y += 2;
  doc.line(5, y, 75, y);
  y += 6;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 5, y);
  doc.text(`KSh ${total.toLocaleString()}`, 75, y, { align: 'right' });

  // Footer
  y += 15;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('Thank you for your business!', 40, y, { align: 'center' });
  y += 4;
  doc.text('Powered by WhatsCommerce', 40, y, { align: 'center' });

  const pdfBuffer = doc.output('arraybuffer');

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${orderId.slice(0, 8)}.pdf"`,
    },
  });
}
