# ReproLab interface system

## Product surface

Mode: **Operate**. A developer scans a failure inbox, selects a recording, follows a visual sequence and exports actionable evidence. The app uses a two-pane replay/inspection workbench rather than a marketing site posing as an admin dashboard.

## Tokens observed in the implemented CSS

| Role | Value |
|---|---|
| Canvas | `#f6f7fa` |
| Paper/surface | `#ffffff` |
| Ink / navigation rail | `#202d43` |
| Secondary text | `#657287` |
| Divider | `#e3e7ee` |
| Primary action | `#344ddc` |
| Primary tint | `#edf0ff` |
| Error | `#b33c4b` |
| Error tint | `#fff0f2` |
| Positive | `#19715c` |
| Base radius | `10px` |

System UI sans text; system monospace only for event times, code and selectors. Fonts are intentionally device-resident: no external font requests or distributed font files. This is a pragmatic operable interface, not a claim of a custom typeface.

## Composition

Desktop has a 220px slate navigation rail, contextual top bar, and flexible main content. Session replay occupies the primary column, with a timeline below and inspector/actions/notes alongside it. The inbox uses an actual data table; the app never seeds fake analytics into a new account.

At narrow widths the rail becomes a compact top navigation, rows become stacked records, and the inspector moves below the replay/timeline. At 390px the reviewed inbox, login, replay, setup and settings views have no page-level horizontal overflow. A recording made on a desktop stays at its original aspect ratio when viewed on mobile; it is scaled, not presented as a mobile recording.

## State language

Ultramarine indicates primary actions/selected controls. Errors use red text and icons, never color alone. Real triage states have text. Empty states lead to a working sandbox or project creation. Native dialogs handle focused actions, keyboard focus is visible, notices use live regions, and reduced-motion settings disable transitions.

## Signature interaction

The scrubber and selected timeline event update the same canvas/inspector state. Playback renders only recorded data primitives; it never loads third-party scripts or injects captured DOM.

## Verification scope

The six committed screenshot files document the actual UI rendered with synthetic local fixtures. The visual pass was performed in-thread because no independent reviewer agent was available. It is not an accessibility certification, a full cross-browser test, or an independent design approval. The managed browser blocked real URL navigation, as recorded in BUILD_REPORT.md.
