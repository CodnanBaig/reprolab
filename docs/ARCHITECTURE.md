# Architecture and engineering decisions

## Stack

ReproLab is a **Next.js App Router** application. React renders the `/` workbench shell and `/sandbox` fixture; the existing browser-native workbench and SDK scripts remain framework-independent so they can record another application without coupling it to React.

| Module | Responsibility |
|---|---|
| `app/layout.tsx`, `app/page.tsx` | Root document metadata and Next.js workbench route |
| `app/sandbox/page.tsx` | Real failed-checkout fixture rendered by Next.js |
| `app/api/[...route]/route.ts` | Node-runtime Route Handlers: API, auth, CORS/CSRF, bounded JSON, ownership |
| `src/store.ts` | MongoDB client reuse, indexes, persistence, retention and application-managed deletion |
| `src/validation.ts` | Closed capture contract; validation before storage |
| `src/privacy.ts` | Server-side redaction and selector/color allowlists |
| `src/security.ts` | Scrypt, random tokens, token hashing and timing-safe verification |
| `src/exports.ts` | Deterministic Playwright and Markdown generation |
| `src/sourcemaps.ts` | Flat v3 parsing and generated-to-original lookup |
| `public/sdk/reprolab.js` | Framework-independent recorder and client-side privacy boundary |
| `public/app.js` | Workbench state, hash routing, accessible controls and canvas playback |
| `extension/` | Manual active-tab extension using recorder-parity source |

## Flow

1. A workspace owner creates a project and receives a random ingestion-only key. MongoDB stores only its SHA-256 hash.
2. A developer explicitly starts the SDK after consent. It records bounded visual frames and sanitized events in memory.
3. The Next.js ingestion Route Handler validates key, exact origin, rate, body size, and event shape before saving one capture document.
4. A unique MongoDB index on `(project_id, client_id)` makes ordinary upload retries idempotent.
5. The signed-in owner reads only records joined to their project. The workbench reconstructs visual nodes into a canvas; no recorded DOM executes.
6. Sharing creates a hashed, expiring bearer token. The public response removes notes, source maps, project/client IDs, and external issue URLs.

## MongoDB model

- `users`: local identity, scrypt hashes, creation time; `email` is unique.
- `auth_sessions`: hashed opaque tokens and expiry; expiry has a TTL index.
- `projects`: owner, exact origins, optional GitHub repository, hashed ingestion key.
- `sessions`: bounded sanitized event array, triage fields, fingerprint and optional issue URL; unique `(project_id, client_id)`.
- `notes`, `shares`, and `source_maps`: separate owner-scoped supporting records.
- `limits`: persisted time-bucket counters with a TTL index.

MongoDB does not enforce cross-collection foreign keys. Project and session deletion explicitly removes dependent documents in the server layer. Capture events are stored in their bounded session document so a completed upload has one persistence write.

## Runtime choices

Route handlers use Next.js's Node.js runtime because the MongoDB Node driver and cryptography require it. The Mongo client is reused through a process-global promise so requests share a pool instead of opening a connection each time. The route is dynamic, and API responses are `no-store`.

Docker builds the Next.js standalone output. The container has no database volume: MongoDB Atlas is the persistent store, and `MONGODB_URI` must be injected by the deployment environment.

## Deliberate boundaries

The replay is a visual layout reconstruction, not video or DOM playback. A generated Playwright file is a reviewable draft, not server-executed code or a promise of correct business assertions. Atlas credentials are server-only and must never be prefixed with `NEXT_PUBLIC_`.
