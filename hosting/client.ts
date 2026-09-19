import { createClient } from '@libsql/client/http';
import type { HostingConfig } from '../src/hosting-config.ts';
import type { SqlClient } from '../src/persistence.ts';
export function createHostedClient(config: HostingConfig): SqlClient {
  const boundedFetch: typeof globalThis.fetch = (input, init = {}) => {
    const supplied = init.signal ?? (input instanceof Request ? input.signal : undefined);
    const timeout = AbortSignal.timeout(12000);
    return fetch(input, { ...init, redirect: 'error', signal: supplied ? AbortSignal.any([supplied, timeout]) : timeout });
  };
  return createClient({ url: config.databaseUrl, authToken: config.authToken, intMode: 'number', fetch: boundedFetch });
}
