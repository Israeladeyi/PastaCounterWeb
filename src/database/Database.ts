import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface SessionRecord {
  id: string; // UUID
  start_time: number;
  end_time: number | null;
  duration_ms: number;
  total_count: number;
  average_confidence: number;
  status: 'ACTIVE' | 'COMPLETED' | 'ABORTED';
  notes: string | null;
}

export interface CountRecord {
  id: number;
  session_id: string;
  timestamp: number;
  track_id: number;
  direction: 'IN' | 'OUT';
  confidence: number;
  sachet_size_px: number;
}

interface PastaCounterDB extends DBSchema {
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: { 'by-startTime': number };
  };
  counts: {
    key: number;
    value: CountRecord;
    indexes: { 'by-session': string };
  };
}

let dbPromise: Promise<IDBPDatabase<PastaCounterDB>> | null = null;

export const Database = {
  async init() {
    if (!dbPromise) {
      dbPromise = openDB<PastaCounterDB>('PastaCounterDB', 1, {
        upgrade(db) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('by-startTime', 'start_time');

          const countStore = db.createObjectStore('counts', { keyPath: 'id', autoIncrement: true });
          countStore.createIndex('by-session', 'session_id');
        },
      });
    }
    return dbPromise;
  },

  async getDB() {
    if (!dbPromise) {
      return this.init();
    }
    return dbPromise;
  }
};
