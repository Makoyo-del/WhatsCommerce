import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    alive: true,
    timestamp: new Date().toISOString(),
  });
}
