# Architecture and engineering decisions

## Modules

| Module | Responsibility |
|---|---|
| `src/server.ts` | HTTP routing, sessions, ownership, CORS/CSRF, bounded body parsing, static files |
| `src/store.ts` | SQLite schema, transactional capture save, deduplication, limits, retention |
| `src/validation.ts` | Closed capture contract; validation before storage |
| `src/privacy.ts` | Server-side redaction and selector/color allowlists |
| `src/security.ts` | Scrypt, random tokens, token hashing, timing-safe verification |
| `src/exports.ts` | Deterministic Playwright and Markdown generation |
| `src/sourcemaps.ts` | Flat v3 parsing, base64 VLQ, generated-to-original position lookup |
| `public/sdk/reprolab.js` | Framework-independent recorder and client-side privacy boundary |
| `public/app.js` | Workspace state, routing, accessible controls, canvas playback |
| `public/sandbox*` | A real reproducible failed checkout, with a matching example source map |
| `extension/` | Manual active-tab injection adapter; same SDK bytes |
| `scripts/admin.ts` | Local operator-only password reset and session revocation |

## Flow

1. A workspace owner creates a project, obtaining a random ingestion-only key. The server stores a hash, not the raw key.
2. A developer starts the SDK explicitly after consent. The SDK records a bounded in-memory event sequence and selected visual frames. It hooks errors, warnings, fetch/XHR, input changes, navigation and scroll.
3. Input values are never read. Text is masked unless its direct element opts in. Private ancestors override opt-in.
4. `stop()` restores patched APIs and removes listeners. It returns one stable capture. `upload()` stops if necessary and submits that capture; retries reuse the same client ID.
5. The server validates the key, allowed website/capture origin, rate, body size and event shape. Unrecognized fields are not persisted.
6. The store writes session metadata and event rows atomically. `(project_id, client_id)` is unique, preventing ordinary retry duplication.
7. The owner loads the workbench. Frames are drawn to a canvas and events can be selected by time/kind. Generated code remains text for the developer to review, never server-executed code.

## Persistence model

- `users`: local identity and password hashes.
- `auth_sessions`: hashed opaque tokens with expiry.
- `projects`: owner, origins, optional GitHub repository, hashed ingestion key.
- `sessions`: sanitized capture metadata, triage, fingerprint, optional external issue URL.
- `events`: ordered per-session evidence.
- `notes`: private investigation prose.
- `shares`: token hashes, session reference and expiry.
- `source_maps`: project + exact asset + release with uploaded map data.
- `limits`: persisted time-bucket counters.

Foreign keys cascade evidence deletion. WAL enables ordinary local concurrent readers; each upload is a bounded transaction. Default 14-day session retention is purged on requests at a ten-minute cadence. This is not a timed background daemon: an idle offline instance cleans up on its next request.

## Important trade-offs

### Zero runtime dependencies, not framework maximalism

The initial environment could execute Node and TypeScript but could not download third-party packages. This implementation uses built-in Node HTTP/SQLite and browser standards, so the runtime does not depend on an unavailable framework stack. Server contracts are strict TypeScript. The frontend/SDK are JavaScript with parse checks and browser tests, not a Next.js/React application.

A future UI port can keep the data, privacy and recorder contracts. It is not required for the implemented workflow. Do not market the framework choice as a performance benchmark; none was measured.

### Reconstruction rather than executable DOM replay

A small visual-node schema deliberately sacrifices pixel fidelity. The viewer needs no injected HTML, iframes, remote assets, or script re-execution. It is inspectable and bounded, but does not support iframe/shadow-DOM/media replay. Describe it accurately in a portfolio.

### Deterministic test drafts, not an LLM wrapper

The generator emits actions from captured stable selectors. It preserves the initial navigation URL and requires safe fixture values for masked inputs. It cannot know application-specific expectations, recreate third-party state, infer correct auth, or guarantee selectors survived a redesign. Generic “no error / no 5xx” assertions are a starting point.

### Single-node storage

SQLite with synchronous bounded transactions is intentionally suitable for a personal/private developer tool. It is not a distributed event platform. Horizontal scaling would need queueing, shared database/object storage, distributed quotas and a redesigned ingestion pipeline. Those are future work, not simulated features.

### Clear boundary between application auth and recorder auth

A signed-in user manages projects and reads evidence. A recorder key only submits evidence to one project. Expiring shares grant a restricted read capability to exactly one recording. Source maps and notes never inherit share access.

## Capacity boundaries

- SDK: 5 minutes, approximately 2.3 million serialized character units, at most 2,200 normal events and up to 35 frames. A final manual frame may add one event.
- SDK frames: at most 250 visible nodes. Server accepts at most 350 nodes per frame.
- Server upload: 3 MB actual bytes and 2,500 events maximum.
- Maximum 20 projects per user; 1,000 captures per project; session list returns the newest 250 matching entries.
- Rate limits: 60 ingestions per project/minute; 15 auth attempts per address/15 minutes; 5 confirmed GitHub writes per user/minute.

Multibyte text can hit the server byte limit before the client's character-based budget. Upload failures are surfaced and the in-memory capture is preserved for explicit retry; cross-reload recovery is not implemented.
