# Agent Note: Electron desktop app with a bundled, self-contained dsh runtime

Status: implemented

Superseded in part (2026-09-03, see [desktop separate host on reserved-port-free range](../bug-fix/2026-09-03-desktop-separate-host-reserved-ports.md)): the handoff-on-3080 design and the unqualified free-port pick are gone — the app now always spawns its own host on a dedicated range that never takes 3080/3081.

## Problem

dsh-web ships as a plugin bundle that requires a working dsh installation: Node 22+, the npm-installed `@deepseek-ai/dsh` host, a seeded `~/.dsh`, and the web profile with the plugins installed. That is a developer toolchain, not something a non-technical user can be asked to set up. The [desktop-launcher plugin](../bug-fix/2026-08-29-desktop-launcher-browser-launch.md) only created a desktop shortcut that started an already-installed `dsh web` — it did not remove the environment requirement (the plugin has since been removed completely; see [its removal note](../simplification/2026-09-03-remove-dsh-desktop-launcher.md)). The goal is a desktop app anyone can install and double-click, with zero environment concerns.

## Decision

A new top-level `desktop/` directory (outside the pnpm workspace globs) holds an Electron app built with electron-builder for macOS (dmg/zip, arm64+x64) and Windows (nsis/zip, x64), unsigned for internal distribution.

**Runtime is bundled, never assumed.** The installer carries: an official Node.js distribution per shipped target (sha256-verified at build time, `resources/runtime/node-<os>-<cpu>/`), the pinned `@deepseek-ai/dsh` host with its dependency closure (`runtime/host/`), and a preinstalled web profile whose bundles are `dsh-base` + `dsh-web-app` + `@linxin666/dsh-web-all` (`runtime/profile-web/`). At launch the Electron main process spawns `<bundled node> <bundled host>/lib/bin.js web --no-open --host 127.0.0.1 --port <free>` as a child process, waits for the GUI, and loads the tokenized URL the host prints on stdout (the auth fence issues a per-process token that is exchanged for a signed session cookie inside the app window).

**Multi-platform payload in one install.** Both runtime trees install with pnpm `nodeLinker: hoisted` plus `supportedArchitectures` (darwin/win32 × x64/arm64), so per-platform optional dependencies (sharp, lightningcss) for every shipped target land in one real-file tree with no symlinks — symlink-free is mandatory because installers and `fs.cp` do not preserve pnpm link layouts. `build-runtime.mjs` asserts the staged tree contains no symlinks.

**`~/.dsh` is shared with the CLI, not fenced.** The app resolves DSH_HOME exactly like the host (`$DSH_HOME` else `~/.dsh`). The web profile seeds only when missing; a profile the app seeded carries a `.dsh-desktop-seed.json` marker and is re-seeded when the bundled runtime stamp moves, preserving the user's `cordis.patch.yml` layer; a profile without the marker is user-managed and never touched. The host's own boot-time healing (`$DSH_HOME/profiles/node_modules` fallbacks) keeps the profile's plugin code on the host's `@deepseek-ai/*` module instances, so no cohort duplication exists despite the profile having no `@deepseek-ai/*` copies of its own.

**Handoff, never a second web host.** When a GUI already answers on the default URL, the app opens that URL in the system browser — whose cookie jar already holds the session — and quits, instead of spawning a second web host on the same `$DSH_HOME`. Embedding the running instance is not an option either: the auth fence issues a per-process token this app cannot obtain retroactively, and an Electron window has its own empty cookie jar, so attaching would be a permanent 401. When the app spawns its own host, it owns the child and stops it on quit (POSIX process-group SIGTERM with a 5s SIGKILL fallback, `taskkill /T` on Windows).

## Alternatives considered

- **Run the dsh host inside the Electron main process** (reuse Electron's embedded Node): smaller download, but dsh's process spawning, plugin loader, and file-system assumptions run on Electron's patched Node with `ELECTRON_RUN_AS_NODE`-adjacent quirks; failures would be ours to debug. A bundled official Node keeps the host byte-identical to the npm-installed topology the plugins are tested against.
- **Spawn with `ELECTRON_RUN_AS_NODE=1`** (Electron binary as plain Node child): still a child process, but the Node version is pinned to whatever the Electron release embeds, which did not satisfy the host's `^22.19 || >=24` engine range at the versions considered, and the host would again run on Electron-patched Node.
- **First-run online install** (ship the app small, run `dsh plugin add` on first launch): fails the "install and use" promise offline, makes first launch depend on npm registry health, and pnpm is not present in the bundled runtime.
- **Fence an app-private DSH_HOME** (Application Support): cleaner uninstall, but users who also use the dsh CLI would get two siloed configurations; sharing `~/.dsh` with marker-based ownership gives one source of truth while staying non-destructive.
- **Extend the desktop-launcher plugin** instead of a new app: the plugin's premise is "an installed dsh exists"; the desktop app's premise is the opposite. Superseded 2026-09-03: the plugin is removed completely and this app is the only desktop path (see [the removal note](../simplification/2026-09-03-remove-dsh-desktop-launcher.md)).

## Consequences

- Installers are large (hundreds of MB): Node distributions plus two dependency closures with optional dependencies for four targets. Accepted for internal distribution; pruning (dropping darwin-x64 or unused bundles) is a later optimization only if measured size matters.
- The bundled `cloudflared` fetches its binary for the build machine's platform only, so the remote-tunnel plugin works out of the box on the build platform and on demand elsewhere; recorded in `desktop/README.md` known limitations.
- In-app plugin installs that shell out to pnpm do not work because the bundled runtime carries no pnpm; Workshop asset installs are unaffected.
- Version bumps of the host or the plugin collection are edits to `desktop/runtime/*/package.json` plus `npm run prepare-runtime`; the runtime stamp drives automatic re-seeding on user machines.
- Unsigned builds trigger Gatekeeper/SmartScreen prompts; signing, notarization, and auto-update are follow-ups, deliberately out of scope.

## Testing

- `desktop/tests/runtime.test.mjs` (node --test) covers path resolution, DSH_HOME lookup order, the seed/reseed/leave decision, and patch-layer preservation on reseed.
- Live verification: spawn the staged host against a temporary DSH_HOME and probe the GUI; run the packaged app with an isolated DSH_HOME; confirmed in the delivery report for the change that introduced this note.
