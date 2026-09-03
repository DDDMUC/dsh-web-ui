# Agent Note: remove dsh-desktop-launcher

Status: implemented

Completes the desktop-story consolidation started by [the Electron desktop app](../architecture/2026-09-03-electron-desktop-app.md): the app skeleton is verified live, so the plugin whose job it takes over is no longer worth its cross-package maintenance load. Supersedes the plugin's own fix records ([working directory](../bug-fix/2026-08-25-desktop-launcher-working-directory.md), [browser launch](../bug-fix/2026-08-29-desktop-launcher-browser-launch.md)); their decisions describe a package that no longer exists.

## Problem

The family shipped two desktop stories: the desktop-launcher plugin (a desktop icon that starts an already-installed `dsh web`, plus a floating power button that exits the host) and the Electron desktop app that bundles the whole runtime. The plugin's premise — "an installed dsh toolchain exists" — is the app's premise inverted, and the Electron note originally kept both with the plugin as the lightweight path. Every cross-cutting change paid for that duplication: the plugin held a settings-bridge allowlist entry, a remote-channel local-only control plane, a central ru language-pack namespace, i18n-audit and sync-shared consumer rows, an aggregate patch row, and a family subpath export.

## Decision

dsh-desktop-launcher is removed completely: the package directory; its aggregate manifest rows with all regenerated outputs (patch block, family subpath export, workspace dependency — the generator's keep-unknown-deps rule means the dependency line is deleted by hand; client-children mount entry); the settings-bridge allowlist entries; the remote-channel local-only control plane (the `/api/dsh-desktop-launcher` prefix constant, the boot-script gate, the client rewrite exclusion, and their tests — three control planes remain); the central ru namespace; the i18n-audit package row and sync-shared consumer/target entries; the labeler path, the publish-prep row, and the root README entries.

The npm name is retired, not unpublished: `@linxin666/dsh-desktop-launcher@0.3.13` stays on npm, the npm-badge family total keeps counting it (published-name convention, as with live-stats and aionui), and the desktop app's runtime seed still pins the 0.3.13 aggregate whose dependency closure includes the launcher — it drops out naturally at the next aggregate bump. The Electron desktop app is the desktop path going forward.

## Alternatives considered

- Keep the plugin default-off as the lightweight path for existing installs (the Electron note's original stance): rejected — carrying both doubles every cross-plugin touch (settings bridge, remote gate, i18n parity, sync-shared), and "installed toolchain" users can type `dsh web` without a settings card.
- Keep the remote-channel local-only prefix as defense-in-depth for a future re-add: rejected — a live gate documenting a nonexistent surface misleads security review; a re-add brings its own gate and tests.

## Consequences

Users lose the desktop-icon generator and the floating power button until the desktop app ships; icons already created keep working unchanged, because the generated scripts under `$DSH_HOME/desktop-launcher/` shell out to `dsh` directly and never call the plugin at runtime. The remote channel's local-only surface shrinks to three control planes. Bundle-layer change: takes effect after the user restarts `dsh web`; a stale resolver-only profile dependency, if any, mounts nothing without a patch row and is pruned by the next profile heal.

## Testing

`node scripts/aggregate.mjs` regenerated the patch (19 source blocks, 20 rows, 18 deps) and `--check` passes; `pnpm install` pruned the workspace importer from pnpm-lock.yaml and the rebuilt `packages/dsh-web-all/lib` is launcher-free; repo `pnpm typecheck`, `pnpm test`, `pnpm test:scripts`, `pnpm docs:check`, `pnpm i18n:check`, and `pnpm aggregate:check` pass. Remaining mentions are intentional: this note and its cross-links, the Electron note's history, the older plugin fix notes, frozen `docs/archive/` and release notes, the npm-badge published-name list, and the desktop runtime seed/lockfile pinned at the published 0.3.13 aggregate.
