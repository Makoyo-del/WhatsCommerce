import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  is_available: boolean;
}

interface Shop {
  id: string;
  name: string;
  delivery_info: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const IMG_W        = 800;
const COLS         = 2;
const CARD_W       = 358;
const CARD_H       = 220;
const GAP          = 16;
const PADDING      = 24;
const HEADER_H     = 90;
const CAT_HEADER_H = 52;

// ── Main handler ───────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { shopId: string } }
) {
  const shopId       = params.shopId;
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers      = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  // Parallel fetch shop + products
  const [shopRes, prodRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/shops?id=eq.${shopId}&select=id,name,delivery_info&limit=1`, { headers }),
    fetch(
      `${supabaseUrl}/rest/v1/products?shop_id=eq.${shopId}&is_available=eq.true&select=id,name,price,image_url,category&order=category.asc,created_at.asc`,
      { headers }
    ),
  ]);

  const shops: Shop[]     = await shopRes.json();
  const products: Product[] = await prodRes.json();
  const shop = shops[0];

  if (!shop || !products?.length) {
    return new ImageResponse(
      <div style={{ display: 'flex', width: 400, height: 200, background: '#1a0900', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#aaa', fontSize: 20 }}>No menu available</span>
      </div>,
      { width: 400, height: 200 }
    );
  }

  // Group products by category
  const categoryMap = new Map<string, Product[]>();
  for (const p of products) {
    const cat = p.category || 'General';
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(p);
  }

  // Assign sequential numbers across all products
  let globalIndex = 0;
  const numbered: Array<Product & { num: number }> = [];
  for (const group of Array.from(categoryMap.values())) {
    for (const p of group) {
      numbered.push({ ...p, num: ++globalIndex });
    }
  }

  // Calculate total image height
  let contentHeight = HEADER_H + PADDING;
  for (const group of Array.from(categoryMap.values())) {
    contentHeight += CAT_HEADER_H;
    contentHeight += Math.ceil(group.length / COLS) * (CARD_H + GAP);
    contentHeight += GAP;
  }
  contentHeight += PADDING;
  const IMG_H = Math.max(contentHeight, 300);

  // Render product rows per category
  const categoryBlocks: React.ReactNode[] = [];
  let runningIndex = 0;

  for (const [catName, items] of Array.from(categoryMap.entries())) {
    const rows: React.ReactNode[] = [];
    for (let r = 0; r < Math.ceil(items.length / COLS); r++) {
      const rowItems = items.slice(r * COLS, r * COLS + COLS);
      rows.push(
        <div key={r} style={{ display: 'flex', flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
          {rowItems.map((prod) => {
            const num = numbered.find(n => n.id === prod.id)?.num ?? ++runningIndex;
            return (
              <div
                key={prod.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: CARD_W,
                  height: CARD_H,
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,180,50,0.2)',
                }}
              >
                {/* Image area */}
                <div style={{ display: 'flex', width: CARD_W, height: 135, background: '#1f1000', position: 'relative' }}>
                  {prod.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={prod.image_url}
                      width={CARD_W}
                      height={135}
                      style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                      alt={prod.name}
                    />
                  ) : (
                    <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 42 }}>🍽️</span>
                    </div>
                  )}
                  {/* Number badge */}
                  <div
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      background: '#FF8C00',
                      color: '#000',
                      fontWeight: 900,
                      fontSize: 16,
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {num}
                  </div>
                </div>

                {/* Info area */}
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', flex: 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
                      {prod.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', background: 'rgba(255,180,0,0.15)', borderRadius: 8, padding: '4px 10px', marginLeft: 10 }}>
                    <span style={{ color: '#FFD700', fontSize: 16, fontWeight: 800 }}>
                      KSh {prod.price}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Fill empty slot in last row */}
          {rowItems.length < COLS && (
            <div style={{ display: 'flex', width: CARD_W, height: CARD_H }} />
          )}
        </div>
      );
    }

    categoryBlocks.push(
      <div key={catName} style={{ display: 'flex', flexDirection: 'column', marginBottom: GAP }}>
        {/* Category header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: CAT_HEADER_H,
            borderLeft: '4px solid #FF8C00',
            paddingLeft: 14,
            marginBottom: 10,
          }}
        >
          <span style={{ color: '#FF8C00', fontSize: 17, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {catName}
          </span>
        </div>
        {rows}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: IMG_W,
          height: IMG_H,
          background: 'linear-gradient(160deg, #0f0800 0%, #1e0f00 60%, #0a0500 100%)',
          padding: PADDING,
          fontFamily: 'sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            borderBottom: '1px solid rgba(255,140,0,0.3)',
            paddingBottom: 16,
            height: HEADER_H - 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#FFD700', fontSize: 26, fontWeight: 900 }}>
              🛍️ {shop.name}
            </span>
            <span style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>
              📍 {shop.delivery_info ?? 'Delivery available'}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: 'rgba(255,140,0,0.15)',
              border: '1px solid rgba(255,140,0,0.4)',
              borderRadius: 10,
              padding: '8px 16px',
            }}
          >
            <span style={{ color: '#FF8C00', fontSize: 12, fontWeight: 700 }}>ORDER BY NUMBER</span>
            <span style={{ color: '#fff', fontSize: 11, marginTop: 2 }}>e.g. 1x2, 3x1</span>
          </div>
        </div>

        {/* Category blocks */}
        {categoryBlocks}
      </div>
    ),
    {
      width: IMG_W,
      height: IMG_H,
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    }
  );
}
