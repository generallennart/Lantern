# Lantern 1.0.1 Independent Review Brief

## Scope

Review this development checkout before changing it. Lantern is a Manifest V3
Chrome/Edge extension for ChatGPT, Claude, and Gemini. The loadable product is
the `lantern/` folder; `dist/release/` is generated and must not be edited.

Start with:

```powershell
npm run verify
npm run audit:usefulness
npm run build
```

Report findings first, ordered by severity. For each finding include a minimal
reproduction, affected file/function, and a focused regression test. Do not put
real chat text, account identifiers, tokens, cookies, or screenshots containing
them into a report.

## Already Verified

- No build, insert, sharpen, feedback, queue, or handover path automatically
  submits a provider message.
- Sharpening inserts its request into the current chat and preserves only
  user-explicit task/goal choices; automatic detections stay out of the
  meta-prompt.
- A custom follow-up focuses the provider's real composer instead of relaying
  text through a second Lantern input. Prior task context is never repeated
  automatically; repeating it is a separate explicit command.
- Handover requests keep each detail under one heading, and a fresh chat does
  not recap the handover before it continues unless an essential detail is
  missing. Move chat carries an explicit auto-insert marker into the fresh tab;
  it fills the real composer but never submits, and falls back to a manual
  Insert control if the composer is unavailable.
- Clear all removes every request-local control while retaining language,
  appearance, history, and handover state. The short five-tab tour is available
  again from Settings.
- Dragging and resizing capture their active pointer and end on normal release,
  cancellation, or lost capture; panel events still do not leak to host chats.
- The daily update check reads only pinned public GitHub release metadata,
  omits credentials, rejects redirects, stores only a timestamp/version, and
  never downloads, renders, or executes release content.
- ChatGPT model labels use neutral prompt framing. Do not infer relative cost,
  speed, or quality from Astra, Astrum, Sol, Terra, or Luna labels.
- Clear requests, strict output contracts, external actions, and missing source
  material deliberately stay unframed. Explicit user choices are honored.
- Long source-processing requests may reorder material before an unchanged task
  on Claude/Gemini only. The ChatGPT exclusion is intentional pending equivalent
  provider evidence.
- Hosted rules must include valid `archetypes` and `goals`; partial free-form
  overlays are intentionally rejected to fail closed.
- The Deferred Help payload is local extension JSON, not remote code. Its fetch
  retries failures and respects a valid hosted explainer override.
- Storage schema is owned by `src/store.js`; background rules refresh must not
  write `lnSchema`.
- The production panel uses a closed Shadow DOM. Page scripts must not be able
  to read draft, history, handover, queue, or generated prompt fields.
- Self-check strings are filtered for account data before excerpting. Generic
  picker and capability-control scans exclude navigation/message content and
  are bounded.
- Hosted rules versions are bounded, response bodies are capped while streaming,
  redirects are refused, and comparison links stay pinned to bundled official
  vendor origins.
- Long direct questions and fully specified prose briefs stay raw unless the
  user explicitly expands them. German review/call forms and bare URLs have
  dedicated regression coverage.
- Panel-originated typing, paste, composition, focus, and pointer events stop
  before host chat handlers can misroute them into a provider composer.
- Claude composer selection accepts only a writable editor, unwraps its
  `chat-input` container, and avoids an unscoped generic editable fallback.
- Model sharpening is a lossless transformation: its returned prompt must carry
  the rough request verbatim, and Lantern rejects a captured result that drops
  source details.

## Review Targets

1. **Live provider DOM**: Load the unpacked extension on logged-in ChatGPT,
   Claude, and Gemini. Follow `TESTING.md`: composer selection, model detection,
   current-chat sharpening, prompt insertion, answer reading, in-page layer,
   and self-test output. Provider markup is the main unautomated risk.
2. **No-send boundary**: Instrument `HTMLFormElement.submit`,
   `requestSubmit`, submit events, `window.open`, and Enter key paths. Exercise
  build, insert, sharpen, composer focus, repeat context, queue, and handover.
3. **Prompt policy**: Try clear questions, short artifacts, material requests,
   strict JSON-only contracts, external actions, explicit controls, quoted text,
   German/English input, and the Izzet playlist case. Check that no inferred
   kind, goal, output format, quality bar, or improvement tip enters a sharpen
   request unless the user selected it.
4. **Storage lifecycle**: Test migration from schema 1 and malformed values,
   browser extension reload/detached context, a saved panel position across a
   narrow viewport, history restoration, and clearing each request-scoped
   option. Verify no request text reaches statistics.
5. **Hosted rules**: Use a local CORS-enabled rules file and test valid update,
   malformed JSON, oversized response, timeout, credentials in URL, downgrade,
   hostile strings, and the deferred explainer override.
6. **Accessibility and touch**: Test keyboard tabs, all radio-navigation keys,
   Escape from Help then panel, focus restoration, reduced motion, dark/light
   themes, touch drag/resize, and narrow mobile widths.
7. **Packaging**: `npm run build` must stage only root guides plus runtime
   extension files. Confirm no `test/`, `tools/`, `package.json`, `build.js`,
   `dist/`, or maintainer documents enter the ZIP.

## Known Limits, Not Defects

- Live provider selectors and model labels can only be proven on real accounts.
- The optional Playwright fixture test skips when Playwright is absent; its
  absence must not make `npm run verify` fail.
- Reorder-only behavior reports `asIs: false` because the text order changed,
  even though it adds zero instructions.
- A valid explicit improvement tip now overrides abstention. An old value that
  lacks `improveExplicit` is intentionally ignored.

## Deliverable Format

Give a short findings list with severity, evidence, and suggested test. Then
list observations that are policy choices or untestable provider risks so they
are not misreported as confirmed bugs.