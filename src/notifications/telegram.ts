import { CircularItem, MailboxItem } from '../core/types.js';

export class TelegramNotifier {
  private botToken: string | null;
  private chatId: string | null;

  constructor(botToken?: string, chatId?: string) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || null;
    this.chatId = chatId || process.env.TELEGRAM_CHAT_ID || null;
  }

  public isEnabled(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  public async sendMessage(text: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('Telegram notification error:', err);
      return false;
    }
  }

  public async sendDocument(fileUrl: string, caption?: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const url = `https://api.telegram.org/bot${this.botToken}/sendDocument`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          document: fileUrl,
          caption: caption || '',
          parse_mode: 'HTML',
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('Telegram document error:', err);
      return false;
    }
  }

  public async notifyCircular(circular: CircularItem): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const cleanDesc = (circular.discription || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const text = `📢 <b>NEW CIRCULAR:</b> ${circular.name}\n` +
      `📅 <b>Date:</b> ${circular.date}\n\n` +
      (cleanDesc ? `<i>${cleanDesc.slice(0, 300)}${cleanDesc.length > 300 ? '...' : ''}</i>\n\n` : '') +
      `🔗 <i>Edunext Portal (DPS Harni)</i>`;

    const pdfUrl = circular.attachment?.image_array?.[0]?.cloud_front_serving_url ||
                   circular.attachment?.image_array?.[0]?.servingUrl;

    if (pdfUrl) {
      // Try sending with the PDF attached directly
      const docSuccess = await this.sendDocument(pdfUrl, text);
      if (docSuccess) return true;
    }

    return this.sendMessage(text);
  }

  public async notifyMail(mail: MailboxItem): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const cleanBody = (mail.message_html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const text = `✉️ <b>NEW MAILBOX MESSAGE</b>\n` +
      `👤 <b>From:</b> ${mail.employeename || mail.from}\n` +
      `📌 <b>Subject:</b> ${mail.subject}\n` +
      `📅 <b>Date:</b> ${mail.date}\n\n` +
      (cleanBody ? `<i>${cleanBody.slice(0, 400)}${cleanBody.length > 400 ? '...' : ''}</i>\n` : '');

    return this.sendMessage(text);
  }
}
