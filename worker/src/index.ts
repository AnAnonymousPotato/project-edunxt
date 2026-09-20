/**
 * Redunxt - 5-Minute Background Notification Engine
 * Hosted on Cloudflare Workers (100% Free Tier)
 * 
 * Scheduled Cron: Every 5 minutes (runs 24/7)
 * Dispatches instant notifications to Telegram with PDF attachments for new school circulars.
 */

export interface Env {
  EDUNEXT_KV: KVNamespace;
  EDUNEXT_USER_ID: string;
  EDUNEXT_PASSWORD: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  EDUNEXT_DOMAIN?: string;
}

interface CircularItem {
  id: string | number;
  name: string;
  date: string;
  discription?: string;
  attachment?: {
    image_array?: Array<{
      filename?: string;
      cloud_front_serving_url?: string;
      servingUrl?: string;
    }>;
  };
}

interface MailItem {
  id: string | number;
  subject: string;
  from?: string;
  employeename?: string;
  date: string;
  message_html?: string;
}

export default {
  // HTTP Handler for manual trigger & status check
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/test') {
      const result = await checkAndNotify(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        service: 'Redunxt Notification Worker',
        status: 'online',
        cron: '*/5 * * * *',
        info: 'Runs automatically every 5 minutes. Visit /test to trigger a manual check.',
      }, null, 2),
      { headers: { 'Content-Type': 'application/json' } }
    );
  },

  // Cron Handler (Fires every 5 minutes)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkAndNotify(env));
  },
};

async function checkAndNotify(env: Env) {
  const schoolDomain = env.EDUNEXT_DOMAIN || 'dpsharni.edunext2.com';

  if (!env.EDUNEXT_USER_ID || !env.EDUNEXT_PASSWORD) {
    return { error: 'Missing EDUNEXT_USER_ID or EDUNEXT_PASSWORD secret in Cloudflare Worker.' };
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret in Cloudflare Worker.' };
  }

  // 1. Authenticate with Edunext
  const authRes = await fetch('https://m1.edubac.com/rest/v4/student/openconnect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mvcdomainurl': schoolDomain,
      'Connection-type': '_write',
    },
    body: JSON.stringify({
      userid: env.EDUNEXT_USER_ID,
      password: env.EDUNEXT_PASSWORD,
    }),
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    return { error: `Edunext login failed: ${errText}` };
  }

  const authData = (await authRes.json()) as any;
  const token = authData.data?.openIdConnect;
  if (!token) {
    return { error: 'No token received from Edunext authentication.' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'mvcdomainurl': schoolDomain,
    'Connection-type': '_read',
    'Authorization': `Bearer ${token}`,
  };

  // 2. Fetch latest Circulars and Mailbox
  const [circRes, mailRes] = await Promise.all([
    fetch('https://m1.edubac.com/rest/v4/student/getcirculardata', { headers }),
    fetch('https://m1.edubac.com/rest/v4/student/Studentinboxnew?limit=1', { headers }),
  ]);

  const circData = (await circRes.json().catch(() => ({}))) as any;
  const mailData = (await mailRes.json().catch(() => ({}))) as any;

  const circulars: CircularItem[] = circData.data?.circularlist || [];
  const mailbox: MailItem[] = mailData.data?.list || [];

  // 3. Load seen IDs from Cloudflare KV
  const rawSeenCircs = await env.EDUNEXT_KV.get('seen_circular_ids');
  const rawSeenMail = await env.EDUNEXT_KV.get('seen_mail_ids');

  // First run initialization: populate KV without spamming historical items
  if (rawSeenCircs === null) {
    const initialCircIds = circulars.map((c) => String(c.id));
    const initialMailIds = mailbox.map((m) => String(m.id));

    await env.EDUNEXT_KV.put('seen_circular_ids', JSON.stringify(initialCircIds));
    await env.EDUNEXT_KV.put('seen_mail_ids', JSON.stringify(initialMailIds));

    await sendTelegramMessage(
      env,
      `🚀 <b>Redunxt 5-Minute Notification Bot Activated!</b>\n\n` +
      `🏫 School: <b>DPS Harni</b>\n` +
      `⏰ Checking every 5 minutes for new circulars and messages.\n` +
      `📎 PDF circulars will be sent automatically as downloadable files!`
    );

    return {
      status: 'initialized',
      message: 'KV seeded with current records. Welcome message sent to Telegram.',
      circularsCount: circulars.length,
      mailCount: mailbox.length,
    };
  }

  const seenCircIds: string[] = JSON.parse(rawSeenCircs || '[]');
  const seenMailIds: string[] = JSON.parse(rawSeenMail || '[]');

  const newCircs = circulars.filter((c) => !seenCircIds.includes(String(c.id)));
  const newMails = mailbox.filter((m) => !seenMailIds.includes(String(m.id)));

  // 4. Notify new Circulars (with PDF attachment)
  for (const c of newCircs) {
    const cleanDesc = (c.discription || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const text =
      `📢 <b>NEW SCHOOL CIRCULAR</b>\n` +
      `📌 <b>Title:</b> ${c.name}\n` +
      `📅 <b>Date:</b> ${c.date}\n\n` +
      (cleanDesc ? `<i>${cleanDesc.slice(0, 350)}${cleanDesc.length > 350 ? '...' : ''}</i>\n\n` : '') +
      `🔗 <a href="https://redunxt.vercel.app">Open Redunxt Dashboard</a>`;

    const pdfUrl =
      c.attachment?.image_array?.[0]?.cloud_front_serving_url ||
      c.attachment?.image_array?.[0]?.servingUrl;

    if (pdfUrl) {
      await sendTelegramDocument(env, pdfUrl, text);
    } else {
      await sendTelegramMessage(env, text);
    }

    seenCircIds.push(String(c.id));
  }

  // 5. Notify new Mailbox messages
  for (const m of newMails) {
    const cleanBody = (m.message_html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const text =
      `✉️ <b>NEW MAILBOX MESSAGE</b>\n` +
      `👤 <b>From:</b> ${m.employeename || m.from}\n` +
      `📌 <b>Subject:</b> ${m.subject}\n` +
      `📅 <b>Date:</b> ${m.date}\n\n` +
      (cleanBody ? `<i>${cleanBody.slice(0, 400)}${cleanBody.length > 400 ? '...' : ''}</i>\n\n` : '') +
      `🔗 <a href="https://redunxt.vercel.app">Open Redunxt Dashboard</a>`;

    await sendTelegramMessage(env, text);
    seenMailIds.push(String(m.id));
  }

  // 6. Update KV
  if (newCircs.length > 0) {
    await env.EDUNEXT_KV.put('seen_circular_ids', JSON.stringify(seenCircIds));
  }
  if (newMails.length > 0) {
    await env.EDUNEXT_KV.put('seen_mail_ids', JSON.stringify(seenMailIds));
  }

  return {
    status: 'synced',
    timestamp: new Date().toISOString(),
    newCirculars: newCircs.length,
    newMail: newMails.length,
  };
}

async function sendTelegramMessage(env: Env, text: string): Promise<boolean> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendTelegramDocument(env: Env, fileUrl: string, caption: string): Promise<boolean> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        document: fileUrl,
        caption,
        parse_mode: 'HTML',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
