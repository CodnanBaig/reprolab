import { randomUUID } from 'node:crypto';
import { hash } from './security.ts';
import { HttpError } from './validation.ts';
import type { Capture, CaptureEvent, Project, StoredSession, User } from './types.ts';
import type { Persistence, SqlClient, SqlExecutor, SqlStatement, SqlValue } from './persistence.ts';

const statement = (sql: string, ...args: SqlValue[]): SqlStatement => ({ sql, args });
/** Async persistence backed by a durable libSQL service, never a serverless local file. */
export class RemoteStore implements Persistence {
  readonly client: SqlClient;
  readonly db: Persistence['db'];
  constructor(client: SqlClient) {
    this.client = client;
    this.db = { prepare: (sql) => ({
      get: async (...args) => (await client.execute(statement(sql, ...args))).rows[0],
      all: async (...args) => (await client.execute(statement(sql, ...args))).rows,
      run: async (...args) => client.execute(statement(sql, ...args)),
    }) };
  }
  close() { this.client.close(); }
  async userForToken(token: string): Promise<User | undefined> {
    if (!token) return undefined;
    return await this.db.prepare('SELECT u.id,u.email,u.name FROM users u JOIN auth_sessions a ON a.user_id=u.id WHERE a.token_hash=? AND a.expires_at>?').get(hash(token), Date.now()) as User | undefined;
  }
  async ownerProject(id: string, user: string): Promise<Project> {
    const p = await this.db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(id, user) as unknown as Project | undefined;
    if (!p) throw new HttpError(404, 'Project not found.');
    return p;
  }
  async ownerSession(id: string, user: string): Promise<StoredSession> {
    const s = await this.db.prepare('SELECT s.* FROM sessions s JOIN projects p ON p.id=s.project_id WHERE s.id=? AND p.owner_id=?').get(id, user) as unknown as StoredSession | undefined;
    if (!s) throw new HttpError(404, 'Session not found.');
    return s;
  }
  async saveCapture(project: string, capture: Capture) {
    // Quota, deduplication, session and events share one remote write transaction.
    // No in-process mutex is relied on across serverless instances.
    const tx = await this.client.transaction('write');
    try {
      const existing = (await tx.execute(statement('SELECT id FROM sessions WHERE project_id=? AND client_id=?', project, capture.clientId))).rows[0];
      if (existing) { await tx.rollback(); return { id: String(existing.id), duplicate: true }; }
      const count = (await tx.execute(statement('SELECT count(*) n FROM sessions WHERE project_id=?', project))).rows[0];
      if (Number(count?.n) >= 1000) throw new HttpError(429, 'Project limit reached. Delete old sessions first.');
      const id = randomUUID(), errors = capture.events.filter((e) => e.kind === 'error'), first = errors[0];
      const fingerprint = hash(first ? `${first.data.name}:${first.data.message}`.replace(/\d+/g, '#') : `no-error:${capture.url}`).slice(0, 16);
      await tx.execute(statement('INSERT INTO sessions(id,project_id,client_id,title,url,release,browser,viewport_width,viewport_height,duration,error_count,event_count,fingerprint,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id, project, capture.clientId, capture.title, capture.url, capture.release, capture.browser, capture.viewport.width, capture.viewport.height, capture.duration, errors.length, capture.events.length, fingerprint, Date.now()));
      // Bound each request; no per-event HTTP round trips and no unbounded batch.
      for (let offset = 0; offset < capture.events.length; offset += 100) {
        await tx.batch(capture.events.slice(offset, offset + 100).map((event, index) => statement(
          'INSERT INTO events(session_id,position,kind,at,data) VALUES(?,?,?,?,?)', id, offset + index, event.kind, event.at, JSON.stringify(event.data))));
      }
      await tx.commit();
      return { id, duplicate: false };
    } catch (error) {
      try { await tx.rollback(); } catch { /* Preserve the original failure; never resubmit an uncertain commit automatically. */ }
      throw error;
    } finally { tx.close(); }
  }
  async events(id: string): Promise<CaptureEvent[]> {
    const rows = await this.db.prepare('SELECT kind,at,data FROM events WHERE session_id=? ORDER BY position').all(id);
    return rows.map((e) => ({ kind: e.kind as CaptureEvent['kind'], at: Number(e.at), data: JSON.parse(String(e.data)) }));
  }
  async rateLimit(bucket: string, max: number, windowMs = 60000) {
    const now = Date.now();
    // RETURNING makes the increment/check atomic across concurrent function instances.
    const row = await this.db.prepare('INSERT INTO limits(bucket,count,resets_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN resets_at<=? THEN 1 ELSE count+1 END,resets_at=CASE WHEN resets_at<=? THEN ? ELSE resets_at END RETURNING count')
      .get(bucket, now + windowMs, now, now, now + windowMs);
    if (Number(row?.count) > max) throw new HttpError(429, 'Too many requests. Try again shortly.');
  }
  async purge(days: number) {
    const now = Date.now();
    await this.client.batch([
      statement('DELETE FROM sessions WHERE created_at<?', now - days * 86400000),
      statement('DELETE FROM auth_sessions WHERE expires_at<?', now),
      statement('DELETE FROM shares WHERE expires_at<?', now),
      statement('DELETE FROM limits WHERE resets_at<?', now - 3600000),
    ]);
  }
}
