# Testing strategy

Each layer establishes a separate boundary. A passing build or mocked browser test does not prove MongoDB, browser, or external-service acceptance.

## Unit and static checks

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run test:coverage
pnpm run typecheck
pnpm run check:syntax
pnpm run build
```

`tests/core.test.ts` verifies redaction, URL sanitization, capture bounds, selector validation, password hashing, export safety, and source-map decoding. Syntax checks parse browser/extension/tool scripts and enforce recorder parity. `next build` validates the App Router routes and production standalone output.

## Full browser journeys with MongoDB

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tests/requirements.txt
python3 -m playwright install chromium
pnpm run test:browser
```

The suite requires `MONGODB_URI`. It creates a uniquely named `reprolab_browser_*` database, runs the real Next.js development server and sandbox, and drops only that generated database in teardown. It covers registration, capture → upload → replay, triage, notes, exports, shares, source-map lookup, ownership, deletion, and responsive layouts. Use a MongoDB account where creating and dropping these test databases is permitted.

## Isolated Chromium suite

```bash
pnpm run test:browser:memory
```

This loads the actual SDK and workbench assets against synthetic transport in an in-memory browser document. It proves recorder masking and interaction rendering, but it does not prove Next.js routing, cookies, CORS, Atlas connectivity, or API persistence.

## CI

The baseline workflow runs dependency installation, typechecking, syntax checks, unit coverage, a production build, and isolated browser checks without requiring database credentials. Add a dedicated protected-environment job with a scoped test Atlas URI before making MongoDB-backed browser journeys a required remote gate. Never use a production database for this job.
