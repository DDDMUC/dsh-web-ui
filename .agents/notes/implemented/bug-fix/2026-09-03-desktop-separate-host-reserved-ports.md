# Agent Note: desktop app runs its own host on a reserved-port-free range

Status: implemented

Supersedes parts of [the Electron desktop app note](../architecture/2026-09-03-electron-desktop-app.md): the handoff-on-3080 design and the unqualified free-port pick are gone. Also records the first full packaged-build verification, which found and fixed a broken runtime-payload chain.

## Problem

The desktop app probed `http://127.0.0.1:3080` at boot and handed that URL to the system browser when anything answered. On the standard machine — one where a plain `dsh web` already runs on 3080 — the app therefore never started a host of its own; it degenerated into a bookmark. Its port pick was an unqualified OS-assigned free port, so "never the user's own 3080/3081" held only by statistical accident.

The packaged chain had never been run end to end, and testing it surfaced four more defects: the staged Node directories were named `node-darwin-*`/`node-win32-*` while electron-builder's `${os}` macro expands to `mac`/`win`, so `extraResources` missed the Node payload (only a warning); `dist:mac` built the current architecture only despite the documented dual-arch matrix; the packaged app silently lost both payload `node_modules` trees (see below); and `VERSION.json` never reached the package, making the packaged reseed stamp permanently `unknown`.

## Decision

The desktop app always spawns its own separate host and owns its lifecycle:

- The 3080 attach/handoff path and its `DSH_DESKTOP_NO_ATTACH` escape hatch are removed. `findHostPort()` serves the dedicated loopback range 3082-3181 first (a stable address across launches) and falls back to an OS-assigned port; 3080/3081 are excluded by contract on both paths, with unit tests that bind real sockets.
- The staged payload naming follows the electron-builder `${os}` spelling (`node-mac-*`, `node-win-*`) everywhere, and `build-runtime.mjs` asserts every shipped payload's entry binary before staging.
- The runtime payload is copied by an `afterPack` hook (`scripts/after-pack.cjs`) instead of `extraResources`: electron-builder shares its exclude patterns between the files and extraResources matchers, so the app directory's node_modules exclusion silently dropped both payload trees, and a missing extraResources source only warns. The hook copies host, profile-web, the per-arch Node distribution, and `VERSION.json`, and hard-asserts each destination entry point.
- `dist:mac` / `dist:win` pin explicit `--arm64 --x64` / `--x64` flags so the documented artifact matrix is what builds.

## Testing

- `node --test` (11 tests): port contract — the reserved set is exactly 3080/3081, `findHostPort` serves the dedicated range, skips an occupied port, and returns an immediately bindable port.
- Dev-mode live run with an isolated `DSH_HOME`: profile seeded with marker, host on 127.0.0.1:3082, bare URL 401, tokenized URL 200 after the cookie exchange, the user's real 3080/3081 instances kept their pids and answered throughout, and SIGTERM on the app took the host and the port with it.
- Packaged live run (arm64 `.app`): the same assertions pass; the app quits cleanly and frees the port.
- Both `dmg`/`zip` artifact sets (arm64 + x64) verified by zip listing: full host closure (27180 entries), the Node binary, and `VERSION.json` present.

## Consequences

Two web hosts on one `~/.dsh` is now the designed coexistence: the CLI instance keeps 3080/3081, the desktop instance takes 3082+, and each GUI holds its own session.

The doctor daemon finding recorded below as open was resolved the next day: the supervisor now runs as a host-bounded child and no OS service is registered at all — see [dsh-doctor bounded supervisor](../architecture/2026-09-04-dsh-doctor-bounded-supervisor.md).

Open finding, reported at the time and needing a product decision: every dsh host boot deploys the dsh-doctor user service (`service-install` writes `~/Library/LaunchAgents/com.dsh.doctor.plist` with `KeepAlive` + `RunAtLoad`), pointing at that host's own install paths. The daemon outlives any process-group cleanup because launchd owns it, and the plist is global state that any boot hijacks — during this verification it was repointed by the desktop dev run and again by a concurrent automation's e2e instance, and was restored each time via `service-install` from the real profile. Options on the table: disable the doctor rows in the desktop profile seed, run `service-uninstall` when the app quits, or accept a persistent background daemon.
