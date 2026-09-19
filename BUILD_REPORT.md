# ReproLab v0.1 — build and verification report

**Date:** 2026-09-18. **Delivery:** self-hosted source prototype, not a deployed SaaS or a published GitHub repository.

## Actual environment

Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, @types/node 24.0.4 for optional static checks, Python Playwright 1.57.0, system Chromium.

The app itself requires no runtime npm dependencies. Its core runtime is Node HTTP, crypto, filesystem and SQLite. SQLite and type-stripping emitted expected experimental notices on this tested Node version.

## Passed here

| Check | Observed result |
|---|---|
| `npm test` | **69 passed**, 8 suites, 0 failed/skipped |
| `npm run test:coverage` | **69 passed**; loaded server/core modules: **89.91% lines, 73.35% branches, 94.37% functions** |
| `tsc --noEmit` | Passed strict server/test TypeScript checking |
| `npm run check:syntax` | Passed browser/tool parsing and SDK/extension byte parity |
| `npm run build` | Compiled server and browser assets written successfully |
| Compiled-server smoke | Actual HTTP 200 for health, root, UI JS/CSS, SDK, sandbox and error module |
| `python tests/browser_memory_test.py` | **8 passed**, 0 failed; isolated Chromium + fixture transport |
| On-disk persistence regression | Actual temporary SQLite close/reopen retained session/events and retry deduplication |

Coverage excludes `tests/**` and does not measure the browser SDK/UI. The percentages are loaded-module V8 coverage, not a claim of overall application correctness.

## Browser evidence boundary

The seven full browser journeys in `tests/browser_test.py` were attempted. Managed Chromium rejected localhost URL navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR` under a URL-blocking policy. The policy was not modified or bypassed. These journeys are **blocked/unverified, not passed**.

To inspect real browser code without claiming a live browser/server result, the separate isolated suite uses in-memory HTML, the actual recorder/UI/CSS, and a synthetic fetch adapter. It captured the actual visual-node event sequence of a deliberately broken checkout and exercised consent, masking, playback, triage, notes, export presentation and responsive layouts.

This confirms those isolated behaviors, **not** cookie/navigation/CORS/CSP integration. The localhost HTTP/SQLite tests independently verify server behavior. Run the full browser suite on a permitted development machine to join these layers.

Committed screenshots are real Chromium renders of synthetic fixtures. They are not static UI mockup images and not evidence of a hosted deployment. See `docs/screenshots/PROVENANCE.md`.

## External behavior not claimed

- No authenticated GitHub repository creation or source push. The available connector exposed reads only; no authenticated `gh` CLI existed. The local publishing helper was exercised and failed closed before creating anything.
- No successful live GitHub issue side effect. Configuration/origin/ownership/confirmation/allowlist guards were tested locally.
- No Chrome extension installation or store release. Source and matching SDK were included and syntax checked.
- No Docker runtime verification. Dockerfile/compose are supplied, not reported as run.
- No public deployment, remote CI run, load test, penetration test or accessibility certification.

## Reproduction commands

```bash
npm run check
npm run test:coverage
# With documented optional static tooling installed:
npm run typecheck
# With Python Playwright and a permitted Chromium installation:
npm run test:browser
npm run test:browser:memory
```

Verification logs retained in `docs/verification/` contain only synthetic local test information. Runtime databases, environment files, capture keys and generated test users are excluded from the deliverable.

## Completion decision

The v0.1 implementation and local artifact are ready for developer inspection. Full browser integration and external publication/integration acceptance remain explicitly open in ROADMAP.md. No “100% production-ready” claim is made.
