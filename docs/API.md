# HTTP API reference

All request/response examples use synthetic values. JSON writes require `Content-Type: application/json` and, except ingestion, the exact configured `Origin`. Private endpoints additionally require the HttpOnly `repro_session` cookie.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Database reachability + version |
| GET | `/api/auth/me` | Current user or null; enabled integration metadata |
| POST | `/api/auth/register` | `{name,email,password}`; local registration |
| POST | `/api/auth/login` | `{email,password}`; new server session |
| POST | `/api/auth/logout` | Revoke current session |
| GET / POST | `/api/projects` | List owned projects / create `{name,origins}` |
| PATCH | `/api/projects/:id` | Set `{name,origins,repo}` |
| DELETE | `/api/projects/:id` | `{confirm:true}`; cascade project evidence |
| POST | `/api/projects/:id/rotate-key` | Revoke old ingestion key and return a new one once |
| GET / POST | `/api/projects/:id/source-maps` | Private map metadata / upload `{asset,release,map}` |
| POST | `/api/ingest` | Header `X-Repro-Key`, body capture v1; no dashboard cookie |
| GET | `/api/sessions?project=id&search=text&status=new` | Newest 250 matching captures + project totals |
| GET / PATCH / DELETE | `/api/sessions/:id` | Detail / `{status}` / delete |
| POST | `/api/sessions/:id/notes` | Private `{body}` note |
| POST | `/api/sessions/:id/share` | `{hours:24}` returns a new bearer URL |
| DELETE | `/api/sessions/:id/share` | Revoke all shares for this recording |
| GET | `/api/shared/:token` | Restricted public recording view |
| GET | `/api/sessions/:id/export?format=playwright` | Download regression draft |
| GET | `/api/sessions/:id/export?format=markdown` | Download issue report |
| GET | `/api/sessions/:id/export?format=json` | Download evidence |
| POST | `/api/sessions/:id/symbolicate` | Resolve eligible stack positions through private maps |
| POST | `/api/sessions/:id/github` | `{confirm:true}`; optional, allowlisted outbound side effect |
| POST | `/api/sandbox/checkout` | Deliberate authenticated 503 for reproductions |

Triage states: `new`, `investigating`, `resolved`, `ignored`.

## Capture v1

```json
{
  "version": 1,
  "clientId": "capture-example-0001",
  "title": "Checkout fails",
  "url": "http://localhost:3000/checkout",
  "release": "checkout-v1",
  "browser": "Chromium",
  "viewport": { "width": 1280, "height": 900 },
  "duration": 2000,
  "events": [
    { "kind": "navigation", "at": 0, "data": { "url": "http://localhost:3000/checkout" } },
    { "kind": "click", "at": 1000, "data": { "selector": "[data-testid=\"checkout\"]", "label": "Complete checkout", "x": 300, "y": 400 } },
    { "kind": "error", "at": 1400, "data": { "name": "TypeError", "message": "Inventory is undefined", "stack": "" } }
  ]
}
```

Ingestion returns `{id,duplicate:false}` with HTTP 201. A retry using the same project/clientId returns HTTP 200 and the existing ID; it does not append or replace events. Start a new recording to submit a new capture.

Validation removes unrecognized fields from recognized event kinds, rejects unknown kinds, strips URL query strings/hash/credentials, and clamps geometry and timings. See `src/types.ts` and `src/validation.ts` for the exact executable contract.

Errors use `{error: "Safe explanation"}`. Typical statuses: 400 invalid input, 401 missing/invalid auth, 403 disallowed origin/repository, 404 missing or not-owned resource, 409 missing integration configuration, 413 oversized body, 415 non-JSON, 429 rate limit, 502 external GitHub failure. Unexpected server errors never include stack traces or tokens in their response.
