/** Explicit operator-only initialization; never called from the request handler. */
import { readHostingConfig } from '../src/hosting-config.ts';
import { createHostedClient } from './client.ts';
import { SCHEMA_SQL } from '../src/schema.ts';
import { passwordHash } from '../src/security.ts';
import { randomUUID } from 'node:crypto';
if (process.env.REPRO_MIGRATION_CONFIRM !== 'INITIALIZE_REPROLAB') throw new Error('Explicit REPRO_MIGRATION_CONFIRM=INITIALIZE_REPROLAB is required. Use a dedicated ReproLab libSQL database.');
const client = createHostedClient(readHostingConfig());
try {
  await client.executeMultiple(SCHEMA_SQL);
  const foreignKeys = await client.execute({ sql: 'PRAGMA foreign_keys', args: [] });
  if (Number(foreignKeys.rows[0]?.foreign_keys) !== 1) throw new Error('Hosted database must enforce foreign keys.');
  const email = process.env.REPRO_OWNER_EMAIL?.trim().toLowerCase(), password = process.env.REPRO_OWNER_PASSWORD, name = process.env.REPRO_OWNER_NAME?.trim();
  if (email || password || name) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || password.length > 128 || !name || name.length > 60) throw new Error('Provide a valid owner email/name and a 12–128 character password. No account was created.');
    await client.execute({ sql: 'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?) ON CONFLICT(email) DO NOTHING', args: [randomUUID(), email, name, passwordHash(password), Date.now()] });
  }
  console.log('Schema initialized. Existing accounts and recordings preserved. No credentials printed.');
} finally { client.close(); }
