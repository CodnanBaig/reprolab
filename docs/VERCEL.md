# ReproLab on Vercel — durable storage, not ephemeral SQLite

## Status

The Vercel request adapter and durable libSQL storage implementation are a deployment candidate. No public deployment or hosted database connection has been verified. Do not describe an unconfigured Vercel build as a working hosted service.

The original local SQLite workflow still works without runtime dependencies. Vercel uses a separate pinned `@libsql/client/http` dependency and a dedicated remote **libSQL-compatible Turso database**. This adapter is not a claim of support for the newer Turso Database engine/SDK.

## What changed

`createApp` accepts a storage interface and exports its async HTTP handler. `api/index.ts` invokes that handler without listening on a port. Original account ownership, CSRF, privacy, source-map, share and export checks are retained. `RemoteStore` performs asynchronous SQL; upload deduplication, quota checks, sessions and all events share a remote write transaction. Rate-limit increments are atomic SQL, not an in-process map. Retention uses database cascades.

The Vercel configuration serves `public/` as static assets and rewrites API paths to the function. The SDK can be loaded cross-origin; ingestion still validates its project key and exact allowed origins. Secrets and SQLite files are not part of the public output. There is no `/tmp` database fallback.

## Provision once

1. Create a **dedicated libSQL-compatible database** for this app. Do not point the initializer at an unrelated database or your finance app. Confirm its hostname ends in `.turso.io` and issue a server-only token.
2. In a private local terminal with Node 22.16+ and this branch checked out, run `npm ci --prefix hosting`.
3. Supply the variables from `hosting/.env.example` through a private environment file outside Git. Set `APP_ORIGIN` to the exact final HTTPS app origin. Set initialization-only `REPRO_OWNER_EMAIL`, `REPRO_OWNER_NAME`, and a unique 12–128-character `REPRO_OWNER_PASSWORD` to provision the first operator while registration stays closed.
4. Run the explicit initializer (the file below is your private file, not the example):

```sh
REPRO_MIGRATION_CONFIRM=INITIALIZE_REPROLAB \
node --env-file=/absolute/path/to/private-reprolab.env --experimental-strip-types hosting/init.ts
```

The initializer creates missing schema objects, checks foreign keys, and never overwrites an existing account's password. It does not import a previous local database. Keep existing local recordings backed up separately. Remove initialization-only passwords from the environment after bootstrapping. Subsequent schema changes require reviewed migrations; this initial `CREATE IF NOT EXISTS` script is not a general migration framework.

## Vercel project settings

Import `CodnanBaig/reprolab`, branch `feat/vercel-durable-hosting`, repository root `/`. Select **Other** as framework and **Node.js 22.x** as runtime. Keep the checked-in `vercel.json` build/install/output settings. The install uses frozen root and hosting lockfiles; the build typechecks both runtimes and checks browser syntax before compiling the local distribution.

Set only these required **server-side** Vercel environment variables:

- `APP_ORIGIN`: exact final HTTPS production origin, no path/credentials/port.
- `TURSO_DATABASE_URL`: dedicated hosted libSQL database URL.
- `TURSO_AUTH_TOKEN`: its private server token.

`REPRO_ALLOW_REGISTRATION` defaults to closed; leave it unset or `0` for private review. Set `1` only as a deliberate operator choice. Do not use `NEXT_PUBLIC_` prefixes. The owner bootstrap password does not belong in deployed environment variables. GitHub issue creation remains optional and disabled without separately scoped credentials/allowlist.

Assign the final domain and redeploy after setting its exact `APP_ORIGIN`. Origin mismatches correctly block writes. Give Preview a separate database and matching origin, or leave Preview unconfigured; do not let pull-request deployments modify your production recordings. Configure environment variables through Vercel's secure interface, not in chat or source control.

## Acceptance before sharing the URL

Check `/api/health/live` (runtime only), `/api/release` (commit identity), and `/api/health` (database-backed readiness). A successful static homepage is insufficient. Missing hosted settings return 503 for app APIs instead of silently using disposable local storage.

With a disposable operator workspace, complete: login → record the bundled failing checkout → stop/save → replay → notes/triage → Playwright draft → JSON/Markdown export → expiring share → revoke share. Test a second user cannot access the first user's projects, recordings, notes or source maps. Reload and then redeploy the same candidate; verify the original recording persists. Confirm secure cookies, exact-origin rejection, production domain HTTPS and no leaked environment values.

Verify serverless request rewrites, actual HTTP libSQL connectivity, transaction latency and provider quota on the real deployment. Those cannot be established by tests against a local SQLite transport. Record the verified domain, deployment ID and commit before marking this hosted.

## Tests and evidence

```sh
pnpm install --frozen-lockfile
npm ci --prefix hosting
pnpm typecheck
pnpm exec tsc --noEmit -p hosting/tsconfig.json
node --experimental-strip-types --test tests/*.test.ts hosting/*.test.ts
pnpm check:syntax
pnpm build
```

The local candidate passes 121 tests: the original 69, 15 hosted-configuration checks, the same 30 HTTP ownership/privacy contracts on the asynchronous SDK-backed adapter, and 7 durability/rollback/rate-limit/serverless-body tests. The SDK adapter tests use actual file/in-memory libSQL transport, not an actual Turso account. A separate GitHub workflow verifies this candidate, while the original browser workflow exercises localhost user journeys. Check the current commit's run results; workflow configuration alone is not evidence of success.

## Operational limits

Use a nearby database region and monitor function duration. Individual database fetches have a 12-second bound; recording uploads retain the existing bounded input limits and batch event writes. Do not retry uncertain writes automatically. Upload client IDs provide capture deduplication, but cross-system GitHub issue submission is not exactly-once.

Registration defaults closed for review. There is no public multi-tenant SaaS billing, managed mail recovery or service-level guarantee. Host only synthetic review recordings until you've qualified privacy and operations. Keep database backups and a token-rotation process. A Git rollback is safe only while the schema remains compatible.

## Current deployment blocker

The connected Vercel deploy action returned “Tool deploy_to_vercel not found” during this implementation. No deployment was created through that action. No hosted database/token was provisioned. The source is prepared for the configured import workflow above; a working Vercel connection and private database configuration are still required for a live URL.

## Primary references

- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/rewrites
- https://vercel.com/docs/headers/request-headers
- https://docs.turso.tech/sdk/ts/reference
