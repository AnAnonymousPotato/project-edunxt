import { EdunextClient } from '../core/client.js';
import { StateStore } from '../storage/store.js';
import { TelegramNotifier } from '../notifications/telegram.js';

export interface SyncResult {
  timestamp: string;
  newCircularsCount: number;
  newMailCount: number;
  totalCirculars: number;
  totalMail: number;
}

export async function runSync(
  client: EdunextClient,
  store: StateStore,
  telegram = new TelegramNotifier()
): Promise<SyncResult> {
  console.log('🔄 Starting Edunext sync cycle...');

  // 1. Fetch live data
  const [circulars, mailbox] = await Promise.all([
    client.getCirculars(),
    client.getMailbox(),
  ]);

  console.log(`📊 Fetched ${circulars.length} circulars and ${mailbox.length} mailbox items.`);

  let newCircularsCount = 0;
  let newMailCount = 0;

  // 2. Process Circulars
  for (const circ of circulars) {
    if (store.isCircularNew(circ.id)) {
      newCircularsCount++;
      console.log(`✨ [NEW CIRCULAR #${circ.id}] ${circ.name} (${circ.date})`);

      if (telegram.isEnabled()) {
        await telegram.notifyCircular(circ);
      }

      store.markCircularSeen(circ.id);
    }
  }

  // 3. Process Mailbox
  for (const mail of mailbox) {
    if (store.isMailNew(mail.id)) {
      newMailCount++;
      console.log(`✨ [NEW MAIL #${mail.id}] ${mail.subject} from ${mail.employeename || mail.from}`);

      if (telegram.isEnabled()) {
        await telegram.notifyMail(mail);
      }

      store.markMailSeen(mail.id);
    }
  }

  // 4. Save state
  store.updateLastSync();
  store.saveState();

  const result: SyncResult = {
    timestamp: new Date().toISOString(),
    newCircularsCount,
    newMailCount,
    totalCirculars: circulars.length,
    totalMail: mailbox.length,
  };

  console.log(`✅ Sync cycle complete: ${newCircularsCount} new circulars, ${newMailCount} new messages.`);
  return result;
}
