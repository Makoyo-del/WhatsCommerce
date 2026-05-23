import axios from 'axios';

const PAYHERO_API_USERNAME = process.env.PAYHERO_API_USERNAME!;
const PAYHERO_API_PASSWORD = process.env.PAYHERO_API_PASSWORD!;
const PAYHERO_PLATFORM_CHANNEL_ID = process.env.PAYHERO_PLATFORM_CHANNEL_ID!; // Platform's master M-Pesa Paybill/Till
const BASE_URL = process.env.BASE_URL ?? 'https://opportunities-xi.vercel.app';

// Generate Basic Auth token for PayHero Kenya
const authHeader = `Basic ${Buffer.from(`${PAYHERO_API_USERNAME}:${PAYHERO_API_PASSWORD}`).toString('base64')}`;

const headers = {
  Authorization: authHeader,
  'Content-Type': 'application/json',
};

export const payhero = {
  /**
   * Initiates a Safaricom M-Pesa STK Push directly to the customer's phone
   * Routes the cash instantly to the appropriate channel (Merchant Direct Till or Platform Commission Till)
   */
  async initiateStkPush(
    customerPhone: string,
    amount: number,
    orderId: string,
    shop: any
  ) {
    try {
      // 1. Remove + prefix if it exists (PayHero M-Pesa STK requires format: 2547XXXXXXXX or 07XXXXXXXX)
      const cleanPhone = customerPhone.replace('+', '').trim();

      // 2. Resolve target channel based on the merchant's subscription model
      const isFlatModel = shop.split_model === 'flat';
      const targetChannel = isFlatModel 
        ? shop.merchant_till_number // Model A: Direct instant merchant till
        : PAYHERO_PLATFORM_CHANNEL_ID; // Model B: Commission split - routes through platform till

      if (!targetChannel) {
        throw new Error(`Target payout channel not set for shop: ${shop.name}`);
      }

      // 3. Fire PayHero API Request
      const response = await axios.post(
        'https://backend.payhero.co.ke/api/v2/payments',
        {
          amount: Math.round(amount), // PayHero takes KSh flat
          phone: cleanPhone,
          channel_id: targetChannel,
          provider: 'safaricom',
          external_reference: orderId,
          callback_url: `${BASE_URL}/api/payhero-webhook`,
        },
        { headers }
      );

      return response.data;
    } catch (error: any) {
      console.error('[PayHero STK Push Init Failed]', JSON.stringify(error.response?.data ?? error.message));
      throw error;
    }
  },

  /**
   * Sends an automated B2C payout from your platform balance directly to the merchant's M-Pesa number
   * Executed instantly when platform webhook captures successful payment for Model B (5% Split)
   */
  async sendB2CPayout(
    merchantPayoutPhone: string,
    amount: number,
    orderId: string
  ) {
    try {
      const cleanPhone = merchantPayoutPhone.replace('+', '').trim();

      // Trigger instant PayHero B2C disbursement
      const response = await axios.post(
        'https://backend.payhero.co.ke/api/v2/disbursements',
        {
          amount: Math.round(amount),
          phone: cleanPhone,
          channel_id: PAYHERO_PLATFORM_CHANNEL_ID,
          provider: 'safaricom',
          external_reference: `payout_${orderId.slice(0, 8)}`,
        },
        { headers }
      );

      return response.data;
    } catch (error: any) {
      console.error('[PayHero B2C Payout Failed]', JSON.stringify(error.response?.data ?? error.message));
      throw error;
    }
  },
};
