import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scrub, safeUrl, color, selector } from '../src/privacy';
import { validateCapture, parseOrigins } from '../src/validation';
import { passwordHash, verifyPassword, randomToken, hash } from '../src/security';
import { generatePlaywright, issueMarkdown } from '../src/exports';
import { decodeVLQ, originalPosition, parseSourceMap } from '../src/sourcemaps';
import type { Capture } from '../src/types';
export const fixture = (): Capture => ({ version: 1, clientId: 'capture-test-123', title: 'Checkout fails', url: 'http://localhost:4318/sandbox?token=private', release: 'v1', browser: 'Chromium', viewport: { width: 1200, height: 800 }, duration: 2000, events: [
        { kind: 'navigation', at: 0, data: { url: 'http://localhost:4318/sandbox?secret=private' } },
        { kind: 'click', at: 200, data: { selector: '[data-testid="checkout"]', label: 'Checkout', x: 120, y: 45 } },
        { kind: 'input', at: 500, data: { selector: '[id="customer-email"]', inputType: 'email', value: 'private@example.com' } },
        { kind: 'error', at: 800, data: { name: 'TypeError', message: 'Inventory undefined for user@example.com', stack: 'Error at http://localhost:4318/app.js:1:4' } },
        { kind: 'network', at: 1000, data: { method: 'POST', url: 'http://localhost:4318/api?token=secret', status: 503, duration: 100, body: 'secret', headers: { Authorization: 'secret' } } }
    ] });
describe('Privacy boundary', () => {
    it('strips query, hash and URL userinfo', () => assert.equal(safeUrl('https://user:pass@example.com/api?a=token#x'), 'https://example.com/api'));
    it('redacts emails, long numerical IDs and UUID path segments', () => { assert.equal(safeUrl('https://a.com/user@example.com/123456789/550e8400-e29b-41d4-a716-446655440000'), 'https://a.com/[id]/[id]/[id]'); });
    it('rejects non-HTTP URLs', () => assert.equal(safeUrl('javascript:alert(1)'), '[redacted-url]'));
    it('redacts emails from error strings', () => assert.equal(scrub('hello a@b.com'), 'hello [email]'));
    it('redacts authorization secrets', () => assert(!scrub('Bearer abcdef secret=abc password="letmein" token=foo').includes('abcdef')));
    it('redacts PAT and API token formats', () => assert.equal(scrub('ghp_abcdef sk-secretvalue'), '[secret] [secret]'));
    it('rejects selectors with private values or executable syntax', () => { assert.equal(selector('[email="a@b.com"]'), ''); assert.equal(selector('x;alert(1)'), ''); });
    it('accepts bounded static selectors', () => assert.equal(selector('[data-testid="checkout"]'), '[data-testid="checkout"]'));
    it('rejects CSS resource injection', () => assert.equal(color('url(https://evil.com)'), '#e7eaf0'));
});
describe('Capture contract', () => {
    it('accepts and sanitizes a real capture', () => { const c = validateCapture(fixture()); assert.equal(c.url, 'http://localhost:4318/sandbox'); assert.equal(c.events.length, 5); });
    it('does not retain unknown input, network body or headers', () => { const data = JSON.stringify(validateCapture(fixture())); assert(!data.includes('private@example.com')); assert(!data.includes('Authorization')); assert(!data.includes('"body"')); });
    it('rejects unknown versions', () => assert.throws(() => validateCapture({ ...fixture(), version: 2 })));
    it('rejects empty captures', () => assert.throws(() => validateCapture({ ...fixture(), events: [] })));
    it('rejects unbounded event counts', () => assert.throws(() => validateCapture({ ...fixture(), events: Array(2501).fill(fixture().events[0]) })));
    it('rejects arbitrary event kinds', () => assert.throws(() => validateCapture({ ...fixture(), events: [{ kind: 'execute', at: 0, data: {} }] })));
    it('clamps event times to session duration', () => { const c = validateCapture({ ...fixture(), duration: 100 }); assert.equal(c.events.at(-1)?.at, 100); });
    it('validates and normalizes exact origins', () => assert.deepEqual(parseOrigins(['http://localhost:4318/', 'http://localhost:4318']), ['http://localhost:4318']));
    it('rejects origin paths or credentials', () => { assert.throws(() => parseOrigins(['https://app.test/path'])); assert.throws(() => parseOrigins(['https://u:p@app.test'])); });
    it('masks private frame text even when a client sends a value', () => { const c = validateCapture({ ...fixture(), events: [{ kind: 'snapshot', at: 0, data: { frame: { width: 1000, height: 800, nodes: [{ masked: true, text: 'never-store', tag: 'input', x: 0, y: 0, w: 100, h: 30 }] } } }] }); assert(!JSON.stringify(c).includes('never-store')); });
});
describe('Authentication primitives', () => {
    it('hashes passwords with independent salts', () => assert.notEqual(passwordHash('a-strong-password'), passwordHash('a-strong-password')));
    it('verifies correct passwords only', () => { const h = passwordHash('a-strong-password'); assert(verifyPassword('a-strong-password', h)); assert(!verifyPassword('wrong-password', h)); });
    it('rejects corrupt password digests', () => assert.equal(verifyPassword('abc', 'broken'), false));
    it('creates unpredictable token material and hashes', () => { assert.notEqual(randomToken(), randomToken()); assert.equal(hash('x').length, 64); });
});
describe('Evidence exports', () => {
    it('generates runnable Playwright structure with masked fixture placeholders', () => { const c = validateCapture(fixture()), out = generatePlaywright(c, c.events); assert(out.includes('REPRO_INPUT_1')); assert(out.includes('runtimeErrors')); assert(out.includes('serverFailures')); assert(!out.includes('private@example.com')); });
    it('escapes test titles instead of interpolating code', () => { const out = generatePlaywright({ url: 'http://localhost', title: "'); process.exit(); //" }, []); assert(out.includes('test("\'); process.exit(); //"')); });
    it('starts a regression draft at the initial captured route rather than the final SPA route', () => { const c = validateCapture(fixture()); const out = generatePlaywright({ ...c, url: 'http://localhost:4318/final' }, c.events); assert(out.includes('http://localhost:4318/sandbox')); assert(!out.includes('/final')); });
    it('exports a report with steps and failures', () => { const c = validateCapture(fixture()), out = issueMarkdown({ ...c, duration: c.duration }, c.events); assert(out.includes('Steps to reproduce')); assert(out.includes('503')); assert(!out.includes('token=secret')); });
});
describe('Source maps', () => {
    it('decodes positive and negative VLQ', () => { assert.deepEqual(decodeVLQ('AAAA'), [0, 0, 0, 0]); assert.deepEqual(decodeVLQ('D'), [-1]); });
    it('rejects malformed VLQ', () => { assert.throws(() => decodeVLQ('$')); assert.throws(() => decodeVLQ('g')); });
    it('validates a flat v3 map', () => assert.equal(parseSourceMap({ version: 3, sources: ['a.ts'], names: [], mappings: 'AAAA' }).version, 3));
    it('rejects indexed or invalid maps', () => assert.throws(() => parseSourceMap({ version: 3, sections: [] })));
    it('resolves generated positions and original source context', () => { const m = parseSourceMap({ version: 3, sources: ['src/a.ts'], names: ['fn'], mappings: 'AAAAA', sourcesContent: ['const x = 1;'] }); assert.deepEqual(originalPosition(m, 1, 20), { source: 'src/a.ts', line: 1, column: 1, name: 'fn', context: 'const x = 1;' }); });
});
