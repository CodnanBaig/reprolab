# Running and operating a private instance

## Local configuration

`pnpm start`, `pnpm run dev` and `pnpm run start:built` load `.env` when present. With no `.env`, the defaults are localhost port 4318 and `.data/reprolab.sqlite`.

```bash
cp .env.example .env
pnpm start
```

Keep the browser origin identical to `APP_ORIGIN`; `localhost` and `127.0.0.1` are different origins. If you change `PORT`, change `APP_ORIGIN` too. Do not commit `.env` or the database.

| Variable | Default | Notes |
|---|---|---|
| `HOST` | `127.0.0.1` | Private loopback; remote binding requires explicit transport choice |
| `PORT` | `4318` | Server listening port |
| `APP_ORIGIN` | `http://localhost:4318` | Exact dashboard origin for cookies/CSRF/shares |
| `DATABASE_PATH` | `.data/reprolab.sqlite` | Persistent writable storage |
| `RETENTION_DAYS` | `14` | Clamped to 1–90; capture retention, not account/map retention |
| `COOKIE_SECURE` | `0` | Set to `1` behind remote HTTPS |
| `ALLOW_INSECURE_LAN` | unset | Explicit temporary testing override; not safe public deployment |
| `GITHUB_TOKEN` | unset | Optional fine-grained, server-only token |
| `GITHUB_ALLOWED_REPOS` | unset | Comma-separated exact `owner/repo` destinations |

## Backup and recovery

For this single-node private prototype, the simplest consistent backup is a **stopped-server copy of the whole database directory**:

1. Stop the ReproLab process and ensure there are no other writers.
2. Copy `.data/` to a private encrypted backup destination. Include SQLite auxiliary files if present.
3. Restart the server.
4. To restore, stop the process, preserve the current directory as a safety backup, replace it with the saved directory, restore file ownership/permissions, then restart.
5. Verify login, project list, a recording and its event count before relying on the restored instance.

A JSON evidence export is not a full account/database backup. It deliberately omits credentials, project keys, notes/source maps in some formats, and other system records. There is no “import all account state” endpoint in v0.1.

Automated tests verify SQLite persistence after reopen and upload idempotency. A production backup scheduler, encrypted off-site rotation and restore drills are operator responsibilities, not configured here.

## Local password recovery

There is no hosted email-reset provider. The server operator can use:

```bash
# Prefer a secure environment/secrets mechanism rather than recording a real password in shell history.
export REPRO_RESET_EMAIL='your-local-account@example.org'
printf 'New password: '
IFS= read -r -s REPRO_RESET_PASSWORD; printf '\n'
export REPRO_RESET_PASSWORD
pnpm run admin:reset-password
unset REPRO_RESET_PASSWORD REPRO_RESET_EMAIL
```

The script updates the hash and revokes all existing sessions for that account. It runs locally only. Do not expose it as a public endpoint.

## Container

`Dockerfile` and `compose.yml` are provided for an optional local container. Docker was not available/verified in this delivery environment.

```bash
docker compose up --build
```

The compose mapping binds the host port to `127.0.0.1` and persists the SQLite directory in a named volume. Its explicit insecure transport override is for this loopback-only development mapping. Do not change the published host address to `0.0.0.0` without configuring a proper private TLS deployment.

## Remote/private testing

Use a persistent-disk VM/container behind an HTTPS reverse proxy; set the owned HTTPS origin and secure cookies. Restrict network enrollment/access before exposing registration. Add both the collector origin and the target application origin to the target's CSP where necessary. The instrumented application's origin must also be in the project's exact origin list.

A hosted share link can only be reached if that instance itself is reachable. A localhost share does not magically become public. There is no hosted share proxy.

## What not to do

- Do not put this SQLite database on Vercel/Netlify function ephemeral storage.
- Do not commit capture keys, `.env`, SQLite files or source maps from a proprietary target.
- Do not store real customer information in the sample sandbox.
- Do not treat an empty dashboard/server log as proof of browser correctness.
- Do not describe the extension or external GitHub workflow as verified until you exercise them on your own target.
