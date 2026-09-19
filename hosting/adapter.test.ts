import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { RemoteStore } from '../src/remote-store.ts';
import { SCHEMA_SQL } from '../src/schema.ts';
import { createApp } from '../src/server.ts';
const origin = 'http://localhost:4318';
const client = createClient({ url: ':memory:' });
await client.executeMultiple(SCHEMA_SQL);
const app = createApp({ store: new RemoteStore(client), origin, secure: true, githubToken: 'unused-local-test-token', githubAllowedRepos: [] });
let base = '', cookie = '', otherCookie = '', project = '', captureKey = '', session = '';
async function request(path: string, method = 'GET', data?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    const type = response.headers.get('content-type') ?? '';
    const value = type.includes('application/json') ? await response.json() : await response.text();
    return { response, value };
}
function capture(clientId = 'http-test-001') { return { version: 1, clientId, title: 'API reproduction', url: origin + '/sandbox', release: 'sandbox-v1', browser: 'Chromium', viewport: { width: 1000, height: 800 }, duration: 1200, events: [{ kind: 'error', at: 500, data: { name: 'Error', message: 'Checkout failed', stack: 'Error at http://localhost:4318/sandbox-error.min.js:1:38' } }] }; }
describe('Async libSQL adapter: HTTP API and ownership boundaries (real SDK, local database transport)', () => {
    before(async () => {
        await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
        const addr = app.server.address();
        if (!addr || typeof addr === 'string')
            throw new Error('Missing test address');
        base = `http://127.0.0.1:${addr.port}`;
    });
    after(async () => { await new Promise<void>(r => app.server.close(() => r())); });
    it('reports database health', async () => { const r = await request('/api/health'); assert.equal(r.response.status, 200); assert.equal(r.value.ok, true); });
    it('requires login to read projects', async () => assert.equal((await request('/api/projects')).response.status, 401));
    it('rejects cross-origin registration', async () => assert.equal((await request('/api/auth/register', 'POST', {}, { Origin: 'https://evil.example' })).response.status, 403));
    it('rejects short passwords', async () => assert.equal((await request('/api/auth/register', 'POST', { name: 'Test', email: 'test@example.com', password: 'short' })).response.status, 400));
    it('registers with an HttpOnly SameSite session', async () => { const r = await request('/api/auth/register', 'POST', { name: 'Tester', email: 'owner@example.com', password: 'safe-password-1234' }); assert.equal(r.response.status, 201); const header = r.response.headers.get('set-cookie')!; assert(header.includes('HttpOnly')); assert(header.includes('SameSite=Strict')); cookie = header.split(';')[0]!; });
    it('creates a project with an ingestion-only key', async () => { const r = await request('/api/projects', 'POST', { name: 'Test project', origins: [origin] }); assert.equal(r.response.status, 201); project = r.value.id; captureKey = r.value.captureKey; assert(captureKey.length >= 40); });
    it('never returns a raw key in project listing', async () => { const r = await request('/api/projects'); assert.equal(r.value.length, 1); assert(!JSON.stringify(r.value).includes(captureKey)); assert(!JSON.stringify(r.value).includes('key_hash')); });
    it('rejects an invalid capture key', async () => assert.equal((await request('/api/ingest', 'POST', capture(), { 'X-Repro-Key': 'incorrect'.repeat(6), Cookie: '' })).response.status, 401));
    it('rejects disallowed website origins', async () => assert.equal((await request('/api/ingest', 'POST', capture(), { 'X-Repro-Key': captureKey, Origin: 'https://evil.example' })).response.status, 403));
    it('captures evidence without a dashboard cookie', async () => { const r = await request('/api/ingest', 'POST', capture(), { 'X-Repro-Key': captureKey, Cookie: '' }); assert.equal(r.response.status, 201); session = r.value.id; });
    it('makes identical upload retries idempotent', async () => { const r = await request('/api/ingest', 'POST', capture(), { 'X-Repro-Key': captureKey }); assert.equal(r.response.status, 200); assert.equal(r.value.id, session); assert(r.value.duplicate); });
    it('reads owned session and triages it', async () => { assert.equal((await request('/api/sessions/' + session)).value.events.length, 1); assert.equal((await request('/api/sessions/' + session, 'PATCH', { status: 'resolved' })).response.status, 200); assert.equal((await request('/api/sessions/' + session)).value.status, 'resolved'); });
    it('creates investigation notes', async () => { assert.equal((await request(`/api/sessions/${session}/notes`, 'POST', { body: 'Investigated failure.' })).response.status, 201); assert.equal((await request('/api/sessions/' + session)).value.notes.length, 1); });
    it('exports a regression-test draft', async () => { const r = await request(`/api/sessions/${session}/export?format=playwright`); assert.equal(r.response.status, 200); assert(r.value.includes('runtimeErrors')); assert(r.response.headers.get('content-disposition')?.includes('.spec.js')); });
    it('enforces cross-user data isolation', async () => { const reg = await request('/api/auth/register', 'POST', { name: 'Second user', email: 'other@example.com', password: 'another-safe-password' }); otherCookie = reg.response.headers.get('set-cookie')!.split(';')[0]!; assert.equal((await request('/api/sessions/' + session, 'GET', undefined, { Cookie: otherCookie })).response.status, 404); assert.equal((await request(`/api/projects/${project}`, 'PATCH', { name: 'hijack', origins: [origin] }, { Cookie: otherCookie })).response.status, 404); });
    it('shares only a sanitized public view and supports revocation', async () => { const r = await request(`/api/sessions/${session}/share`, 'POST', { hours: 1 }); assert.equal(r.response.status, 201); const token = r.value.url.split('/').at(-1); const shared = await request('/api/shared/' + token, 'GET', undefined, { Cookie: '' }); assert.equal(shared.response.status, 200); assert.equal(shared.value.notes.length, 0); assert(!shared.value.project_id); assert(!shared.value.github_url); await request(`/api/sessions/${session}/share`, 'DELETE'); assert.equal((await request('/api/shared/' + token, 'GET', undefined, { Cookie: '' })).response.status, 404); });
    it('rejects expired links', async () => { const r = await request(`/api/sessions/${session}/share`, 'POST', { hours: 1 }); (await app.store.db.prepare('UPDATE shares SET expires_at=0').run()); const token = r.value.url.split('/').at(-1); assert.equal((await request('/api/shared/' + token)).response.status, 404); });
    it('validates source maps before storing', async () => { assert.equal((await request(`/api/projects/${project}/source-maps`, 'POST', { asset: origin + '/sandbox-error.min.js', release: 'sandbox-v1', map: { version: 2 } })).response.status, 400); });
    it('symbolicates owner-visible stack traces', async () => { const r = await request(`/api/projects/${project}/source-maps`, 'POST', { asset: origin + '/sandbox-error.min.js', release: 'sandbox-v1', map: { version: 3, sources: ['checkout.ts'], names: [], mappings: 'AAAA', sourcesContent: ['throw new Error();'] } }); assert.equal(r.response.status, 201); const result = await request(`/api/sessions/${session}/symbolicate`, 'POST', {}); assert.equal(result.value.positions[0].source, 'checkout.ts'); });
    it('does not create GitHub issues without explicit confirmation or config', async () => { assert.equal((await request(`/api/sessions/${session}/github`, 'POST', {})).response.status, 400); assert.equal((await request(`/api/sessions/${session}/github`, 'POST', { confirm: true })).response.status, 409); });
    it('denies GitHub writes outside the server allowlist before any external request', async () => {
        await request(`/api/projects/${project}`, 'PATCH', { name: 'Test project', origins: [origin], repo: 'someone/another-repo' });
        assert.equal((await request(`/api/sessions/${session}/github`, 'POST', { confirm: true })).response.status, 403);
    });
    it('rotates ingestion keys without changing access rights', async () => { const r = await request(`/api/projects/${project}/rotate-key`, 'POST', {}); assert(r.value.captureKey !== captureKey); assert.equal((await request('/api/ingest', 'POST', capture('http-test-002'), { 'X-Repro-Key': captureKey })).response.status, 401); captureKey = r.value.captureKey; });
    it('rejects declared capture URLs outside project origins', async () => { assert.equal((await request('/api/ingest', 'POST', { ...capture('http-test-003'), url: 'https://elsewhere.example' }, { 'X-Repro-Key': captureKey })).response.status, 403); });
    it('denies deleting another user session', async () => assert.equal((await request('/api/sessions/' + session, 'DELETE', undefined, { Cookie: otherCookie })).response.status, 404));
    it('deletes owned sessions and dependent events', async () => { assert.equal((await request('/api/sessions/' + session, 'DELETE')).response.status, 200); assert.equal((await request('/api/sessions/' + session)).response.status, 404); assert.equal((await app.store.db.prepare('SELECT count(*) n FROM events').get())?.n, 0); });
    it('logs out and invalidates the server-side session', async () => { assert.equal((await request('/api/auth/logout', 'POST', {})).response.status, 200); assert.equal((await request('/api/projects')).response.status, 401); });
    it('rejects invalid login without issuing a session', async () => {
        const r = await request('/api/auth/login', 'POST', { email: 'owner@example.com', password: 'incorrect-password-123' });
        assert.equal(r.response.status, 401);
        assert.equal(r.response.headers.get('set-cookie'), null);
    });
    it('signs in an existing user after logout', async () => {
        const r = await request('/api/auth/login', 'POST', { email: 'owner@example.com', password: 'safe-password-1234' });
        assert.equal(r.response.status, 200);
        cookie = r.response.headers.get('set-cookie')!.split(';')[0]!;
        assert.equal((await request('/api/projects')).response.status, 200);
    });
    it('requires explicit confirmation before deleting a project', async () => {
        assert.equal((await request(`/api/projects/${project}`, 'DELETE', {})).response.status, 400);
        assert.equal((await request(`/api/projects/${project}`, 'DELETE', { confirm: true })).response.status, 200);
        assert.equal((await request('/api/projects')).value.length, 0);
    });
    it('serves the SPA and sandbox without inline executable scripts', async () => { const r = await request('/'); assert.equal(r.response.status, 200); assert(r.response.headers.get('content-security-policy')?.includes("script-src 'self'")); assert.equal((await request('/sandbox')).response.status, 200); });
});
