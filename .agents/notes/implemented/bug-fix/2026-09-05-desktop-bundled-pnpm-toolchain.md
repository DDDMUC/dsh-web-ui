# Agent Note: bundled pnpm (and a working npm) in the desktop runtime

Status: implemented

## Problem

The desktop app's bundled runtime shipped Node plus the host and profile payloads, but no pnpm, so in-app plugin flows that shell out to pnpm (`dsh plugin add/remove`) failed with "pnpm not found on PATH" on machines without preinstalled tooling — recorded as a known limitation of [the Electron desktop app](../architecture/2026-09-03-electron-desktop-app.md). The stated product bar is that a computer with no programming environment installed can use the desktop app fully, and plugin management is a core flow (Workshop plugin installs and community-plugin onboarding both go through it).

While wiring pnpm in, verification exposed a second, pre-existing defect: the staged Node distributions' `bin/npm` and `bin/npx` were dangling symlinks into the deleted extraction temp directory, so the bundled npm could never start — the "zero preinstalled tooling" claim was already false for anything that shelled out to npm.

## Decision

**`desktop/scripts/fetch-pnpm.mjs` stages pnpm into every bundled Node distribution.** One pinned version (11.24.0 — the repository toolchain version, so lockfileVersion and workspace settings match what built the staged payloads) is downloaded once from the npm registry, verified against the metadata's `dist.integrity` sha512, extracted, and copied into each of the three staged distributions (`node-mac-arm64`, `node-mac-x64`, `node-win-x64`) in the npm global-install layout that platform's npm would produce: `lib/node_modules/pnpm` plus `bin/` shims on macOS, `node_modules/pnpm` plus root `.cmd` and sh shims on Windows. Shims resolve `pnpm.cjs` through relative paths and `node` through PATH, so they survive electron-builder relocating the distribution. This works with the host's spawn contract: `dsh plugin` spawns pnpm with `shell: true` on Windows (a `.cmd` shim is required and sufficient there) and without a shell on macOS (the sh shim resolves via PATH, which the app prepends with the bundled `bin/`). A `.pnpm-version` marker makes re-runs idempotent, mirroring `fetch-node.mjs`'s `.node-version`.

**`fetch-node.mjs` preserves symlinks verbatim and asserts they stay in-tree.** The official tarballs only carry relative in-tree links (`bin/npm -> ../lib/node_modules/npm/bin/npm-cli.js`), which remain valid after relocation; the previous `fs.cpSync(..., { dereference: true })` rewrote them into absolute paths into the deleted temp dir (observed on Node 25 — `dereference: true` neither dereferences nor preserves the relative target). The staged distributions are now walked after staging (on the skip path too) and any symlink that escapes the distribution root or dangles fails the build.

**The toolchain is asserted and smoke-checked at every layer.** `build-runtime.mjs` requires `npm`/`pnpm` entry points in all three staged payloads (alongside `node`); `after-pack.cjs` requires them inside the packaged app; `desktop-release.yml` gained a smoke step that prepends the staged `node-mac-arm64/bin` to PATH and runs `node --version`, `npm --version`, and `pnpm --version` from the payload itself before installers are built. The Windows payload is presence-checked only — it cannot execute on the macOS runner.

`desktop/README.md` / `README.zh.md` drop the pnpm known-limitation and document the bundled toolchain.

## Testing

- Local re-staging from scratch (`fetch-node.mjs` + `fetch-pnpm.mjs`), then with the staged `node-mac-arm64/bin` first on PATH: `node --version` → v24.20.0, `npm --version` → 11.19.0 (resolves inside the bundled dist, previously homebrew's npm via the dangling link), `pnpm --version` → 11.24.0.
- End-to-end user flow in an isolated temp `DSH_HOME` with the bundled toolchain on PATH: `dsh plugin --profile smoke add @linxin666/dsh-doctor` initialized the profile and completed with exit 0 via bundled pnpm 11.24.0.
- CI: the desktop-release workflow smoke step runs the same three commands against the staged payload on every tag build.

## Alternatives considered

- **Run the bundled npm's `npm install -g pnpm` on the build runner for each target**: exercises npm itself, but only executable for the two macOS targets — the Windows distribution cannot run on the macOS runner, so it would need a second, hand-crafted mechanism anyway; one uniform code path replaced that pair.
- **pnpm standalone executables (`@pnpm/exe` platform packages)**: real `.exe` on Windows is the most spawn-robust form, but each binary is tens of MB heavier than the npm package and the layout gives no npm parity; the host already spawns with `shell: true` on Windows, so the `.cmd` shim is not a liability.
- **Corepack (`corepack enable` + pre-fetched pnpm)**: corepack's cache lives outside the distribution and the first-use download path depends on registry health at runtime; hostile to the offline/zero-setup premise.
- **First-run online install of pnpm**: already rejected for the runtime payload in the parent note for the same reason (first launch must not depend on network or registry health).

## Consequences

- Installers grow by roughly the pnpm package size (about 12 MB) per shipped target; accepted against the hundreds of MB the payloads already carry.
- The pinned pnpm version is a new tracked fact: bumping it means editing `fetch-pnpm.mjs` (it must stay in the pnpm 11 line the repository toolchain and staged lockfiles use).
- In-app `dsh plugin` flows now work with zero preinstalled tooling; the parent note's known limitation is retired, and its consequence recorded there is corrected.
- The shim contract depends on two host facts: the app prepends the bundled Node `bin/` (or root) to the host child's PATH, and the host spawns pnpm with a shell on Windows. If either changes, `fetch-pnpm.mjs`'s layout is the thing to revisit.
