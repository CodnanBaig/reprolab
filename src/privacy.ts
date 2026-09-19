/** No raw request/response bodies or executable markup enter the capture schema. */
export function scrub(value: unknown, max = 1200): string {
    return String(value ?? '').slice(0, max)
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b/g, '[secret]')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
        .replace(/\bBearer\s+\S+/gi, 'Bearer [token]')
        .replace(/\b(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*["']?[^\s,"';]+/gi, '$1=[redacted]')
        .replace(/\b(?:\d[ -]?){13,19}\b/g, '[number]')
        .replace(/https?:\/\/[^\s)]+/g, (url) => safeUrl(url));
}
export function safeUrl(value: unknown): string {
    try {
        const u = new URL(String(value));
        if (!['http:', 'https:'].includes(u.protocol))
            return '[redacted-url]';
        const path = u.pathname.split('/').map(part => {
            let text = part;
            try {
                text = decodeURIComponent(part);
            }
            catch {
                return '[segment]';
            }
            if (/@/.test(text) || /^\d{7,}$/.test(text) || /^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(text) || text.length > 64)
                return '[id]';
            return text.replace(/[\u0000-\u001f<>"']/g, '_');
        }).join('/');
        return `${u.origin}${path}`.slice(0, 500);
    }
    catch {
        return '[redacted-url]';
    }
}
export function color(value: unknown, fallback = '#e7eaf0') {
    const s = String(value ?? '');
    return /^(?:#[a-f\d]{3,8}|rgba?\([\d.,%\s]+\)|transparent)$/i.test(s) ? s.slice(0, 80) : fallback;
}
export function text(value: unknown, max = 180) { return scrub(value, max).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
export function bounded(value: unknown, low: number, high: number, fallback = low) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
}
export function selector(value: unknown) {
    const s = String(value ?? '').slice(0, 400);
    // SDK locators contain only static IDs, test IDs, or structural element paths.
    return /^[a-zA-Z0-9_\-\[\]="'\s:().>#]+$/.test(s) && !/@|password|token|secret/i.test(s) ? s : '';
}
