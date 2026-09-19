import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function passwordHash(password: string) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
    try {
        const [salt, h] = stored.split(':');
        if (!salt || !h)
            return false;
        const expected = Buffer.from(h, 'hex'), actual = scryptSync(password, salt, 64);
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    }
    catch {
        return false;
    }
}
export function cookieValue(header: string | undefined, name: string) {
    return (header ?? '').split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}
