# Lantern 1.1.1 Release Handoff

## Scope

`1.1.1` is a documentation and labeling patch for the public `1.1.0` task-list
handover behavior. It does not change the update checker, microphone boundary,
or chat automation behavior.

## Changes

- **Move chat:** The German label now makes the optional first task explicit.
  The German guide consistently calls the collected handover an ordered task
  list and correctly says that a new chat starts with its first item unless it
  needs one essential clarification.
- **Voice typing:** The guide and panel now name the task-list field alongside
  the other Windows Dictation (`Win+H`) text fields.
- **Version history:** `AENDERUNGEN.txt` records the clarification separately
  from the feature release in `1.1.0`.

## Safety Boundaries

- Lantern still never sends a provider message automatically.
- Lantern still has no microphone permission, audio capture, or browser speech
  recognition implementation.
- A release notice still requires a strictly newer stable tag with the exact
  official ZIP and SHA-256 assets.

## Validation Required

```powershell
npm run release:check
npm run verify
npm run audit:usefulness
npm run build
```

Final archive SHA-256: `8DFD5B63A7466E46772E7E415054F7F3D685B76F93A39CB0C21D1EECEA16F923`.