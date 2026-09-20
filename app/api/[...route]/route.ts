import { randomUUID } from 'node:crypto';
import { getStore } from '@/src/store';
import { hash, passwordHash, randomToken, verifyPassword, cookieValue } from '@/src/security';
import { HttpError, parseOrigins, requiredString, validateCapture } from '@/src/validation';
import { safeUrl } from '@/src/privacy';
import { generatePlaywright, issueMarkdown } from '@/src/exports';
import { originalPosition, parseSourceMap } from '@/src/sourcemaps';
import type { Project, StoredSession, User } from '@/src/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let lastPurge = 0;

function appOrigin(request: Request) {
    try {
        return new URL(process.env.APP_ORIGIN || request.url).origin;
    } catch {
        return new URL(request.url).origin;
    }
}

function retentionDays() {
    return Math.max(1, Math.min(90, Number(process.env.RETENTION_DAYS) || 14));
}

function secureCookies() {
    return process.env.COOKIE_SECURE === '1';
}

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Cache-Control', 'no-store');
    return Response.json(value, { status, headers: responseHeaders });
}

function errorResponse(error: unknown) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500)
        console.error('ReproLab request failed:', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: error instanceof HttpError ? error.message : 'Something went wrong. Try again.' }, status);
}

async function body(request: Request, limit = 3_000_000): Promise<Record<string, unknown>> {
    if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new HttpError(415, 'Use application/json.');
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > limit)
        throw new HttpError(413, 'Request exceeds the 3 MB limit.');
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        throw new HttpError(400, 'Invalid JSON.');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Expected a JSON object.');
    return value as Record<string, unknown>;
}

function cookie(userId: string) {
    const token = randomToken();
    return {
        token,
        header: `repro_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureCookies() ? '; Secure' : ''}`,
        userId
    };
}

function clearedCookie() {
    return `repro_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookies() ? '; Secure' : ''}`;
}

function clientAddress(request: Request) {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function csrf(request: Request, origin: string) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('origin') !== origin)
        throw new HttpError(403, 'Request origin is not allowed.');
}

async function requireUser(request: Request): Promise<User> {
    const store = await getStore();
    const user = await store.userForToken(cookieValue(request.headers.get('cookie') ?? undefined, 'repro_session'));
    if (!user)
        throw new HttpError(401, 'Sign in to continue.');
    return user;
}

async function detail(session: StoredSession, shared = false) {
    const store = await getStore();
    return { ...session, events: await store.events(session.id), notes: shared ? [] : await store.notesFor(session.id) };
}

