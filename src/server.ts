import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './store.ts';
import { hash, randomToken, passwordHash, verifyPassword, cookieValue } from './security.ts';
import { HttpError, requiredString, parseOrigins, validateCapture } from './validation.ts';
import { text, safeUrl } from './privacy.ts';
import { generatePlaywright, issueMarkdown } from './exports.ts';
import { parseSourceMap, originalPosition } from './sourcemaps.ts';
import type { User, Project, StoredSession } from './types.ts';
const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
export interface AppOptions {
    database?: string;
    origin?: string;
    secure?: boolean;
    retention?: number;
    githubToken?: string;
    githubAllowedRepos?: string[];
}
export function createApp(options: AppOptions = {}) {
    const store = new Store(options.database ?? process.env.DATABASE_PATH ?? '.data/reprolab.sqlite');
    const origin = new URL(options.origin ?? process.env.APP_ORIGIN ?? 'http://localhost:4318').origin;
    const secure = options.secure ?? process.env.COOKIE_SECURE === '1';
    const retention = Math.max(1, Math.min(90, options.retention ?? (Number(process.env.RETENTION_DAYS) || 14)));
    const githubToken = options.githubToken ?? process.env.GITHUB_TOKEN;
    const githubAllowedRepos = new Set((options.githubAllowedRepos ?? (process.env.GITHUB_ALLOWED_REPOS ?? '').split(',')).map(r => r.trim().toLowerCase()).filter(Boolean));
    let lastPurge = 0;
    const json = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    const requireUser = (req: IncomingMessage): User => { const user = store.userForToken(cookieValue(req.headers.cookie, 'repro_session')); if (!user)
        throw new HttpError(401, 'Sign in to continue.'); return user; };
    const csrf = (req: IncomingMessage) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET') && req.headers.origin !== origin)
        throw new HttpError(403, 'Request origin is not allowed.'); };
    async function body(req: IncomingMessage, limit = 3000000): Promise<Record<string, unknown>> {
        if (!req.headers['content-type']?.startsWith('application/json'))
            throw new HttpError(415, 'Use application/json.');
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
            size += chunk.length;
            if (size > limit)
                throw new HttpError(413, 'Request exceeds the 3 MB limit.');
            chunks.push(chunk);
        }
        let v;
        try {
            v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
        catch {
            throw new HttpError(400, 'Invalid JSON.');
        }
        if (!v || typeof v !== 'object' || Array.isArray(v))
            throw new HttpError(400, 'Expected a JSON object.');
        return v;
    }
    function issueCookie(res: ServerResponse, userId: string) { const token = randomToken(); store.db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(token), userId, Date.now() + 7 * 86400000); res.setHeader('Set-Cookie', `repro_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure ? '; Secure' : ''}`); }
    function detail(s: StoredSession, shared = false) {
        return { ...s, events: store.events(s.id), notes: shared ? [] : store.db.prepare('SELECT * FROM notes WHERE session_id=? ORDER BY created_at').all(s.id) };
    }
    const server = createServer(async (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
        try {
            const url = new URL(req.url ?? '/', origin), path = url.pathname, method = req.method ?? 'GET';
            if (Date.now() - lastPurge > 600000) {
                store.purge(retention);
                lastPurge = Date.now();
            }
            if (path === '/api/health' && method === 'GET') {
                store.db.prepare('SELECT 1').get();
                return json(res, 200, { ok: true, version: '0.1.0', storage: 'sqlite' });
            }
            if (path === '/api/ingest') {
                if (method === 'OPTIONS') {
                    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? 'null');
                    res.setHeader('Vary', 'Origin');
                    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Repro-Key');
                    res.writeHead(204);
                    return res.end();
                }
                if (method !== 'POST')
                    throw new HttpError(405, 'Use POST.');
                const key = String(req.headers['x-repro-key'] ?? '');
                if (key.length < 30)
                    throw new HttpError(401, 'A capture key is required.');
                const p = store.db.prepare('SELECT * FROM projects WHERE key_hash=?').get(hash(key)) as unknown as Project | undefined;
                if (!p)
                    throw new HttpError(401, 'Invalid capture key.');
                if (req.headers.origin && !(JSON.parse(p.origins) as string[]).includes(req.headers.origin))
                    throw new HttpError(403, 'This website origin is not allowed for this project.');
                if (req.headers.origin) {
                    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
                    res.setHeader('Vary', 'Origin');
                }
                store.rateLimit(`ingest:${p.id}`, 60);
                const capture = validateCapture(await body(req));
                let captureOrigin = '';
                try {
                    captureOrigin = new URL(capture.url).origin;
                }
                catch { /* rejected below */ }
                if (!(JSON.parse(p.origins) as string[]).includes(captureOrigin))
                    throw new HttpError(403, 'Capture URL does not match an allowed origin.');
                const result = store.saveCapture(p.id, capture);
                return json(res, result.duplicate ? 200 : 201, result);
            }
            if (path.startsWith('/api/shared/') && method === 'GET') {
                const token = path.split('/').at(-1) ?? '';
                const row = store.db.prepare('SELECT s.* FROM sessions s JOIN shares sh ON sh.session_id=s.id WHERE sh.token_hash=? AND sh.expires_at>?').get(hash(token), Date.now()) as unknown as StoredSession | undefined;
                if (!row)
                    throw new HttpError(404, 'This share has expired or was revoked.');
                const { project_id, client_id, github_url, ...safe } = detail(row, true);
                void project_id;
                void client_id;
                void github_url;
                return json(res, 200, safe);
            }
            if (path.startsWith('/api/')) {
                csrf(req);
                if (path === '/api/auth/me' && method === 'GET') {
                    const user = store.userForToken(cookieValue(req.headers.cookie, 'repro_session'));
                    return json(res, 200, { user, githubConfigured: Boolean(githubToken && githubAllowedRepos.size), retentionDays: retention });
                }
                if (['/api/auth/register', '/api/auth/login'].includes(path) && method === 'POST') {
                    store.rateLimit(`auth:${req.socket.remoteAddress}`, 15, 15 * 60000);
                    const v = await body(req, 10000);
                    const email = requiredString(v.email, 'Email', 3, 254).toLowerCase();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                        throw new HttpError(400, 'Enter a valid email address.');
                    if (typeof v.password !== 'string' || v.password.length < 12 || v.password.length > 128 || !v.password.trim())
                        throw new HttpError(400, 'Password must contain 12–128 characters.');
                    const pass = v.password;
                    if (path.endsWith('register')) {
                        const name = requiredString(v.name, 'Name', 1, 60), id = randomUUID();
                        if (store.db.prepare('SELECT id FROM users WHERE email=?').get(email))
                            throw new HttpError(409, 'That email is already registered.');
                        store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, email, name, passwordHash(pass), Date.now());
                        issueCookie(res, id);
                        return json(res, 201, { user: { id, email, name } });
                    }
                    const row = store.db.prepare('SELECT * FROM users WHERE email=?').get(email);
                    // Equal-cost hashing even for unknown accounts avoids a cheap timing oracle.
                    const valid = verifyPassword(pass, String(row?.password ?? '00000000000000000000000000000000:' + '00'.repeat(64)));
                    if (!row || !valid)
                        throw new HttpError(401, 'Email or password is incorrect.');
                    issueCookie(res, String(row.id));
                    return json(res, 200, { user: { id: row.id, email: row.email, name: row.name } });
                }
                if (path === '/api/auth/logout' && method === 'POST') {
                    store.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash(cookieValue(req.headers.cookie, 'repro_session')));
                    res.setHeader('Set-Cookie', `repro_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`);
                    return json(res, 200, { ok: true });
                }
                const user = requireUser(req);
                if (path === '/api/projects' && method === 'GET') {
                    return json(res, 200, store.db.prepare('SELECT p.id,p.name,p.origins,p.repo,p.created_at,(SELECT count(*) FROM sessions s WHERE s.project_id=p.id) session_count FROM projects p WHERE owner_id=? ORDER BY created_at').all(user.id).map(p => ({ ...p, origins: JSON.parse(String(p.origins)) })));
                }
                if (path === '/api/projects' && method === 'POST') {
                    const v = await body(req, 10000), name = requiredString(v.name, 'Project name', 1, 80), origins = parseOrigins(v.origins);
                    if (Number(store.db.prepare('SELECT count(*) n FROM projects WHERE owner_id=?').get(user.id)?.n) >= 20)
                        throw new HttpError(400, 'A workspace supports up to 20 projects.');
                    const id = randomUUID(), key = randomToken();
                    store.db.prepare('INSERT INTO projects(id,owner_id,name,origins,key_hash,created_at) VALUES(?,?,?,?,?,?)').run(id, user.id, name, JSON.stringify(origins), hash(key), Date.now());
                    return json(res, 201, { id, name, origins, captureKey: key });
                }
                const projectMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9-]+)(?:\/(rotate-key|source-maps))?$/);
                if (projectMatch) {
                    const id = projectMatch[1]!, action = projectMatch[2];
                    store.ownerProject(id, user.id);
                    if (action === 'rotate-key' && method === 'POST') {
                        const key = randomToken();
                        store.db.prepare('UPDATE projects SET key_hash=? WHERE id=?').run(hash(key), id);
                        return json(res, 200, { captureKey: key });
                    }
                    if (action === 'source-maps') {
                        if (method === 'GET')
                            return json(res, 200, store.db.prepare('SELECT id,asset,release,created_at FROM source_maps WHERE project_id=? ORDER BY created_at DESC').all(id));
                        if (method === 'POST') {
                            const v = await body(req), asset = requiredString(v.asset, 'Asset URL', 1, 500), release = requiredString(v.release, 'Release', 1, 80), map = parseSourceMap(v.map);
                            const sid = randomUUID();
                            store.db.prepare('INSERT INTO source_maps(id,project_id,asset,release,data,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,asset,release) DO UPDATE SET data=excluded.data,created_at=excluded.created_at').run(sid, id, safeUrl(asset), release, JSON.stringify(map), Date.now());
                            return json(res, 201, { ok: true });
                        }
                    }
                    if (!action && method === 'PATCH') {
                        const v = await body(req, 10000), name = requiredString(v.name, 'Project name', 1, 80), origins = parseOrigins(v.origins);
                        const repo = String(v.repo ?? '');
                        if (repo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
                            throw new HttpError(400, 'Repository must be owner/name.');
                        store.db.prepare('UPDATE projects SET name=?,origins=?,repo=? WHERE id=?').run(name, JSON.stringify(origins), repo, id);
                        return json(res, 200, { ok: true });
                    }
                    if (!action && method === 'DELETE') {
                        const v = await body(req, 2000);
                        if (v.confirm !== true)
                            throw new HttpError(400, 'Confirm project deletion.');
                        store.db.prepare('DELETE FROM projects WHERE id=?').run(id);
                        return json(res, 200, { ok: true });
                    }
                }
                if (path === '/api/sessions' && method === 'GET') {
                    const project = url.searchParams.get('project');
                    if (!project)
                        throw new HttpError(400, 'Choose a project.');
                    store.ownerProject(project, user.id);
                    const search = (url.searchParams.get('search') ?? '').slice(0, 100), status = url.searchParams.get('status') ?? '';
                    const rows = store.db.prepare(`SELECT * FROM sessions WHERE project_id=? AND title LIKE ? AND (?='' OR status=?) ORDER BY created_at DESC LIMIT 250`).all(project, `%${search}%`, status, status);
                    const stats = store.db.prepare("SELECT count(*) total,coalesce(sum(error_count),0) errors,coalesce(sum(CASE WHEN status='resolved' THEN 1 ELSE 0 END),0) resolved,count(DISTINCT CASE WHEN error_count>0 THEN fingerprint END) groups FROM sessions WHERE project_id=?").get(project);
                    return json(res, 200, { sessions: rows, stats });
                }
                const match = path.match(/^\/api\/sessions\/([a-zA-Z0-9-]+)(?:\/(export|notes|share|github|symbolicate))?$/);
                if (match) {
                    const id = match[1]!, action = match[2], session = store.ownerSession(id, user.id);
                    if (!action && method === 'GET')
                        return json(res, 200, detail(session));
                    if (!action && method === 'PATCH') {
                        const v = await body(req, 2000);
                        if (!['new', 'investigating', 'resolved', 'ignored'].includes(String(v.status)))
                            throw new HttpError(400, 'Invalid triage state.');
                        store.db.prepare('UPDATE sessions SET status=? WHERE id=?').run(String(v.status), id);
                        return json(res, 200, { ok: true });
                    }
                    if (!action && method === 'DELETE') {
                        store.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
                        return json(res, 200, { ok: true });
                    }
                    if (action === 'notes' && method === 'POST') {
                        const v = await body(req, 5000), note = requiredString(v.body, 'Note', 1, 2000);
                        store.db.prepare('INSERT INTO notes VALUES(?,?,?,?)').run(randomUUID(), id, note, Date.now());
                        return json(res, 201, { ok: true });
                    }
                    if (action === 'share' && method === 'POST') {
                        const v = await body(req, 2000);
                        const hours = Number(v.hours ?? 24);
                        if (!Number.isFinite(hours) || hours < 1 || hours > 168)
                            throw new HttpError(400, 'Shares last 1–168 hours.');
                        const token = randomToken();
                        store.db.prepare('INSERT INTO shares VALUES(?,?,?)').run(hash(token), id, Date.now() + hours * 3600000);
                        return json(res, 201, { url: `${origin}/#/share/${token}`, expiresAt: Date.now() + hours * 3600000 });
                    }
                    if (action === 'share' && method === 'DELETE') {
                        store.db.prepare('DELETE FROM shares WHERE session_id=?').run(id);
                        return json(res, 200, { ok: true });
                    }
                    if (action === 'export' && method === 'GET') {
                        const format = url.searchParams.get('format'), events = store.events(id);
                        let output: string, ext: string, type: string;
                        if (format === 'playwright') {
                            output = generatePlaywright(session, events);
                            ext = 'spec.js';
                            type = 'text/javascript';
                        }
                        else if (format === 'markdown') {
                            output = issueMarkdown(session, events);
                            ext = 'md';
                            type = 'text/markdown';
                        }
                        else if (format === 'json') {
                            output = JSON.stringify({ version: 1, session, events }, null, 2);
                            ext = 'json';
                            type = 'application/json';
                        }
                        else
                            throw new HttpError(400, 'Choose playwright, markdown or json.');
                        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Content-Disposition': `attachment; filename="repro-${id.slice(0, 8)}.${ext}"`, 'Cache-Control': 'no-store' });
                        return res.end(output);
                    }
                    if (action === 'symbolicate' && method === 'POST') {
                        const errors = store.events(id).filter(e => e.kind === 'error');
                        const positions = [];
                        for (const event of errors)
                            for (const line of String(event.data.stack ?? '').split('\n')) {
                                const m = line.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
                                if (!m)
                                    continue;
                                const map = store.db.prepare('SELECT data FROM source_maps WHERE project_id=? AND asset=? AND release=?').get(session.project_id, safeUrl(m[1]), session.release);
                                if (map)
                                    positions.push({ generated: line, ...originalPosition(parseSourceMap(JSON.parse(String(map.data))), Number(m[2]), Number(m[3])) });
                            }
                        return json(res, 200, { positions });
                    }
                    if (action === 'github' && method === 'POST') {
                        const v = await body(req, 2000);
                        if (v.confirm !== true)
                            throw new HttpError(400, 'Review the report and explicitly confirm issue creation.');
                        if (session.github_url)
                            return json(res, 200, { url: session.github_url, existing: true });
                        const project = store.ownerProject(session.project_id, user.id);
                        if (!githubToken || !project.repo)
                            throw new HttpError(409, 'Set a server-side GITHUB_TOKEN and a project repository, or export Markdown.');
                        if (!githubAllowedRepos.has(project.repo.toLowerCase()))
                            throw new HttpError(403, 'This repository is not in the server GITHUB_ALLOWED_REPOS allowlist.');
                        store.rateLimit(`github:${user.id}`, 5);
                        const response = await fetch(`https://api.github.com/repos/${project.repo}/issues`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }, body: JSON.stringify({ title: session.title, body: issueMarkdown(session, store.events(id)) }) });
                        if (!response.ok)
                            throw new HttpError(502, `GitHub rejected the request (${response.status}). Verify repository permissions.`);
                        const issue = await response.json() as {
                            html_url: string;
                        };
                        if (!issue.html_url?.startsWith(`https://github.com/${project.repo}/issues/`))
                            throw new HttpError(502, 'Unexpected GitHub response.');
                        store.db.prepare('UPDATE sessions SET github_url=? WHERE id=?').run(issue.html_url, id);
                        return json(res, 201, { url: issue.html_url });
                    }
                }
                if (path === '/api/sandbox/checkout' && method === 'POST') {
                    await body(req, 2000);
                    return json(res, 503, { error: 'Inventory service unavailable', code: 'INVENTORY_OFFLINE' });
                }
                throw new HttpError(404, 'API route not found.');
            }
            if (method !== 'GET' && method !== 'HEAD')
                throw new HttpError(405, 'Method not allowed.');
            const relative = path === '/' || path === '/index.html' ? 'index.html' : path === '/sandbox' ? 'sandbox.html' : path.slice(1);
            let decoded: string;
            try {
                decoded = decodeURIComponent(relative);
            }
            catch {
                throw new HttpError(400, 'Invalid path.');
            }
            const file = resolve(publicDir, decoded);
            if (!file.startsWith(publicDir + sep) || decoded.includes('\0'))
                throw new HttpError(404, 'Not found.');
            const ext = extname(file);
            const mimes: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json' };
            if (!mimes[ext])
                throw new HttpError(404, 'Not found.');
            const data = await readFile(file).catch(() => { throw new HttpError(404, 'Not found.'); });
            res.setHeader('Cache-Control', 'no-cache');
            res.writeHead(200, { 'Content-Type': `${mimes[ext]}; charset=utf-8` });
            res.end(method === 'HEAD' ? undefined : data);
        }
        catch (error) {
            const status = error instanceof HttpError ? error.status : 500;
            if (status === 500)
                console.error('ReproLab request failed:', error instanceof Error ? error.name : 'UnknownError');
            if (!res.headersSent)
                json(res, status, { error: error instanceof HttpError ? error.message : 'Something went wrong. Try again.' });
            else
                res.end();
        }
    });
    server.requestTimeout = 30000;
    server.headersTimeout = 15000;
    server.on('close', () => store.close());
    return { server, store };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const port = Number(process.env.PORT ?? 4318), host = process.env.HOST ?? '127.0.0.1';
    if (host !== '127.0.0.1' && host !== 'localhost' && process.env.COOKIE_SECURE !== '1' && process.env.ALLOW_INSECURE_LAN !== '1')
        throw new Error('Network binding requires COOKIE_SECURE=1 behind HTTPS, or explicit ALLOW_INSECURE_LAN=1 for trusted local testing.');
    const { server } = createApp();
    server.listen(port, host, () => console.log(`ReproLab is running at ${process.env.APP_ORIGIN ?? `http://localhost:${port}`}`));
    for (const sig of ['SIGINT', 'SIGTERM'] as const)
        process.on(sig, () => server.close(() => process.exit(0)));
}
