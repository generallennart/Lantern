# Lantern 1.0.1 Release Handoff

## Release Scope

`1.0.1` is a documentation and onboarding patch for the stable `1.0` release.
It does not change prompt generation, provider selectors, permissions, update
logic, or the no-send boundary.

The patch fixes the first gap reported by new users: the installation guides
previously said to unzip the archive without explaining how. The German-first
guides now explicitly describe:

1. Open Downloads.
2. Right-click the Lantern ZIP file.
3. Choose `Alle extrahieren...` / Extract All.
4. Click `Extrahieren` / Extract.
5. Continue only in the new normal folder, not in the `.zip` file.

The same explanation is present in the main HTML guide, quick-start text,
full install guide, ZIP fallback, sender note, and an automated regression.

## User Archive

The published user archive is `Lantern-1.0.1.zip`. It must contain 26 user
files: five root guide files and 21 extension files. It excludes Git metadata,
tests, tools, package metadata, build scripts, review briefs, and handoffs.

Local sender archive SHA-256: `cde87628c72559742bc258fd38457798aba4683955273696bcc68af6c032a4f6`.

Published GitHub Release asset SHA-256:
`052ea282263521fe16c05becef8f2ffe280dfedd1132282f14abc979d403e466`.
GitHub Actions checks out text with LF line endings, so the ZIP byte hashes can
differ from the local Windows archive; unpacked user files are semantically
identical after normalizing line endings.

## Validation Required

```powershell
npm run release:check
npm run verify
npm run audit:usefulness
npm run build
```

The GitHub release workflow must complete on tag `v1.0.1` before users receive
a release notice.

## Validation Completed

- `npm run release:check`: all visible version references match `v1.0.1`.
- `npm run verify`: syntax checks passed; 166 Node tests ran, 165 passed,
	0 failed, and 1 optional Playwright browser check skipped because Playwright
	is not installed.
- `npm run audit:usefulness`: 44 cases; `no=27`, `build=5`,
	`capability=8`, `material=4`; frames `none=39`, `light=5`; no direct
	questions expanded.
- `npm run build`: five guide files and 21 extension files, 26 staged user
	files; staged manifest and rules both report `1.0.1`.
- `Lantern-1.0.1.zip`: extracted paths and SHA-256 values match staging
	exactly; update scripts and guide are present and all development artifacts
	are absent.
- GitHub Actions completed successfully and published stable `v1.0.1` with its
	ZIP and SHA-256 asset. The public asset checksum matched its published file,
	had 26 user files, and passed every explicit ZIP-extraction guide check.
