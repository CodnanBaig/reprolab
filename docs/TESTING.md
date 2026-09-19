# Testing strategy

Tests distinguish business logic, HTTP/storage integration, isolated browser behavior and actual browser journeys. A passing layer never substitutes for another layer.

## Node unit and API tests

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run test:coverage
```

`tests/core.test.ts` exercises redaction, URL sanitization, capture bounds, selectors, password hashing, regression draft escaping/fixtures, source-map decoding, persistence, upload deduplication and retention.

`tests/api.test.ts` starts the actual Node HTTP server with a temporary in-memory SQLite database. Built-in `fetch` hits a real loopback socket. It checks registration, cookies, origin enforcement, project setup, key rotation, cross-user access, ingest retries, triage, notes, export, map lookup, share expiry/revocation, external-write configuration guards, and deletion/logout.

The tested GitHub guard rejects disallowed repositories before any outbound request. It does not validate a real GitHub token or successful live issue creation.

Coverage uses Node's V8 instrumentation, excludes `tests/**`, and covers only the modules loaded by that test run. It does **not** include the browser interface/SDK or imply path correctness beyond the assertions.

## Static/build checks

```bash
pnpm run check:syntax
pnpm run build
pnpm run typecheck
```

Syntax checks parse browser/extension/tool scripts and ensure the extension's recorder bytes match the SDK. Build strips erasable TypeScript, rewrites relative module extensions, and copies the browser app. It is not a typechecker. Strict typechecking uses the pinned TypeScript and Node types in `devDependencies`.

## Full browser journeys

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tests/requirements.txt
python3 -m playwright install chromium
pnpm run test:browser
```

The suite runs against a disposable real localhost server/database, creates only synthetic users and records the actual sandbox. It is intended to verify capture → upload → persisted session → replay → export, sharing, map upload, deletion/logout and responsive behavior.

These 7 journeys were attempted during the initial build but blocked by a managed Chromium `URLBlocklist` policy. They were rerun successfully on 2026-09-19 in a permitted local Playwright Chromium environment. Do not disable corporate/browser security policies to force them through; use a permitted development profile/environment instead.

## Isolated Chromium suite

```bash
pnpm run test:browser:memory
```

`tests/browser_memory_test.py` uses an in-memory document and synthetic transport. It loads the actual SDK and actual UI source, inlines the authored local stylesheet/icon, performs user actions, captures the actual visual-node sequence, and exercises rendering/controls.

The recorder test stubs one failing HTTP response. The workbench API is a fixture. Consequently, these 8 tests **do not establish server/browser cookie, navigation, CSP, or CORS integration**. The separate HTTP tests cover server behavior, and full journeys remain required to join those layers.

The screenshots in `docs/screenshots/` were made by this isolated suite. They show real rendered UI and a synthetic test recording; they are not evidence of a public deployed app or real user traffic.

## CI

`.github/workflows/ci.yml` runs static, strict-type, unit/API, build and full browser checks on every push and pull request. pnpm, Python Playwright and Node are pinned. A failure blocks the workflow; the workflow does not ignore the browser job merely because the initial delivery environment was restricted.

Use GitHub Actions as the source of truth for remote results on the exact commit. See BUILD_REPORT.md for the dated local command results and their evidence boundary.
