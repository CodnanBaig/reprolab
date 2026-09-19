# ReproLab
A self-hosted, privacy-first browser bug workbench for developers. A developer explicitly starts a recording in an instrumented app, reproduces a bug, sends the sanitized evidence, inspects the timeline and visual reconstruction, and exports a Playwright regression draft or GitHub issue.

The v0.1 release must be usable without paid services. It is not an analytics tracker. Raw DOM HTML, screenshots, input values, request/response bodies, cookies and authorization headers are never collected. Public text is opt-in using data-repro-public. Visual replay is a bounded layout reconstruction, not pixel-perfect video or rrweb. The app is multi-user with private owned projects and explicit expiring shares. Capture keys grant ingestion only, not dashboard access.

Out of scope for this release: AI-generated diagnosis, distributed high-volume ingestion, SSO, mobile-native recording, and guaranteed auto-generated test correctness for arbitrary uninstrumented sites.
