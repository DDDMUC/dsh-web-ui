# desktop — DeepSeek Harness desktop app

English | [中文](README.zh.md)

An Electron shell that turns the DeepSeek Harness Web GUI into an installable desktop app for macOS and Windows. The installer bundles a standalone Node.js runtime, the dsh host, and a preinstalled web profile (official web bundles plus the dsh-web plugin collection), so the app runs with zero preinstalled tooling — no Node, no npm, no dsh CLI setup.

## What it does

- Double-click launch: the app seeds `~/.dsh/profiles/web` from the bundled profile when it is missing, starts its own dsh host on a dedicated loopback port with the bundled Node runtime, waits for the GUI, and loads the tokenized URL the host prints (the auth fence issues a per-process token; the resulting session cookie lives in the app window).
- Separate host, guaranteed ports: the app always runs its own bundled host — it never attaches to an existing GUI and never binds the plain `dsh web` CLI defaults 3080/3081. It prefers the dedicated 3082-3181 range (a stable address across launches) and falls back to an OS-assigned port if the range is full. The desktop instance and your own `dsh web` run side by side, each with its own GUI session.
- Shares `~/.dsh` with any existing dsh installation: profiles the app seeded itself carry a `.dsh-desktop-seed.json` marker and are re-seeded when the bundled runtime changes; profiles without the marker are user-managed and never touched. The user's `cordis.patch.yml` layer survives re-seeding.
- One window per machine: a second launch focuses the existing window. Closing the window quits the app and gracefully stops the host it spawned (process-group SIGTERM, `taskkill /T` on Windows, forced after 5s).
- Startup failures (missing payload, host exit before ready, ready timeout) land on an error page with the host log tail, a Retry button, and a Reveal-log-file button. The full host log lives at the Electron `logs` directory (`dsh-host.log`).

## Repository layout

| Path | Content |
| --- | --- |
| `src/` | Electron main process (`main.cjs`), testable pure helpers (`runtime.cjs`), preload, splash and error pages |
| `runtime/host/` | Pinned `@deepseek-ai/dsh` manifest + pnpm layout (hoisted, multi-platform) |
| `runtime/profile-web/` | Web profile seed manifest: bundles `dsh-base` + `dsh-web-app` + `@linxin666/dsh-web-all` |
| `scripts/fetch-node.mjs` | Downloads + sha256-verifies the bundled Node distributions (`resources/runtime/node-<os>-<cpu>/`) |
| `scripts/build-runtime.mjs` | pnpm-installs both payloads and stages them into `resources/runtime/` |
| `scripts/after-pack.cjs` | Copies the staged payload into the packaged app after packing (electron-builder's extraResources would silently drop the payload node_modules) |
| `resources/` | App icons + generated runtime payload (git-ignored) |

## Build

### Prerequisites

The build machine needs Node 22+ and pnpm 11 (the repository toolchain). The packaged app itself needs nothing.

### Steps

```sh
cd desktop
npm install            # electron + electron-builder
npm run prepare-runtime  # fetch Node distributions + install and stage the payload
npm run dist:mac         # dist/*.dmg + *.zip (arm64 + x64)
npm run dist:win         # dist/*.exe (nsis) + *.zip (cross-build from macOS)
```

`npm start` runs the app unpackaged against the staged `resources/runtime/`, for development.

## Config

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | Data home shared with the dsh CLI (config, sessions, keys). Set only for isolated testing. |

The bundled versions are pinned in `runtime/host/package.json` (`@deepseek-ai/dsh`) and `runtime/profile-web/package.json` (`@linxin666/dsh-web-all`) and recorded into `resources/runtime/VERSION.json` at build time.

## Security model

- The dsh host binds loopback only (`127.0.0.1`); `--host 0.0.0.0` is rejected by the host itself.
- The window has no Node integration and a sandboxed preload; navigation is restricted to loopback (and the local splash/error pages), external links open in the system browser.
- The bundled Node distributions are verified against the release SHASUMS256.txt at build time.
- The app only ever writes under `$DSH_HOME` it resolved at startup, the Electron `logs` directory, and its own install location.

## Known limitations

- **Unsigned builds**: macOS shows the Gatekeeper warning on first open (right-click → Open, or `xattr -dr com.apple.quarantine`); Windows shows SmartScreen (More info → Run anyway). Signing and notarization are a planned follow-up.
- **In-app plugin installs that shell out to pnpm** (for example `dsh plugin add` flows) do not work in the bundled environment; Workshop skin/asset installs are plain file copies and do work.
- **Remote tunnel (`dsh-remote-web-ui`)**: the `cloudflared` binary is fetched for the build machine's platform only, so tunneling works out of the box on macOS arm64 and is fetched on demand elsewhere.
- **Windows arm64 and Linux** are not built; the runtime layout already covers adding them.
- First launch on a fresh machine spends a few seconds copying the preinstalled profile into `~/.dsh` (one-time).
- **Two hosts on one `~/.dsh`**: with the desktop app and your own `dsh web` running at the same time, two dsh host processes share the data home. This coexistence is the designed mode — the desktop app never reads or drives your instance; the two GUIs simply keep separate sessions.
