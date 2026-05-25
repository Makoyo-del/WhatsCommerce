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
          mediatype: 'image',
          mimetype: 'image/jpeg',
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
          mediatype: 'document',
          mimetype: 'application/pdf',
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

  /**
   * Sends quick reply buttons (up to 3)
   */
  async sendButtons(
    to: string,
    title: string,
    description: string,
    buttons: Array<{ id: string; label: string }>,
    footerText = 'WhatsCommerce',
    instanceName?: string
  ) {
    const instance = instanceName || DEFAULT_INSTANCE;

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.warn('[Messenger] Evolution API not configured. Buttons:', title);
      return;
    }

    if (to.includes('demo')) {
      console.log(`[Messenger Demo] Sending buttons to ${to} via ${instance}:`, { title, description, buttons });
      return;
    }

    const cleanTo = this.formatNumber(to);

    try {
      await axios.post(
        `${EVOLUTION_API_URL}/message/sendButton/${instance}`,
        {
          number: cleanTo,
          title,
          description,
          footer: footerText,
          buttons: buttons.map(btn => ({
            buttonId: btn.id,
            buttonText: {
              displayText: btn.label
            },
            type: 1
          }))
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
        `[Messenger SendButtons Error - Instance: ${instance}]`,
        JSON.stringify(err.response?.data ?? err.message)
      );
      // Fallback: Send as plain text with instruction
      const fallbackText = `*${title}*\n${description}\n\n` + 
        buttons.map((btn, idx) => `• *${btn.label}* (reply with _${btn.label.toLowerCase()}_)`).join('\n') +
        `\n\n_${footerText}_`;
      await this.sendText(to, fallbackText, instance);
    }
  },

  /**
   * Sends a beautiful interactive bottom sheet list (up to 10 rows)
   */
  async sendList(
    to: string,
    title: string,
    description: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    footerText = 'WhatsCommerce',
    instanceName?: string
  ) {
    const instance = instanceName || DEFAULT_INSTANCE;

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.warn('[Messenger] Evolution API not configured. List:', title);
      return;
    }

    if (to.includes('demo')) {
      console.log(`[Messenger Demo] Sending list to ${to} via ${instance}:`, { title, description, sections });
      return;
    }

    const cleanTo = this.formatNumber(to);

    try {
      await axios.post(
        `${EVOLUTION_API_URL}/message/sendList/${instance}`,
        {
          number: cleanTo,
          title,
          description,
          buttonText,
          footer: footerText,
          sections: sections.map(sec => ({
            title: sec.title,
            rows: sec.rows.map(row => ({
              title: row.title,
              description: row.description || '',
              rowId: row.id
            }))
          }))
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
        `[Messenger SendList Error - Instance: ${instance}]`,
        JSON.stringify(err.response?.data ?? err.message)
      );
      // Fallback: Send as plain text with options
      let fallbackText = `*${title}*\n${description}\n\n`;
      let optNum = 1;
      const index: Record<number, string> = {};
      
      for (const sec of sections) {
        fallbackText += `*${sec.title.toUpperCase()}*\n`;
        for (const row of sec.rows) {
          fallbackText += `${optNum}. *${row.title}*${row.description ? ` - ${row.description}` : ''}\n`;
          index[optNum] = row.title;
          optNum++;
        }
        fallbackText += '\n';
      }
      fallbackText += `Please reply with the option number.\n\n_${footerText}_`;
      await this.sendText(to, fallbackText, instance);
    }
  },
};
