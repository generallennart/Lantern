# Lantern 1.1.0 Release Handoff

## Scope

`1.1.0` adds safe voice typing guidance, action-only chat handovers, and a
stricter release-notice gate. It introduces no microphone, audio, speech
recognition, provider, or account permission.

## Changes

- **Voice typing:** Lantern now explains Windows Dictation (`Win+H`) for any
  focused text field. Lantern does not request microphone access, record audio,
  access `getUserMedia`, or use browser speech recognition. Microphone and
  dictation remain an explicit Windows/user decision.
- **Move chat:** Handover requests now ask only for an ordered, verb-led next
  task list. Goal, facts, decisions, style, and summaries are no longer
  separate categories or UI choices.
- **Update notice:** Lantern shows `!` only for a strictly newer stable release
  whose exact official ZIP and SHA-256 assets are present. A failed recheck
  clears any expired cached warning rather than showing stale update advice.
- **Changes file:** `AENDERUNGEN.txt` starts with stable 1.0 and lists each
  user-visible version change.

## Safety Boundaries

- No automatic sending remains possible.
- No microphone/browser-speech implementation or microphone permission exists.
- GitHub update metadata remains pinned, credential-free, redirect-free,
  response-capped, asset-validated, and data-only.
- The update guide documents ordinary network metadata honestly and user data
  remains out of update requests.

## Validation Required

```powershell
npm run release:check
npm run verify
npm run audit:usefulness
npm run build
```

Final archive SHA-256: `09BBF3DFC0BB71B97710CE64229A938C3BCE66208F3C3E91663C43F6A97284D8`.
