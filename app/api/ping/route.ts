import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    alive: true,
    timestamp: new Date().toISOString(),
  });
}
