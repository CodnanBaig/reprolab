import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/server.ts';
import { RemoteStore } from '../src/remote-store.ts';
import { readHostingConfig, vercelClientAddress } from '../src/hosting-config.ts';
import { createHostedClient } from '../hosting/client.ts';
let application: ReturnType<typeof createApp<RemoteStore>> | undefined;
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const path = new URL(req.url ?? '/', 'https://reprolab.invalid').pathname;
  if (req.method === 'GET' && (path === '/api/health/live' || path === '/api/release')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, version: '0.1.0', commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown', environment: process.env.VERCEL_ENV ?? 'local' }));
  }
  try {
    if (!application) {
      const config = readHostingConfig();
      application = createApp({ store: new RemoteStore(createHostedClient(config)), origin: config.origin, secure: true,
        registrationEnabled: config.registrationEnabled, clientAddress: vercelClientAddress });
    }
    await application.handler(req, res);
  } catch {
    // Never expose environment values, database URLs or provider error payloads.
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Hosted storage is not configured or is unavailable. Contact the instance operator.' }));
    } else res.end();
  }
}
