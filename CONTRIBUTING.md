# Contributing

Keep the recorder, privacy contract, storage, UI and test generator independently understandable. Changes to privacy defaults, auth, sharing, ingestion limits or export formats require regression tests and a documented compatibility decision.

Run `pnpm install --frozen-lockfile`, `pnpm run check`, `pnpm run typecheck`, and `pnpm run test:browser` in a permitted Chromium environment. Keep the isolated browser suite separately named; never present mocked transport as a real full-stack browser test.

The SDK lives at `public/sdk/reprolab.js`; copy changes into `extension/reprolab.js`. `check:syntax` enforces byte parity. Do not edit the intentionally minified sandbox error module without updating its example source map.

Never commit `.env`, databases, captured real-user sessions, personal test credentials or private map data. Use synthetic fixtures. No generated code or imported script should be executed inside the server process.

For unverified external behavior, leave the relevant ROADMAP checklist open and document the exact boundary. A merged implementation is not proof that a live integration or a physical/browser deployment passed.
