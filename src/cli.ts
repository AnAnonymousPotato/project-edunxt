import 'dotenv/config';
import { EdunextClient } from './core/client.js';
import { StateStore } from './storage/store.js';
import { TelegramNotifier } from './notifications/telegram.js';
import { runSync } from './worker/sync.js';

const userId = process.env.EDUNEXT_USER_ID;
const password = process.env.EDUNEXT_PASSWORD;
const schoolDomain = process.env.EDUNEXT_SCHOOL_DOMAIN || 'dpsharni.edunext2.com';

if (!userId || !password) {
  console.error('❌ Error: EDUNEXT_USER_ID and EDUNEXT_PASSWORD must be set in your .env file.');
  process.exit(1);
}

const client = new EdunextClient(schoolDomain);
client.setCredentials(userId, password);

const command = process.argv[2] || 'test';

async function main() {
  console.log(`========================================`);
  console.log(`🎓 Project Edunxt - CLI Engine`);
  console.log(`🏫 School Domain: ${schoolDomain}`);
  console.log(`👤 User ID:       ${userId}`);
  console.log(`⚙️  Command:       ${command}`);
  console.log(`========================================\n`);

  try {
    if (command === 'test') {
      console.log('1️⃣ Authenticating with Edunext...');
      const token = await client.login();
      const decoded = client.getDecodedToken();
      console.log('✅ Authentication successful!');
      if (decoded) {
        console.log(`   Student ID: ${decoded.studentid}`);
        console.log(`   Class/Section: Class ${decoded.classid}, Sec ${decoded.sectionid}`);
        console.log(`   Academic Year: ${decoded.academicyearid}`);
      }

      console.log('\n2️⃣ Fetching Circulars...');
      const circulars = await client.getCirculars();
      console.log(`✅ Retrieved ${circulars.length} circulars.`);
      if (circulars.length > 0) {
        const first = circulars[0];
        console.log(`   Latest: "${first.name}" (${first.date})`);
        const pdf = first.attachment?.image_array?.[0]?.cloud_front_serving_url;
        if (pdf) console.log(`   PDF Link: ${pdf}`);
      }

      console.log('\n3️⃣ Fetching Mailbox...');
      const mailbox = await client.getMailbox();
      console.log(`✅ Retrieved ${mailbox.length} mailbox messages.`);
      if (mailbox.length > 0) {
        const first = mailbox[0];
        console.log(`   Latest: "${first.subject}" from ${first.employeename || first.from} (${first.date})`);
      }

      console.log('\n🎉 ALL BACKEND APIS ARE WORKING 100% PERFECTLY!');
    } else if (command === 'circulars') {
      const circulars = await client.getCirculars();
      console.log(`Found ${circulars.length} circulars:\n`);
      for (const c of circulars) {
        const pdf = c.attachment?.image_array?.[0]?.cloud_front_serving_url || 'No PDF';
        console.log(`[#${c.id}] ${c.date} | ${c.name}`);
        console.log(`      PDF: ${pdf}\n`);
      }
    } else if (command === 'mailbox') {
      const mail = await client.getMailbox();
      console.log(`Found ${mail.length} messages:\n`);
      for (const m of mail) {
        console.log(`[#${m.id}] ${m.date} | From: ${m.employeename || m.from} | Status: ${m.status}`);
        console.log(`      Subject: ${m.subject}\n`);
      }
    } else if (command === 'sync') {
      const store = new StateStore();
      const telegram = new TelegramNotifier();
      console.log(`Telegram Bot configured: ${telegram.isEnabled() ? 'YES' : 'NO (Disabled)'}`);
      const result = await runSync(client, store, telegram);
      console.log('\nResult:', JSON.stringify(result, null, 2));
    } else if (command === 'poll') {
      const store = new StateStore();
      const telegram = new TelegramNotifier();
      console.log('Starting polling loop (every 5 minutes). Press Ctrl+C to stop.\n');
      
      const poll = async () => {
        try {
          await runSync(client, store, telegram);
        } catch (e) {
          console.error('Polling error:', e);
        }
      };

      await poll();
      setInterval(poll, 5 * 60 * 1000);
    } else {
      console.log(`Unknown command "${command}". Available: test, circulars, mailbox, sync, poll`);
    }
  } catch (err: any) {
    console.error('\n❌ Execution Error:', err.message || err);
    process.exit(1);
  }
}

main();
