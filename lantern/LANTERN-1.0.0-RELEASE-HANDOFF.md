# Lantern 1.0.0 Release Handoff

## Release Status

This is Lantern's first true release. Versions before `1.0.0` are testing
releases and remain outside the public release path.

The user archive is `Lantern-1.0.0.zip`. It contains the guide files, the two
Windows update helpers, and the loadable `lantern/` extension folder. It does
not contain tests, tools, package metadata, build scripts, Git metadata, the
workflow, or maintainer material.

Local sender archive SHA-256: `C8AFCF19B600CF3AAA0E7F1F8C31C68B5B98AB1A4FAA65CA55F0FC7731577BCE`.

Published GitHub Release asset SHA-256:
`018d7c3c9582190dde675c8269fdd3a93365ff27ab1d221605fc0ae33c15cafe`.
GitHub Actions checks out text with LF line endings, so the two ZIP byte hashes
differ; their unpacked user files are semantically identical after normalizing
line endings.

## Update Path

- The extension checks only the pinned public GitHub Releases metadata endpoint
  for `generallennart/Lantern`, at most once a day by default.
- It sends no chat text, account data, identifiers, cookies, credentials, or
  release notes; requests omit credentials and reject redirects.
- GitHub receives ordinary technical connection metadata, such as an IP
  address, as with any public web request; this is disclosed in user guides.
- It accepts only a newer stable `vX.Y.Z` tag and derives the release URL from
  that tag. It never downloads, renders, or executes release content.
- A popup notice and toolbar `!` appear only for a validated newer release.
  The user can disable checks in the popup.
- Chrome cannot automatically replace an unpacked extension. The bundled
  `AKTUALISIEREN.cmd` checks the exact official remote, `main`, and a clean
  worktree before `git pull --ff-only origin main`; then the user reloads the
  extension in Chrome. The Git update guide includes a ZIP fallback.
- Fully automatic browser-extension updates require a Chrome Web Store release.

## Repository and Publishing

Local release state:

- Branch: `main`
- Remote: `https://github.com/generallennart/Lantern.git`
- Local tag: `v1.0.0`
- Local Git identity: `generallennart@users.noreply.github.com`

`main` is the released update branch consumed by user update scripts. Ongoing
work belongs on `develop`; merge it into `main` only when a version is ready to
verify, tag, and release.

`.github/workflows/release.yml` runs verification, usefulness audit, staging,
ZIP creation, SHA-256 generation, and GitHub Release publishing when a
maintainer pushes a `vX.Y.Z` tag.

The initial `main` branch and `v1.0.0` tag were pushed successfully. GitHub
Actions run `35504111252` completed successfully and published the stable
`v1.0.0` Release with its ZIP and SHA-256 asset. Follow
`VEROEFFENTLICHEN.txt` for future tags; do not put a password, personal access
token, cookie, or secret in this repository or a chat.

## Validation Completed

- `npm run verify`: syntax checks passed; 165 Node tests ran, 164 passed,
  0 failed, and 1 optional Playwright browser check skipped because Playwright
  is not installed.
- `npm run audit:usefulness`: 44 cases; `no=27`, `build=5`, `capability=8`,
  `material=4`; frames `none=39`, `light=5`; no direct questions expanded.
- `npm run build`: 5 guide files and 21 extension files, 26 staged user files;
  staged manifest and rules both report `1.0.0`.
- The update checker, opt-out, cache schema, pinned URL, credentials omission,
  redirect rejection, release-tag validation, Git updater preconditions, and
  release workflow all have focused regression coverage.
- The published GitHub asset checksum matched its `.sha256` file, contained 26
  user files, had the expected update scripts and guide, and excluded all
  development and maintainer artifacts.
