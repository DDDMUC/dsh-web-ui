# Agent Note: desktop packaging ships through GitHub Actions

Status: implemented

## Problem

Desktop installers existed only as local builds: nothing attached them to GitHub Releases, so v0.3.14 shipped without the desktop app even though the Electron skeleton and the rc.1 runtime payload were ready. The user asked for the desktop artifacts to be packaged by Actions and attached to this release.

## Decision

New `.github/workflows/desktop-release.yml`:

- Triggers: every `v*` tag push (future releases get installers automatically; the job waits up to 20 minutes for release.yml to create the Release before uploading, so a failed main pipeline leaves no partial assets) plus `workflow_dispatch` with `tag` (release to attach to) and optional `ref` (tree to build) — the dispatch path exists to backfill existing releases; for v0.3.14 it builds `dev` because the seed-0.3.14 advancement landed after the tag and the tag must not move.
- One `macos-latest` job builds ALL six targets: electron-builder 26 cross-builds the Windows nsis/zip targets on macOS natively (verified locally: exe 320MB + zip 418MB, afterPack staged the win-x64 payload correctly); no Windows runner and no wine involved.
- The runtime payload is resolved from the registry at build time (`desktop/runtime/*/package.json` pins), so building with `ref: dev` yields the rc.1 host + launcher-free 0.3.14 family.
- `npm version <tag-minus-v>` stamps the app version runner-locally so artifacts are named `dsh-desktop-X.Y.Z-*` without touching the repo.
- Upload uses `gh release upload --clobber`; concurrency is serialized per tag.

Load-bearing finding: the first two dispatches both failed in `pnpmInstall('profile-web')` with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` — the 0.3.14 aggregate rides `dsh-better-sidebar@0.18.0` into the seed closure, published 2026-09-03T11:40Z, and the runner's pnpm 11.24 (the repo pin) enforces the 24h `minimumReleaseAge` cutoff that local pnpm 11.9 does not. The first run hid the error behind a util.inspect byte dump; relaying `spawnSync` output as text exposed it, and the fix (seed exclude-ledger entry) lives in the seed note. Two operational lessons: local pnpm 11.9 green does not prove the pinned runner pnpm 11.24 will accept a lockfile, and the desktop exclude ledgers must cover non-family ride-along deps whenever the adopted aggregate bumps them.

## Testing

- Local `npm run dist:win` on macOS produces the exe/zip pair; `npm run build-runtime` passes with the retry logic; `desktop` package tests pass.
- Workflow steps proven by the dispatched v0.3.14 runs 33824501455 / 33825080509 (checkout, pnpm, node, npm ci, prepare-runtime, and the failure diagnostics); the build-and-upload path is validated by the run following the seed ledger fix.

## Consequences

- Future releases carry desktop installers without manual packaging; the desktop runtime staging note ("alpha.4 until prepare-runtime runs") is superseded for release builds — CI always stages fresh from the registry.
- The cloudflared known limitation improves per build: each runner stages its own platform's cloudflared, so mac installers carry the darwin binary and win installers the win one.
- If the silent pnpm verification failure ever stops being transient, the relayed text output will carry the real diagnosis.
