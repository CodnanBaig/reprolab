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
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, origins TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, repo TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, client_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, release TEXT NOT NULL, browser TEXT NOT NULL, viewport_width INTEGER NOT NULL, viewport_height INTEGER NOT NULL, duration INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', error_count INTEGER NOT NULL, event_count INTEGER NOT NULL, fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, github_url TEXT, UNIQUE(project_id,client_id));
    CREATE TABLE IF NOT EXISTS events (session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, position INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session_id,position));
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS shares (token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS source_maps (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, asset TEXT NOT NULL, release TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(project_id,asset,release));
    CREATE TABLE IF NOT EXISTS limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_project_date ON sessions(project_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS sessions_fingerprint ON sessions(project_id,fingerprint);
    CREATE INDEX IF NOT EXISTS auth_expiry ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id);`);
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
