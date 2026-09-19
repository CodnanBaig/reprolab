import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { createClient, type TransactionMode } from '@libsql/client';
import { RemoteStore } from '../src/remote-store.ts';
import { SCHEMA_SQL } from '../src/schema.ts';
import { createApp } from '../src/server.ts';
import type { Capture } from '../src/types.ts';
import { HttpError } from '../src/validation.ts';
import handler from '../api/index.ts';
async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'repro-hosting-'));
  const url = `file:${path.join(root, 'store.sqlite')}`;
  const client = createClient({ url });
  await client.executeMultiple(SCHEMA_SQL);
  await client.execute({ sql: 'INSERT INTO users VALUES(?,?,?,?,?)', args: ['user', 'fixture@example.org', 'Fixture', 'not-a-real-password', Date.now()] });
  await client.execute({ sql: 'INSERT INTO projects(id,owner_id,name,origins,key_hash,created_at) VALUES(?,?,?,?,?,?)', args: ['project', 'user', 'Fixture', '["https://test.example"]', 'test-key-hash', Date.now()] });
  t.after(async () => { client.close(); await rm(root, { recursive: true, force: true }); });
  return { client, url, store: new RemoteStore(client) };
}
const capture = (): Capture => ({ version: 1, clientId: 'durability-capture', title: 'Synthetic bug', url: 'https://test.example', release: 'test-v1', browser: 'Fixture', viewport: { width: 1000, height: 700 }, duration: 500,
  events: [{ kind: 'error', at: 100, data: { name: 'Error', message: 'Fixture failed' } }, { kind: 'marker', at: 200, data: { label: 'Done' } }] });
test('recordings and upload deduplication survive a completely new client', async t => {
  const { client, url, store } = await fixture(t);
  const saved = await store.saveCapture('project', capture()); client.close();
  const nextClient = createClient({ url });
  try {
    const next = new RemoteStore(nextClient);
    assert.equal((await next.ownerSession(saved.id, 'user')).title, 'Synthetic bug');
    assert.equal((await next.events(saved.id)).length, 2);
    assert.deepEqual(await next.saveCapture('project', capture()), { id: saved.id, duplicate: true });
  } finally { nextClient.close(); }
});
test('an event-write failure rolls back the session and partially written events', async t => {
  const { client, store } = await fixture(t);
  const original = client.transaction.bind(client);
  client.transaction = async (mode?: TransactionMode) => {
    const tx = await original(mode);
    tx.batch = async statements => { await tx.execute(statements[0]!); throw new Error('Injected event failure'); };
    return tx;
  };
  await assert.rejects(store.saveCapture('project', capture()), /Injected event failure/);
  assert.equal((await client.execute('SELECT count(*) n FROM sessions')).rows[0]?.n, 0);
  assert.equal((await client.execute('SELECT count(*) n FROM events')).rows[0]?.n, 0);
});
test('persistent atomic rate limits cannot be bypassed by a second store object', async t => {
  const { client, store } = await fixture(t), other = new RemoteStore(client);
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => (i % 2 ? store : other).rateLimit('same-user', 3)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  for (const r of results) if (r.status === 'rejected') assert.equal((r.reason as HttpError).status, 429);
});
test('retention and project deletion cascade to evidence and notes', async t => {
  const { client, store } = await fixture(t);
  const saved = await store.saveCapture('project', capture());
  await client.execute({ sql: 'INSERT INTO notes VALUES(?,?,?,?)', args: ['note', saved.id, 'Private fixture note', Date.now()] });
  await client.execute({ sql: 'UPDATE sessions SET created_at=0 WHERE id=?', args: [saved.id] });
  await store.purge(1);
  assert.equal((await client.execute('SELECT count(*) n FROM events')).rows[0]?.n, 0);
  assert.equal((await client.execute('SELECT count(*) n FROM notes')).rows[0]?.n, 0);
});
test('preparsed Vercel bodies still pass validation and respect body-size limits', async t => {
  const { store } = await fixture(t);
  const origin = 'https://test.example';
  const app = createApp({ store, origin, secure: true });
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const value = Buffer.concat(chunks).toString();
    (req as typeof req & { body?: unknown }).body = value ? JSON.parse(value) : undefined;
    await app.handler(req, res);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const request = (data: unknown) => fetch(`http://127.0.0.1:${address.port}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const registered = await request({ name: 'Test', email: 'parsed@example.org', password: 'a-fixture-password-123' });
  assert.equal(registered.status, 201); assert.match(registered.headers.get('set-cookie')!, /Secure/);
  assert.equal((await request({ name: 'Test', email: 'large@example.org', password: 'valid-password-123', extra: 'x'.repeat(11000) })).status, 413);
});
test('registration can be closed without changing the existing local default', async t => {
  const { store } = await fixture(t), origin = 'https://test.example';
  const app = createApp({ store, origin, registrationEnabled: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => app.server.close(() => resolve())));
  const address = app.server.address(); assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test', email: 'closed@example.org', password: 'a-fixture-password-123' }) });
  assert.equal(response.status, 403);
});
test('serverless entry fails closed without configuration while liveness remains useful', async t => {
  const original = process.env.APP_ORIGIN; delete process.env.APP_ORIGIN;
  t.after(() => { if (original === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = original; });
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(base + '/api/health/live')).status, 200);
  const response = await fetch(base + '/api/auth/me');
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Hosted storage is not configured/);
});
