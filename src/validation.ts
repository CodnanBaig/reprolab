import { bounded, color, safeUrl, selector, text } from './privacy.ts';
import type { Capture, CaptureEvent, VisualFrame, VisualNode } from './types.ts';
export class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
}
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Expected an object.');
    return value as Record<string, unknown>;
}
export function requiredString(value: unknown, name: string, min = 1, max = 120) {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max)
        throw new HttpError(400, `${name} must contain ${min}–${max} characters.`);
    return value.trim();
}
export function parseOrigins(value: unknown): string[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 12)
        throw new HttpError(400, 'Provide 1–12 exact website origins.');
    return [...new Set(value.map(v => {
            const s = requiredString(v, 'Origin', 8, 300);
            let u: URL;
            try {
                u = new URL(s);
            }
            catch {
                throw new HttpError(400, 'Use an origin such as https://app.example.com.');
            }
            if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
                throw new HttpError(400, 'Origins cannot contain paths, credentials or query strings.');
            return u.origin;
        }))];
}
function visualFrame(value: unknown): VisualFrame {
    const f = object(value);
    if (!Array.isArray(f.nodes) || f.nodes.length > 350)
        throw new HttpError(400, 'Visual frame is too large.');
    return { width: bounded(f.width, 200, 3840), height: bounded(f.height, 200, 2160), scrollY: bounded(f.scrollY, 0, 100000),
        nodes: f.nodes.map((value): VisualNode => {
            const n = object(value);
            return { tag: text(n.tag, 16), x: bounded(n.x, -4000, 8000), y: bounded(n.y, -4000, 8000), w: bounded(n.w, 0, 8000), h: bounded(n.h, 0, 8000),
                text: n.masked === false ? text(n.text, 100) : (n.text ? '[masked]' : ''), color: color(n.color, '#253249'), bg: color(n.bg),
                size: bounded(n.size, 8, 80, 14), weight: bounded(n.weight, 300, 900, 400), radius: bounded(n.radius, 0, 100), masked: n.masked !== false };
        }) };
}
export function validateCapture(value: unknown): Capture {
    const v = object(value);
    if (v.version !== 1)
        throw new HttpError(400, 'Unsupported capture version.');
    const clientId = requiredString(v.clientId, 'Client ID', 8, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(clientId))
        throw new HttpError(400, 'Invalid client ID.');
    if (!Array.isArray(v.events) || v.events.length < 1 || v.events.length > 2500)
        throw new HttpError(400, 'A capture must contain 1–2500 events.');
    const duration = bounded(v.duration, 0, 300000);
    const viewport = object(v.viewport);
    const events = v.events.map((entry): CaptureEvent => {
        const e = object(entry), d = object(e.data), at = bounded(e.at, 0, duration);
        switch (e.kind) {
            case 'snapshot': return { kind: 'snapshot', at, data: { frame: visualFrame(d.frame) } };
            case 'click': return { kind: 'click', at, data: { selector: selector(d.selector), label: text(d.label, 90), x: bounded(d.x, 0, 3840), y: bounded(d.y, 0, 2160) } };
            case 'input': return { kind: 'input', at, data: { selector: selector(d.selector), inputType: text(d.inputType, 20), redacted: true } };
            case 'navigation': return { kind: 'navigation', at, data: { url: safeUrl(d.url) } };
            case 'scroll': return { kind: 'scroll', at, data: { x: bounded(d.x, 0, 100000), y: bounded(d.y, 0, 100000) } };
            case 'network': return { kind: 'network', at, data: { method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(String(d.method)) ? d.method : 'GET', url: safeUrl(d.url), status: bounded(d.status, 0, 599), duration: bounded(d.duration, 0, 120000) } };
            case 'error': return { kind: 'error', at, data: { name: text(d.name, 60), message: text(d.message, 800), stack: text(d.stack, 4000) } };
            case 'console': return { kind: 'console', at, data: { level: d.level === 'error' ? 'error' : 'warn', message: text(d.message, 800) } };
            case 'marker': return { kind: 'marker', at, data: { label: text(d.label, 100) } };
            default: throw new HttpError(400, 'Unknown event type.');
        }
    }).sort((a, b) => a.at - b.at);
    return { version: 1, clientId, title: text(requiredString(v.title, 'Title', 1, 180), 180), url: safeUrl(v.url), release: text(v.release, 80),
        browser: text(v.browser, 150), viewport: { width: bounded(viewport.width, 200, 3840), height: bounded(viewport.height, 200, 2160) }, duration, events };
}
