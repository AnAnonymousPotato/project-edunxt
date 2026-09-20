import fs from 'node:fs';
import path from 'node:path';

export interface SyncRecord {
  seenCircularIds: number[];
  seenMailIds: string[];
  lastSyncAt: string | null;
  savedItemsCount: {
    circulars: number;
    mail: number;
  };
}

export class StateStore {
  private filePath: string;
  private state: SyncRecord;

  constructor(filePath = './data/sync_state.json') {
    this.filePath = path.resolve(filePath);
    this.state = this.loadState();
  }

  private loadState(): SyncRecord {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw) as SyncRecord;
      }
    } catch (e) {
      console.warn('Could not read existing state file, starting fresh:', e);
    }

    return {
      seenCircularIds: [],
      seenMailIds: [],
      lastSyncAt: null,
      savedItemsCount: {
        circulars: 0,
        mail: 0,
      },
    };
  }

  public saveState(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  public isCircularNew(id: number): boolean {
    return !this.state.seenCircularIds.includes(id);
  }

  public markCircularSeen(id: number): void {
    if (!this.state.seenCircularIds.includes(id)) {
      this.state.seenCircularIds.push(id);
      this.state.savedItemsCount.circulars = this.state.seenCircularIds.length;
    }
  }

  public isMailNew(id: string): boolean {
    return !this.state.seenMailIds.includes(id);
  }

  public markMailSeen(id: string): void {
    if (!this.state.seenMailIds.includes(id)) {
      this.state.seenMailIds.push(id);
      this.state.savedItemsCount.mail = this.state.seenMailIds.length;
    }
  }

  public updateLastSync(): void {
    this.state.lastSyncAt = new Date().toISOString();
  }

  public getState(): SyncRecord {
    return this.state;
  }
}
