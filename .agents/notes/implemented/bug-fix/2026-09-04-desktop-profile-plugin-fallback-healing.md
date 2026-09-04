# Agent Note: desktop host profile plugin fallback healing and NODE_PATH injection

Status: implemented

## Problem

When users installed third-party plugins (such as `dsh-context`) inside the desktop app, restarting the app caused the host process to fail on boot (`The dsh host process stopped unexpectedly`) until the user ran `dsh web` once from a terminal.

Root cause analysis revealed:
1. Third-party profile plugins often declare peerDependencies (for example `@deepseek-ai/dsh-client-ui-primitives`) without having them flattened under the profile's root `node_modules` because profile package management disables `autoInstallPeers`.
2. The DSH CLI dynamically resolves and links missing peer dependencies into `$DSH_HOME/profiles/web/.dsh-module-fallback/node_modules/` via `healProfilesModuleFallback` during boot.
3. The bundled desktop host runtime (`resources/runtime/host`) operates in an isolated packaged directory tree. In an unassisted cold boot after plugin installation, `healProfilesModuleFallback` could not resolve missing UI peer packages upward from `runtime/host`, throwing module resolution errors during plugin loading and causing the child host process to crash.
4. When the user ran `dsh web` in the terminal, the terminal CLI had access to global and workspace package sources, created the required fallback junctions, and persisted them to disk. Subsequent desktop launches then succeeded only by riding on those pre-created links.

## Decision

1. **Fallback Junction Pre-Healing (`ensureProfileFallbacks`)**:
   - Added `ensureProfileFallbacks(home, hostRuntimeDir)` to `desktop/src/runtime.cjs`.
   - Before spawning the host process during desktop `boot()`, inspect `~/.dsh/profiles/web` packages and declared plugin `peerDependencies`.
   - Automatically create the required intermediate junctions in `.dsh-module-fallback/node_modules` and target junctions in `profiles/web/node_modules` from candidate sources (bundled host node_modules, `$DSH_HOME/profiles/node_modules`, and `%APPDATA%\npm\node_modules`).
2. **`NODE_PATH` Fallback Injection**:
   - Extended `childEnv` in `desktop/src/runtime.cjs` to accept `extraNodePaths` and normalize `NODE_PATH` (including case variants like `Node_Path`).
   - In `desktop/src/main.cjs`, pass the bundled host `node_modules`, `$DSH_HOME/profiles/node_modules`, and global npm `node_modules` through `NODE_PATH` to ensure Node.js module resolution has a guaranteed secondary resolution fallback.

## Testing

- Unit tests (`node --test "tests/*.test.mjs"` in `desktop/`): added test cases for `childEnv` with `NODE_PATH` normalization and `ensureProfileFallbacks` junction creation. All 13 tests pass.
- Live verification: verified that cold-spawning the host with the new runtime logic succeeds immediately (`dsh web: http://127.0.0.1:3082/?token=...`) without terminal CLI pre-runs.
- Packaged asset update: rebuilt and deployed the updated `app.asar` to the local desktop installation.

## Consequences

- Third-party plugins installed within the desktop app boot cleanly upon app restart without requiring terminal intervention.
- The desktop app remains self-sufficient and resilient to peer dependency resolution differences.
