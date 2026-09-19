import { SCHEMA_SQL } from './schema.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from './security.ts';
import { HttpError } from './validation.ts';
import type { Capture, CaptureEvent, Project, StoredSession, User } from './types.ts';
export class Store {
    db: DatabaseSync;
    constructor(path: string) {
        if (path !== ':memory:')
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        this.db = new DatabaseSync(path);
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
${SCHEMA_SQL}`);
    }
    close() { this.db.close(); }
    userForToken(token: string): User | undefined {
        return this.db.prepare('SELECT u.id,u.email,u.name FROM users u JOIN auth_sessions a ON a.user_id=u.id WHERE a.token_hash=? AND a.expires_at>?').get(hash(token), Date.now()) as User | undefined;
    }
    ownerProject(id: string, user: string): Project {
        const p = this.db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(id, user) as unknown as Project | undefined;
        if (!p)
            throw new HttpError(404, 'Project not found.');
        return p;
    }
    ownerSession(id: string, user: string): StoredSession {
        const s = this.db.prepare('SELECT s.* FROM sessions s JOIN projects p ON p.id=s.project_id WHERE s.id=? AND p.owner_id=?').get(id, user) as unknown as StoredSession | undefined;
        if (!s)
            throw new HttpError(404, 'Session not found.');
        return s;
    }
    saveCapture(project: string, capture: Capture) {
        const existing = this.db.prepare('SELECT id FROM sessions WHERE project_id=? AND client_id=?').get(project, capture.clientId);
        if (existing)
            return { id: String(existing.id), duplicate: true };
        const count = this.db.prepare('SELECT count(*) n FROM sessions WHERE project_id=?').get(project);
        if (Number(count?.n) >= 1000)
            throw new HttpError(429, 'Project limit reached. Delete old sessions first.');
        const id = randomUUID();
        const errors = capture.events.filter(e => e.kind === 'error');
        const first = errors[0];
        const fingerprint = hash(first ? `${first.data.name}:${first.data.message}`.replace(/\d+/g, '#') : `no-error:${capture.url}`).slice(0, 16);
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.prepare('INSERT INTO sessions(id,project_id,client_id,title,url,release,browser,viewport_width,viewport_height,duration,error_count,event_count,fingerprint,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                .run(id, project, capture.clientId, capture.title, capture.url, capture.release, capture.browser, capture.viewport.width, capture.viewport.height, capture.duration, errors.length, capture.events.length, fingerprint, Date.now());
            const insert = this.db.prepare('INSERT INTO events(session_id,position,kind,at,data) VALUES(?,?,?,?,?)');
            capture.events.forEach((event, i) => insert.run(id, i, event.kind, event.at, JSON.stringify(event.data)));
            this.db.exec('COMMIT');
            return { id, duplicate: false };
        }
        catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
    events(id: string): CaptureEvent[] { return this.db.prepare('SELECT kind,at,data FROM events WHERE session_id=? ORDER BY position').all(id).map(e => ({ kind: e.kind as CaptureEvent['kind'], at: Number(e.at), data: JSON.parse(String(e.data)) })); }
    rateLimit(bucket: string, max: number, windowMs = 60000) {
        const now = Date.now();
        this.db.prepare('INSERT INTO limits(bucket,count,resets_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN resets_at<=? THEN 1 ELSE count+1 END,resets_at=CASE WHEN resets_at<=? THEN ? ELSE resets_at END').run(bucket, now + windowMs, now, now, now + windowMs);
        const row = this.db.prepare('SELECT count FROM limits WHERE bucket=?').get(bucket);
        if (Number(row?.count) > max)
            throw new HttpError(429, 'Too many requests. Try again shortly.');
    }
    purge(days: number) {
        const now = Date.now();
        this.db.prepare('DELETE FROM sessions WHERE created_at<?').run(now - days * 86400000);
        this.db.prepare('DELETE FROM auth_sessions WHERE expires_at<?').run(now);
        this.db.prepare('DELETE FROM shares WHERE expires_at<?').run(now);
        this.db.prepare('DELETE FROM limits WHERE resets_at<?').run(now - 3600000);
    }
}
