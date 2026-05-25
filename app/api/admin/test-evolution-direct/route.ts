import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { to, instanceName } = body;

    console.log(`[Direct Test] Sending list to ${to} via ${instanceName}...`);
    console.log(`[Direct Test] URL: ${EVOLUTION_API_URL}/message/sendList/${instanceName}`);

    const res = await axios.post(
      `${EVOLUTION_API_URL}/message/sendList/${instanceName}`,
      {
        number: to,
        title: "Test Menu",
        description: "Please select an option",
        buttonText: "Open Menu",
        footer: "Powered by WhatsCommerce",
        sections: [
          {
            title: "Test Section",
            rows: [
              {
                title: "Test Row",
                description: "Test Description",
                rowId: "test_row_1"
              }
            ]
          }
        ]
      },
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return NextResponse.json({ success: true, response: res.data });
  } catch (err: any) {
    console.error("[Direct Test Error]", err.response?.data || err.message);
    return NextResponse.json({
      success: false,
      error: err.response?.data || err.message
    }, { status: 500 });
  }
}
