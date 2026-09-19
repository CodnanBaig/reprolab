# Scope and completion checkpoints

This checklist tracks **v0.1**, not every possible feature of a future observability company.

## Implemented and locally checked

- [x] Private local account/project model with server-side ownership.
- [x] Explicit-consent browser SDK; start, stop, retryable explicit upload.
- [x] Input masking, private subtrees, public-text opt-in, sanitized event contracts.
- [x] Bounded frames/events/bytes, ingestion keys/origins, rate limits.
- [x] Transactional SQLite storage, retry deduplication, retention and deletion.
- [x] Replay canvas, scrubber, playback speed and event inspector.
- [x] Session search/filter, error grouping, triage and investigation notes.
- [x] Playwright regression drafts, Markdown report, JSON evidence export.
- [x] Expiring/revocable restricted shares.
- [x] Flat-v3 source-map upload and lookup.
- [x] Deliberately broken checkout sandbox.
- [x] Node unit/API tests and isolated Chromium tests.
- [x] Strict server/test TypeScript check, browser syntax check, compiled output.
- [x] Responsive desktop/mobile screenshots with fixture provenance.
- [x] Local operator password reset.

## Implemented, external acceptance still required

- [ ] Run the seven actual browser journeys in an environment that permits localhost navigation.
- [ ] Install and test the unpacked Chrome extension on a real target, including CSP and reload lifecycle limitations.
- [ ] Exercise explicit GitHub issue creation with a fine-grained allowlisted token and verify timeout/retry behavior.
- [ ] Run the supplied Docker image/compose configuration and verify persistent volume restoration.
- [ ] Publish `CodnanBaig/reprolab`; run and inspect remote CI on the pushed SHA.

## Deferred deliberately

- Pixel-perfect DOM/media/shadow-DOM/iframe replay.
- Durable recording across reloads, tabs and navigations; resumable/background uploads.
- AI diagnosis, automatic code fixes, “guaranteed correct” tests.
- Per-user GitHub OAuth/GitHub App installation model and cross-system idempotent delivery.
- SSO, email verification/recovery, invitations, administrative role model.
- Queue-backed ingestion, multi-node deployment and distributed abuse prevention.
- Indexed source maps, automatic artifact uploads and release-source retention policy.
- Public hosted service, billing, extension-store distribution and a formal security audit.

## Employer-review release gate

A reviewer should be able to run the sandbox, produce evidence, inspect the implementation, and understand the trade-offs. Before labeling this a fully verified release, the unrestricted full browser suite and remote CI must pass on the exact version you share. Never close external acceptance checks based only on source code being present.