function corsHeaders(request: Request): Record<string, string> {
    const origin = request.headers.get('origin');
    return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

export async function GET(request: Request, context: { params: Promise<{ route: string[] }> }) {
    return handle(request, (await context.params).route);
}

export async function POST(request: Request, context: { params: Promise<{ route: string[] }> }) {
    return handle(request, (await context.params).route);
}

export async function PATCH(request: Request, context: { params: Promise<{ route: string[] }> }) {
    return handle(request, (await context.params).route);
}

export async function DELETE(request: Request, context: { params: Promise<{ route: string[] }> }) {
    return handle(request, (await context.params).route);
}

export async function OPTIONS(request: Request, context: { params: Promise<{ route: string[] }> }) {
    return handle(request, (await context.params).route);
}

async function handle(request: Request, segments: string[]) {
    const path = `/api/${segments.join('/')}`;
    const origin = appOrigin(request);
    const url = new URL(request.url);
    const store = await getStore();
    const githubToken = process.env.GITHUB_TOKEN;
    const githubAllowedRepos = new Set((process.env.GITHUB_ALLOWED_REPOS ?? '').split(',').map(repo => repo.trim().toLowerCase()).filter(Boolean));

    try {
        if (Date.now() - lastPurge > 600_000) {
            await store.purge(retentionDays());
            lastPurge = Date.now();
        }

        if (path === '/api/health' && request.method === 'GET') {
            await store.ping();
            return json({ ok: true, version: '0.1.0', storage: 'mongodb' });
        }

        if (path === '/api/ingest') {
            if (request.method === 'OPTIONS')
                return new Response(null, { status: 204, headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Repro-Key' } });
            if (request.method !== 'POST')
                throw new HttpError(405, 'Use POST.');
            const key = request.headers.get('x-repro-key') ?? '';
            if (key.length < 30)
                throw new HttpError(401, 'A capture key is required.');
            const project = await store.projects.findOne({ key_hash: hash(key) }, { projection: { _id: 0 } });
            if (!project)
                throw new HttpError(401, 'Invalid capture key.');
            const captureOrigin = request.headers.get('origin');
            if (captureOrigin && !project.origins.includes(captureOrigin))
                throw new HttpError(403, 'This website origin is not allowed for this project.');
            await store.rateLimit(`ingest:${project.id}`, 60);
            const capture = validateCapture(await body(request));
            let recordedOrigin = '';
            try {
                recordedOrigin = new URL(capture.url).origin;
            } catch {
                // Validation will reject this capture below.
            }
            if (!project.origins.includes(recordedOrigin))
                throw new HttpError(403, 'Capture URL does not match an allowed origin.');
            const result = await store.saveCapture(project.id, capture);
            return json(result, result.duplicate ? 200 : 201, corsHeaders(request));
        }

        if (segments[0] === 'shared' && request.method === 'GET') {
            const token = segments[1] ?? '';
            const share = await store.shares.findOne({ token_hash: hash(token), expires_at: { $gt: Date.now() } });
            const session = share ? await store.session(share.session_id) : undefined;
            if (!session)
                throw new HttpError(404, 'This share has expired or was revoked.');
            const { events: _events, project_id: _projectId, client_id: _clientId, github_url: _githubUrl, ...safeSession } = session;
            void _events;
            void _projectId;
            void _clientId;
            void _githubUrl;
            return json({ ...safeSession, events: await store.events(session.id), notes: [] });
        }

        csrf(request, origin);

        if (path === '/api/auth/me' && request.method === 'GET') {
            const user = await store.userForToken(cookieValue(request.headers.get('cookie') ?? undefined, 'repro_session'));
            return json({ user, githubConfigured: Boolean(githubToken && githubAllowedRepos.size), retentionDays: retentionDays() });
        }

        if ((path === '/api/auth/register' || path === '/api/auth/login') && request.method === 'POST') {
            await store.rateLimit(`auth:${clientAddress(request)}`, 15, 15 * 60_000);
            const value = await body(request, 10_000);
            const email = requiredString(value.email, 'Email', 3, 254).toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                throw new HttpError(400, 'Enter a valid email address.');
            if (typeof value.password !== 'string' || value.password.length < 12 || value.password.length > 128 || !value.password.trim())
                throw new HttpError(400, 'Password must contain 12–128 characters.');
            if (path.endsWith('register')) {
                const name = requiredString(value.name, 'Name', 1, 60);
                const id = randomUUID();
                try {
                    await store.users.insertOne({ id, email, name, password: passwordHash(value.password), created_at: Date.now() });
                } catch (error) {
                    if (error instanceof Error && 'code' in error && error.code === 11000)
                        throw new HttpError(409, 'That email is already registered.');
                    throw error;
                }
                const issued = cookie(id);
                await store.authSessions.insertOne({ token_hash: hash(issued.token), user_id: id, expires_at: Date.now() + 7 * 86_400_000 });
                return json({ user: { id, email, name } }, 201, { 'Set-Cookie': issued.header });
            }
            const row = await store.users.findOne({ email });
            const valid = verifyPassword(value.password, row?.password ?? `00000000000000000000000000000000:${'00'.repeat(64)}`);
            if (!row || !valid)
                throw new HttpError(401, 'Email or password is incorrect.');
            const issued = cookie(row.id);
            await store.authSessions.insertOne({ token_hash: hash(issued.token), user_id: row.id, expires_at: Date.now() + 7 * 86_400_000 });
            return json({ user: { id: row.id, email: row.email, name: row.name } }, 200, { 'Set-Cookie': issued.header });
        }

        if (path === '/api/auth/logout' && request.method === 'POST') {
            await store.authSessions.deleteOne({ token_hash: hash(cookieValue(request.headers.get('cookie') ?? undefined, 'repro_session')) });
            return json({ ok: true }, 200, { 'Set-Cookie': clearedCookie() });
        }

        const user = await requireUser(request);

        if (path === '/api/projects' && request.method === 'GET') {
            const projects = await store.projects.aggregate<Project & { session_count: number }>([
                { $match: { owner_id: user.id } },
                { $lookup: { from: 'sessions', localField: 'id', foreignField: 'project_id', as: 'recordings' } },
                { $project: { _id: 0, id: 1, name: 1, origins: 1, repo: 1, created_at: 1, session_count: { $size: '$recordings' } } },
                { $sort: { created_at: 1 } }
            ]).toArray();
            return json(projects);
        }

        if (path === '/api/projects' && request.method === 'POST') {
            const value = await body(request, 10_000);
            const name = requiredString(value.name, 'Project name', 1, 80);
            const origins = parseOrigins(value.origins);
            if (await store.projects.countDocuments({ owner_id: user.id }) >= 20)
                throw new HttpError(400, 'A workspace supports up to 20 projects.');
            const id = randomUUID();
            const captureKey = randomToken();
            await store.projects.insertOne({ id, owner_id: user.id, name, origins, key_hash: hash(captureKey), repo: '', created_at: Date.now() });
            return json({ id, name, origins, captureKey }, 201);
        }

        const projectMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9-]+)(?:\/(rotate-key|source-maps))?$/);
        if (projectMatch) {
            const id = projectMatch[1]!;
            const action = projectMatch[2];
            await store.ownerProject(id, user.id);
            if (action === 'rotate-key' && request.method === 'POST') {
                const captureKey = randomToken();
                await store.projects.updateOne({ id }, { $set: { key_hash: hash(captureKey) } });
                return json({ captureKey });
            }
            if (action === 'source-maps') {
                if (request.method === 'GET') {
                    const maps = await store.sourceMaps.find({ project_id: id }, { projection: { _id: 0, id: 1, asset: 1, release: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray();
                    return json(maps);
                }
                if (request.method === 'POST') {
                    const value = await body(request);
                    const asset = safeUrl(requiredString(value.asset, 'Asset URL', 1, 500));
                    const release = requiredString(value.release, 'Release', 1, 80);
                    const map = parseSourceMap(value.map);
                    await store.sourceMaps.updateOne({ project_id: id, asset, release }, { $set: { data: map, created_at: Date.now() }, $setOnInsert: { id: randomUUID(), project_id: id, asset, release } }, { upsert: true });
                    return json({ ok: true }, 201);
                }
            }
            if (!action && request.method === 'PATCH') {
                const value = await body(request, 10_000);
                const name = requiredString(value.name, 'Project name', 1, 80);
                const origins = parseOrigins(value.origins);
                const repo = String(value.repo ?? '');
                if (repo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
                    throw new HttpError(400, 'Repository must be owner/name.');
                await store.projects.updateOne({ id }, { $set: { name, origins, repo } });
                return json({ ok: true });
            }
            if (!action && request.method === 'DELETE') {
                const value = await body(request, 2_000);
                if (value.confirm !== true)
                    throw new HttpError(400, 'Confirm project deletion.');
                await store.deleteProject(id);
                return json({ ok: true });
            }
        }

        if (path === '/api/sessions' && request.method === 'GET') {
            const projectId = url.searchParams.get('project');
            if (!projectId)
                throw new HttpError(400, 'Choose a project.');
            await store.ownerProject(projectId, user.id);
            const search = (url.searchParams.get('search') ?? '').slice(0, 100);
            const status = url.searchParams.get('status') ?? '';
            const filter: Record<string, unknown> = { project_id: projectId, title: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } };
            if (status)
                filter.status = status;
            const [sessions, statRows] = await Promise.all([
                store.sessions.find(filter, { projection: { _id: 0, events: 0 } }).sort({ created_at: -1 }).limit(250).toArray(),
                store.sessions.aggregate<{ total: number; errors: number; resolved: number; groups: number }>([
                    { $match: { project_id: projectId } },
                    { $group: { _id: null, total: { $sum: 1 }, errors: { $sum: '$error_count' }, resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }, fingerprints: { $addToSet: { $cond: [{ $gt: ['$error_count', 0] }, '$fingerprint', '$$REMOVE'] } } } },
                    { $project: { _id: 0, total: 1, errors: 1, resolved: 1, groups: { $size: '$fingerprints' } } }
                ]).toArray()
            ]);
            return json({ sessions, stats: statRows[0] ?? { total: 0, errors: 0, resolved: 0, groups: 0 } });
        }

        const sessionMatch = path.match(/^\/api\/sessions\/([a-zA-Z0-9-]+)(?:\/(export|notes|share|github|symbolicate))?$/);
        if (sessionMatch) {
            const id = sessionMatch[1]!;
            const action = sessionMatch[2];
            const session = await store.ownerSession(id, user.id);
            if (!action && request.method === 'GET')
                return json(await detail(session));
            if (!action && request.method === 'PATCH') {
                const value = await body(request, 2_000);
                if (!['new', 'investigating', 'resolved', 'ignored'].includes(String(value.status)))
                    throw new HttpError(400, 'Invalid triage state.');
                await store.sessions.updateOne({ id }, { $set: { status: String(value.status) } });
                return json({ ok: true });
            }
            if (!action && request.method === 'DELETE') {
                await store.deleteSession(id);
                return json({ ok: true });
            }
            if (action === 'notes' && request.method === 'POST') {
                const value = await body(request, 5_000);
                const note = requiredString(value.body, 'Note', 1, 2_000);
                await store.notes.insertOne({ id: randomUUID(), session_id: id, body: note, created_at: Date.now() });
                return json({ ok: true }, 201);
            }
            if (action === 'share' && request.method === 'POST') {
                const value = await body(request, 2_000);
                const hours = Number(value.hours ?? 24);
                if (!Number.isFinite(hours) || hours < 1 || hours > 168)
                    throw new HttpError(400, 'Shares last 1–168 hours.');
                const token = randomToken();
                const expiresAt = Date.now() + hours * 3_600_000;
                await store.shares.insertOne({ token_hash: hash(token), session_id: id, expires_at: expiresAt });
                return json({ url: `${origin}/#/share/${token}`, expiresAt }, 201);
            }
            if (action === 'share' && request.method === 'DELETE') {
                await store.shares.deleteMany({ session_id: id });
                return json({ ok: true });
            }
            if (action === 'export' && request.method === 'GET') {
                const format = url.searchParams.get('format');
                const events = await store.events(id);
                let output: string;
                let extension: string;
                let type: string;
                if (format === 'playwright') {
                    output = generatePlaywright(session, events);
                    extension = 'spec.js';
                    type = 'text/javascript';
                } else if (format === 'markdown') {
                    output = issueMarkdown(session, events);
                    extension = 'md';
                    type = 'text/markdown';
                } else if (format === 'json') {
                    output = JSON.stringify({ version: 1, session, events }, null, 2);
                    extension = 'json';
                    type = 'application/json';
                } else {
                    throw new HttpError(400, 'Choose playwright, markdown or json.');
                }
                return new Response(output, { headers: { 'Content-Type': `${type}; charset=utf-8`, 'Content-Disposition': `attachment; filename=\"repro-${id.slice(0, 8)}.${extension}\"`, 'Cache-Control': 'no-store' } });
            }
            if (action === 'symbolicate' && request.method === 'POST') {
                await body(request, 2_000);
                const positions = [];
                for (const event of (await store.events(id)).filter(item => item.kind === 'error')) {
                    for (const line of String(event.data.stack ?? '').split('\n')) {
                        const match = line.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
                        if (!match)
                            continue;
                        const map = await store.sourceMaps.findOne({ project_id: session.project_id, asset: safeUrl(match[1]), release: session.release });
                        if (map)
                            positions.push({ generated: line, ...originalPosition(parseSourceMap(map.data), Number(match[2]), Number(match[3])) });
                    }
                }
                return json({ positions });
            }
            if (action === 'github' && request.method === 'POST') {
                const value = await body(request, 2_000);
                if (value.confirm !== true)
                    throw new HttpError(400, 'Review the report and explicitly confirm issue creation.');
                if (session.github_url)
                    return json({ url: session.github_url, existing: true });
                const project = await store.ownerProject(session.project_id, user.id);
                if (!githubToken || !project.repo)
                    throw new HttpError(409, 'Set a server-side GITHUB_TOKEN and a project repository, or export Markdown.');
                if (!githubAllowedRepos.has(project.repo.toLowerCase()))
                    throw new HttpError(403, 'This repository is not in the server GITHUB_ALLOWED_REPOS allowlist.');
                await store.rateLimit(`github:${user.id}`, 5);
                const response = await fetch(`https://api.github.com/repos/${project.repo}/issues`, {
                    method: 'POST',
                    signal: AbortSignal.timeout(15_000),
                    headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
                    body: JSON.stringify({ title: session.title, body: issueMarkdown(session, await store.events(id)) })
                });
                if (!response.ok)
                    throw new HttpError(502, `GitHub rejected the request (${response.status}). Verify repository permissions.`);
                const issue = await response.json() as { html_url?: string };
                if (!issue.html_url?.startsWith(`https://github.com/${project.repo}/issues/`))
                    throw new HttpError(502, 'Unexpected GitHub response.');
                await store.sessions.updateOne({ id }, { $set: { github_url: issue.html_url } });
                return json({ url: issue.html_url }, 201);
            }
        }

        if (path === '/api/sandbox/checkout' && request.method === 'POST') {
            await body(request, 2_000);
            return json({ error: 'Inventory service unavailable', code: 'INVENTORY_OFFLINE' }, 503);
        }

        throw new HttpError(404, 'API route not found.');
    } catch (error) {
        return errorResponse(error);
    }
}
