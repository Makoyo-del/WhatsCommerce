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
    const { to, type, instanceName } = body;

    let res;
    if (type === 'button') {
      res = await axios.post(
        `${EVOLUTION_API_URL}/message/sendButton/${instanceName}`,
        {
          number: to,
          title: "WhatsCommerce Upgrade",
          description: "Would you like to move to interactive buttons?",
          footer: "WhatsCommerce Bot",
          buttons: [
            {
              buttonId: "btn_yes",
              buttonText: {
                displayText: "Yes, absolutely! 🚀"
              },
              type: 1
            },
            {
              buttonId: "btn_no",
              buttonText: {
                displayText: "No, keep text 📝"
              },
              type: 1
            }
          ]
        },
        {
          headers: { apikey: EVOLUTION_API_KEY }
        }
      );
    } else {
      res = await axios.post(
        `${EVOLUTION_API_URL}/message/sendList/${instanceName}`,
        {
          number: to,
          title: "Select Service",
          description: "Please select your preferred service",
          buttonText: "View Services Menu",
          footer: "WhatsCommerce Bot",
          sections: [
            {
              title: "Haircuts & Styling",
              rows: [
                {
                  title: "Men's Haircut",
                  description: "Standard executive cut - KSh 500",
                  rowId: "srv_men_cut"
                },
                {
                  title: "Ladies Styling",
                  description: "Wash & styling - KSh 1,500",
                  rowId: "srv_ladies_style"
                }
              ]
            }
          ]
        },
        {
          headers: { apikey: EVOLUTION_API_KEY }
        }
      );
    }

    return NextResponse.json({ success: true, response: res.data });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.response?.data || err.message
    }, { status: 500 });
  }
}
