# Redunxt 5-Minute Notification Worker (Cloudflare Workers)

Runs on **Cloudflare Workers Free Tier** ($0/month). Automatically checks Edunext every 5 minutes and sends instant notifications + attaches PDF circular files directly into your Telegram!

## Setup in 2 Minutes:

1. **Install Wrangler (Cloudflare CLI)**:
   ```bash
   npm install -g wrangler
   # Or use via npx
   ```

2. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

3. **Create the Free KV Namespace**:
   ```bash
   npx wrangler kv namespace create EDUNEXT_KV
   ```
   Copy the `id` output and paste it into `worker/wrangler.toml` under `id = "..."`.

4. **Set Your Secrets**:
   ```bash
   npx wrangler secret put EDUNEXT_USER_ID
   npx wrangler secret put EDUNEXT_PASSWORD
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```

5. **Deploy**:
   ```bash
   cd worker && npx wrangler deploy
   ```

That's it! Your worker will run every 5 minutes 24/7 for free and send you circulars and messages as soon as they drop!
