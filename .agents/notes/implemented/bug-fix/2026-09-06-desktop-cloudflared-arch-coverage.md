# Agent Note: Desktop payload carries every shipped OS's cloudflared binary

Status: implemented

## Problem

The desktop payload's `cloudflared` dependency installs its postinstall binary for the build machine's platform only. The staged profile tree therefore shipped a macOS arm64 `bin/cloudflared` inside the Windows installers too: on Windows the package looks for `bin/cloudflared.exe` (absent, so the tunnel only worked after an on-demand download), and on macOS x64 the tunnel plugin's existence check trusted the wrong-arch Mach-O and the tunnel start hard-failed with no self-heal path. Both directions surfaced in the Windows compatibility audit of the release pipeline.

## Decision

Two complementary fixes, one per side of the gap:

- **Build time (desktop payload)**: `desktop/scripts/build-runtime.mjs` fetches `cloudflared-windows-amd64.exe` from the cloudflared GitHub release (latest channel, the same channel the package's own postinstall uses) into the staged profile tree as `bin/cloudflared.exe` — the name the package resolves natively on win32 — with an MZ/PE sanity check. `assertRuntimeEntrypoints` and the afterPack hook both assert the binary reaches the packaged app.
- **Runtime (tunnel plugin)**: the default binary readiness in `packages/dsh-remote-web-ui/src/tunnel.ts` no longer trusts mere existence. It probes the binary with a 10s-boxed `--version` spawn (cached per process via `createBinaryReadiness`), reinstalls the current platform binary through the cloudflared package's `install()` when the probe fails, and throws a diagnosable error when the reinstalled binary still cannot run. This covers macOS x64 (wrong-arch staged binary re-fetched on the first tunnel start) and any corrupted or stale binary.

## Alternatives considered

- Stage per-arch binaries under arch-suffixed names and make the plugin resolve them: gives first-use tunneling on every shipped target but adds a resolution vocabulary the cloudflared package does not have, and tunneling requires network anyway, so the on-demand re-fetch costs one download on first use only.
- Ship the Windows binary through the cloudflared package's own `install_windows()`: rejected — it keys the asset off `process.arch` of the build machine, which is arm64 on the macos-latest runner and has no matching Windows asset; a direct fetch of the known amd64 asset name is simpler.
- Validate by reading Mach-O/PE headers instead of spawning: cheaper, but duplicates per-OS binary-format knowledge; a `--version` spawn tests exactly the property that matters (the OS can execute it).

## Consequences

- Windows tunneling is zero-setup out of the box; macOS x64 self-heals on the first tunnel start (one network fetch into the user-writable `~/.dsh` profile tree).
- Each desktop build fetches one extra ~20 MB binary; the Windows installers also carry the darwin `bin/cloudflared` the postinstall staged (pruning per target is a later optimization only if measured size matters).
- The staged exe rides the `latest` release channel at build time, like the package's own postinstall binary; both float together.

## Testing

- `packages/dsh-remote-web-ui` vitest: four new cases cover skip-plus-cache, wrong-arch reinstall, absent-binary download with a loud failure when the reinstall still cannot run, and the real `binaryRuns` probe (node runs, a missing path does not); the full 347-test plugin suite passes.
- A local `node scripts/build-runtime.mjs` run staged `cloudflared.exe` (verified PE32+ x86-64 via `file`) and passed the new assertion; `npx electron-builder --win dir --x64` packaged it into `dist/win-unpacked/resources/runtime/profile-web/node_modules/cloudflared/bin/` with the afterPack assertion exercised.
