# Running and operating a private instance

## Local configuration

Next.js loads `.env.local` automatically. Copy the template, add the MongoDB Atlas URI locally, then install and start the app:

```bash
cp .env.example .env.local
# Set MONGODB_URI in .env.local; never commit it.
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Keep `APP_ORIGIN` aligned with the browser origin: `localhost` and `127.0.0.1` are different origins.

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URI` | required | Atlas connection string; server-only secret |
| `MONGODB_DB` | `reprolab` | Database name on the configured deployment |
| `APP_ORIGIN` | `http://localhost:3000` | Exact dashboard origin for cookies, CSRF, and shares |
| `RETENTION_DAYS` | `14` | Clamped 1–90; capture retention, not account/map retention |
| `COOKIE_SECURE` | `0` | Set to `1` behind HTTPS |
| `GITHUB_TOKEN` | unset | Optional fine-grained server-only token |
| `GITHUB_ALLOWED_REPOS` | unset | Comma-separated exact `owner/repo` destinations |

## Atlas setup

Create a least-privilege Atlas database user for this application and allow network access from the deployment environment. ReproLab creates its own collections and indexes on first use. Do not put the URI in browser code, source control, a public issue, or client-accessible deployment variables.

For recovery, use your Atlas backup/restore policy. A JSON evidence export is not a complete backup: it deliberately omits account credentials, ingestion keys, and some supporting records. After restoring a database, verify login, project list, a recording, and its event count before relying on it.

## Local password recovery

There is no hosted email-reset provider. The operator may reset one local account and revoke its sessions:

```bash
export REPRO_RESET_EMAIL='your-local-account@example.org'
printf 'New password: '
IFS= read -r -s REPRO_RESET_PASSWORD; printf '\n'
export REPRO_RESET_PASSWORD
pnpm run admin:reset-password
unset REPRO_RESET_PASSWORD REPRO_RESET_EMAIL
```

The command uses `.env.local` for MongoDB configuration and never exposes a reset endpoint.

## Container

The Dockerfile builds Next.js standalone output. Compose binds the web application to `127.0.0.1:3000` and reads `MONGODB_URI` from the environment:

```bash
docker compose up --build
```

MongoDB is external persistence, so the image has no database volume. For a remote/private deployment, inject `MONGODB_URI` and other server-only configuration through the host’s secret manager, configure Atlas network access, terminate HTTPS, set `APP_ORIGIN` to the HTTPS origin, and set `COOKIE_SECURE=1`.

## What not to do

- Do not commit `.env.local`, Atlas connection strings, capture keys, source maps, or real-user recordings.
- Do not put `MONGODB_URI` or GitHub tokens in `NEXT_PUBLIC_*` variables.
- Do not treat an empty dashboard or server log as browser acceptance evidence.
- Do not describe the extension or external GitHub workflow as verified until you exercise them on a real target.
