# Security and privacy boundary

ReproLab v0.1 is a private developer prototype, not a security-certified public SaaS. Use synthetic recording data until you have reviewed it in your own application.

## Defaults

- Next.js Route Handlers run in the Node.js runtime; MongoDB and all credentials are server-only.
- `MONGODB_URI` belongs in `.env.local` or the deployment secret store. Never use a `NEXT_PUBLIC_` name for it or commit it.
- Passwords use salted scrypt hashes. Opaque session and share tokens are random and stored only as hashes.
- Cookies are `HttpOnly` and `SameSite=Strict`; set `COOKIE_SECURE=1` behind HTTPS.
- Mutating dashboard requests must come from the exact configured `APP_ORIGIN`.
- Every project, session, note, map, export, and share lookup validates ownership or its restricted bearer capability.
- Ingestion keys permit submissions, not reads. They are hashed, scoped to exact origins, and rotateable.
- Captures are closed-schema validated, byte-bounded, rate-limited, and reconstructed as canvas nodes rather than executed HTML.

## Recording data

The recorder does not read input values, cookies, authorization headers, request/response bodies, raw DOM HTML, video, or screenshots. Input events include only selector/type plus a redacted marker. Text is masked unless direct text nodes opt in with `data-repro-public`; a private ancestor wins.

URL, error, log, and public-text values receive email/token/long-number scrubbing. This is defense in depth, not universal PII detection. Review captures before sharing, use `data-repro-private`, and do not instrument payment, medical, password-manager, or other high-risk surfaces in v0.1.

## MongoDB and deployment

MongoDB Atlas encrypts traffic to the deployment through its TLS connection string. Encryption at rest, database users, Atlas network access, backups, and retention are deployment controls: configure least-privilege database credentials and an IP/network allowlist appropriate to the host. The application creates indexes for uniqueness and expiry but does not manage Atlas access policy.

The capture model contains password hashes, hashed tokens, evidence, notes, and source maps. Restrict database access and back it up through your Atlas backup policy. Deleting a project or session triggers application-managed cleanup of its dependent documents; source maps are removed with their project, not ordinary session retention.

## Sharing and exports

Shares are bearer capabilities. Anyone with an unexpired link can view its sanitized capture. Default duration is 24 hours, configurable from 1–168; the owner can revoke all session links. Notes, source maps, project/client IDs, and created GitHub issue URLs are excluded from shared responses.

JSON, Markdown, and Playwright exports may contain opted-in text, selectors, and redacted error context. Review them before posting anywhere public.

## GitHub integration

This is disabled unless a server-side `GITHUB_TOKEN` and exact `GITHUB_ALLOWED_REPOS` allowlist are configured. The handler allows only explicit confirmation, the fixed GitHub API host, an allowlisted repository, and a rate-limited request. A saved issue URL prevents ordinary duplicate clicks, but cross-system exactly-once delivery under timeouts is not guaranteed.

## Known gaps

Registration is intended only for trusted/private environments. An internet-facing release still needs enrollment policy, email verification/recovery, monitoring, quotas, load testing, a security review, and production browser validation. The extension and authenticated GitHub side effect require direct acceptance testing.
