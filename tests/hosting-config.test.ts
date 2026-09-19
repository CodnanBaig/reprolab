import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { readHostingConfig, vercelClientAddress } from '../src/hosting-config.ts';
const good = { APP_ORIGIN: 'https://reprolab.example.com', TURSO_DATABASE_URL: 'libsql://reprolab-example.turso.io', TURSO_AUTH_TOKEN: 'a'.repeat(40) };
test('hosting normalizes the database to HTTPS and closes registration by default', () => {
  const config = readHostingConfig(good);
  assert.equal(config.databaseUrl, 'https://reprolab-example.turso.io');
  assert.equal(config.registrationEnabled, false);
  assert.equal(readHostingConfig({ ...good, REPRO_ALLOW_REGISTRATION: '1' }).registrationEnabled, true);
});
for (const origin of ['http://localhost:4318', 'https://example.com/path', 'https://user:password@example.com', 'https://example.com?token=x', 'https://example.com:4318', '']) {
  test(`reject unsafe hosted origin ${origin}`, () => assert.throws(() => readHostingConfig({ ...good, APP_ORIGIN: origin })));
}
for (const database of ['file:/tmp/repro.sqlite', ':memory:', 'http://db.turso.io', 'https://db.turso.io.evil.example', 'https://user:secret@db.turso.io', 'https://db.turso.io?authToken=secret']) {
  test(`reject unsafe hosted database ${database}`, () => assert.throws(() => readHostingConfig({ ...good, TURSO_DATABASE_URL: database })));
}
test('hosted credentials are required and cannot contain whitespace', () => {
  for (const token of ['', 'short', 'a'.repeat(40) + '\n']) assert.throws(() => readHostingConfig({ ...good, TURSO_AUTH_TOKEN: token }));
});
test('rate limiting ignores spoofable forwarding headers', () => {
  const request = (headers: IncomingMessage['headers']) => ({ headers }) as IncomingMessage;
  assert.equal(vercelClientAddress(request({ 'x-forwarded-for': '1.2.3.4' })), 'unknown');
  assert.equal(vercelClientAddress(request({ 'x-vercel-forwarded-for': '192.0.2.1, 127.0.0.1' })), '192.0.2.1');
  assert.equal(vercelClientAddress(request({ 'x-vercel-forwarded-for': 'arbitrary-string' })), 'unknown');
});
