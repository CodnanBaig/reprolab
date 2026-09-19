import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
export interface HostingConfig { origin: string; databaseUrl: string; authToken: string; registrationEnabled: boolean }
export function readHostingConfig(env: NodeJS.ProcessEnv = process.env): HostingConfig {
  const origin = new URL(env.APP_ORIGIN ?? 'invalid:');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.port || !origin.hostname.includes('.'))
    throw new Error('APP_ORIGIN must be the final HTTPS origin without a path, port or credentials.');
  const raw = env.TURSO_DATABASE_URL ?? '';
  const database = new URL(raw.replace(/^libsql:/, 'https:'));
  if (database.protocol !== 'https:' || database.username || database.password || database.pathname !== '/' || database.search || database.hash || database.port || !database.hostname.endsWith('.turso.io'))
    throw new Error('TURSO_DATABASE_URL must identify a hosted libSQL database over HTTPS. Local files are not supported on Vercel.');
  const authToken = env.TURSO_AUTH_TOKEN ?? '';
  if (authToken.length < 32 || /\s/.test(authToken)) throw new Error('Set a server-only TURSO_AUTH_TOKEN.');
  return { origin: origin.origin, databaseUrl: database.origin, authToken, registrationEnabled: env.REPRO_ALLOW_REGISTRATION === '1' };
}
export function vercelClientAddress(req: IncomingMessage): string {
  // Vercel overwrites this header. Never trust arbitrary X-Forwarded-For instead.
  const raw = req.headers['x-vercel-forwarded-for'];
  const address = typeof raw === 'string' ? raw.split(',')[0]?.trim() ?? '' : '';
  return isIP(address) ? address : 'unknown';
}
