import { Database, SessionRecord, CountRecord } from './Database';

export const SessionRepository = {
  async createSession(session: SessionRecord): Promise<void> {
    const db = await Database.getDB();
    await db.put('sessions', session);
  },

  async updateSession(session: SessionRecord): Promise<void> {
    const db = await Database.getDB();
    await db.put('sessions', session);
  },

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const db = await Database.getDB();
    return db.get('sessions', id);
  },

  async getAllSessions(): Promise<SessionRecord[]> {
    const db = await Database.getDB();
    const sessions = await db.getAllFromIndex('sessions', 'by-startTime');
    return sessions.reverse(); // Newest first
  },

  async addCount(count: Omit<CountRecord, 'id'>): Promise<void> {
    const db = await Database.getDB();
    // @ts-expect-error - id is auto-incremented
    await db.add('counts', count);
  },

  async getCountsForSession(sessionId: string): Promise<CountRecord[]> {
    const db = await Database.getDB();
    return db.getAllFromIndex('counts', 'by-session', sessionId);
  }
};
