# Security and privacy boundary

ReproLab v0.1 is a self-hosted developer prototype, not a security-certified public SaaS. Use synthetic recording data until you have reviewed its behavior in your own application.

## Defaults

- Loopback-only server binding by default. No third-party runtime services.
- Salted scrypt password hashes; random opaque session tokens stored hashed in SQLite.
- HttpOnly, SameSite=Strict cookies. `COOKIE_SECURE=1` is required behind remote HTTPS.
- Mutating dashboard API calls must originate from the exact configured `APP_ORIGIN`.
- Every project, session, note, map, and export lookup verifies ownership server-side.
- Ingestion keys permit submissions, not reads. They are stored hashed and can be rotated.
- Prepared SQL statements and explicit field selection; no user-supplied SQL or script evaluation.
- Uploaded captures are validated and reconstructed into a closed allowlist of event fields.
- Canvas replay never executes recorded HTML or scripts. Static responses use CSP, no-referrer, nosniff, and frame restrictions.
- Login attempts and ingestions are rate-limited. Sessions, events, byte size, project count, viewport geometry and duration have explicit bounds.

## Recording data

The shipped recorder does not read input values, cookies, authorization headers, request/response bodies, or raw DOM HTML. Input-change events include only selector/type and a redacted marker. Normal text is masked; direct text nodes must opt in with `data-repro-public`. A private ancestor wins over public opt-in. Images are not downloaded or embedded into capture data.

Error messages, log strings, URLs and voluntarily public text are passed through email/token/long-number scrubbing. **This is not universal PII detection.** Application-specific names, identifiers embedded in unconventional paths, free-form personal details in errors, or improperly opted-in text may remain. Review captures before sharing, use `data-repro-private`, and do not instrument payment/medical/password-manager surfaces in v0.1.

Capture input values are dropped server-side even if a malicious client sends an extra `value` field. A malicious uploader can still deliberately put sensitive prose into allowed message/public-text fields. The server is not an exfiltration-prevention system.

## Ingestion trust

A browser SDK key cannot be kept secret from a person controlling that browser. CORS and origin checks reduce accidental cross-site ingestion, but a non-browser client can forge an Origin header. Do not give the key read privileges, use a narrowly scoped project, rotate on abuse, and review rate limits before wider exposure. No signed per-visitor ingestion token system is implemented yet.

## Shares and exports

Shares are bearer capabilities. Anyone holding an unexpired link can view its sanitized capture. Default 24 hours; configurable 1–168 hours; the owner can revoke all links for a session. Notes, source maps, project/client IDs and the created GitHub issue URL are excluded from the shared response. Revocation cannot retract a screenshot or already-downloaded evidence. API responses are `no-store` and use a `no-referrer` policy.

JSON/Markdown/Playwright files can contain opted-in text, selectors and redacted error context. They are owner-requested downloads, not inherently safe for arbitrary public posting. Review them.

## Source maps

Uploaded maps are private to the project owner and may contain full source snippets. They are never sent to an LLM, fetched from arbitrary remote URLs, or included in public recordings. Keep the SQLite file secure. Delete the project to remove its maps. Session retention does not automatically delete project source maps.

## GitHub integration

Disabled without a server-side token and `GITHUB_ALLOWED_REPOS`. The server restricts outbound writes to GitHub's fixed API host, an exact allowed repository, explicit user confirmation and a rate limit. Use a fine-grained token scoped only to the intended repository. Treat all users on a token-enabled installation as trusted collaborators; there is no per-user GitHub OAuth installation model yet.

No GitHub token enters the client bundle, recorder, extension, capture database events, or generated issue. A saved `github_url` avoids ordinary repeat submissions. Cross-system exactly-once behavior under timeouts or concurrent clicks is not guaranteed.

## Persistence, access and deployment

SQLite is not encrypted by the application. Use a locked device, restricted filesystem permissions, encrypted disks where appropriate, and encrypted backups. The database holds password hashes, session-token hashes, evidence, notes and map data. Hashes are not plain-text credentials, but they still require protection.

Registration is available to anyone who can reach the server; v0.1 is intended for a trusted local/private environment. Before an internet launch add an enrollment policy, recovery/email verification, security review, operational quotas, production monitoring, and load testing. The in-process server and synchronous database are deliberately bounded but not designed to withstand untrusted internet-scale load.

Never deploy the SQLite instance to an ephemeral serverless filesystem. Network exposure requires HTTPS and a persistent disk. A LAN testing override exists, but does not make plaintext transport safe.

## Report an issue

For a private deployment, report to its operator. Do not paste passwords, tokens, raw source maps or private captures into public issues. After this repository is published, enable GitHub private vulnerability reporting before accepting external vulnerability reports.

## Known verification gaps

See BUILD_REPORT.md. Unit/API isolation tests pass, but unrestricted browser journeys, a live GitHub token flow, extension installation, and a public deployment have not been verified in the build environment. Do not interpret the tests as a penetration test or certification.
