import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

// Fallback to default instance or first configured merchant if not supplied
const DEFAULT_INSTANCE = 'main-instance';

/**
 * Universal Session-Based Messaging Layer (Evolution API / Baileys Wrapper)
 */
export const messenger = {
  /**
   * Helper to format recipient numbers into standard WhatsApp JID format
   */
  formatNumber(to: string): string {
    // Remove "whatsapp:" prefix and any non-numeric characters
    const clean = to.replace(/^whatsapp:/i, '').replace(/[^\d]/g, '');
    return clean;
  },

  /**
   * Sends a plain text message
   */
  async sendText(to: string, body: string, instanceName?: string) {
    const instance = instanceName || DEFAULT_INSTANCE;

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.warn('[Messenger] Evolution API not configured. Text:', body);
      return;
    }

    if (to.includes('demo')) {
      console.log(`[Messenger Demo] Sending text to ${to} via ${instance}: ${body}`);
      return;
    }

    const cleanTo = this.formatNumber(to);

    try {
      await axios.post(
        `${EVOLUTION_API_URL}/message/sendText/${instance}`,
        {
          number: cleanTo,
          text: body,
          options: {
            delay: 1200, // human-like typing delay in ms
            presence: 'composing',
          },
        },
        {
          headers: {
            apikey: EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (err: any) {
      console.error(
        `[Messenger SendText Error - Instance: ${instance}]`,
        JSON.stringify(err.response?.data ?? err.message)
      );
    }
  },

  /**
   * Sends an image with an optional caption
   */
  async sendImage(to: string, imageUrl: string, caption?: string, instanceName?: string) {
    const instance = instanceName || DEFAULT_INSTANCE;

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.warn('[Messenger] Evolution API not configured. Image:', imageUrl);
      return;
    }

    if (to.includes('demo')) {
      console.log(`[Messenger Demo] Sending image to ${to} via ${instance}: ${imageUrl} (Caption: ${caption})`);
      return;
    }

    const cleanTo = this.formatNumber(to);

    try {
      await axios.post(
        `${EVOLUTION_API_URL}/message/sendMedia/${instance}`,
        {
          number: cleanTo,
          media: imageUrl,
          mediaType: 'image',
          caption: caption || '',
          delay: 1500,
        },
        {
          headers: {
            apikey: EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (err: any) {
      console.error(
        `[Messenger SendImage Error - Instance: ${instance}]`,
        JSON.stringify(err.response?.data ?? err.message)
      );
      // Fallback to sending text if media delivery fails
      if (caption) {
        await this.sendText(to, `📸 *${caption}*\n${imageUrl}`, instance);
      }
    }
  },

  /**
   * Sends a document (e.g. PDF receipt)
   */
  async sendDocument(to: string, url: string, filename: string, instanceName?: string) {
    const instance = instanceName || DEFAULT_INSTANCE;

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.warn('[Messenger] Evolution API not configured. Document:', url);
      return;
    }

    if (to.includes('demo')) {
      console.log(`[Messenger Demo] Sending doc to ${to} via ${instance}: ${url} (File: ${filename})`);
      return;
    }

    const cleanTo = this.formatNumber(to);

    try {
      await axios.post(
        `${EVOLUTION_API_URL}/message/sendMedia/${instance}`,
        {
          number: cleanTo,
          media: url,
          mediaType: 'document',
          fileName: filename,
          caption: filename,
          delay: 2000,
        },
        {
          headers: {
            apikey: EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (err: any) {
      console.error(
        `[Messenger SendDoc Error - Instance: ${instance}]`,
        JSON.stringify(err.response?.data ?? err.message)
      );
    }
  },
};
