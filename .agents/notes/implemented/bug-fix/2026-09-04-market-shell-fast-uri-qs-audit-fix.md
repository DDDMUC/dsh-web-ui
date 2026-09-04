# Agent Note: market shell fast-uri and qs security bumps

Status: implemented

## Problem

The default branch carried six open Dependabot alerts, all in `market/shell/package-lock.json`: four high-severity advisories against `fast-uri` (< 3.1.6, reached via ajv under the MCP SDK) and two moderate advisories against `qs` (<= 6.15.3, reached via express under body-parser). Both vulnerable versions are transitives of the try-on shell's vendored `@deepseek-ai/dsh@0.1.1-rc.2` closure, which pins every face exactly.

## Decision

Pin the patched versions exactly, matching the shell's exact-pin style, via a new `overrides` block in `market/shell/package.json` (`fast-uri: 3.1.6`, `qs: 6.16.0`), then refresh the lockfile with `npm install --package-lock-only --legacy-peer-deps` (6-line diff) and sync the physical tree with the same flag.

The load-bearing discovery: **strict npm resolution fails silently on this tree**. `npm install`, `npm audit fix`, and `--package-lock-only` all exit 1 with zero diagnostics across npm 10, 11.11, and Node 24/25 — the debug log just stops mid idealTree. Calling `Arborist#buildIdealTree` directly surfaces the swallowed error: `failPeerConflict` ("could not resolve") from a pre-existing peer shape that has nothing to do with the two bumped packages. The shell lockfile has evidently always been maintained under `--legacy-peer-deps` semantics; any future lockfile refresh on this project must pass that flag.

Neither package reaches the browser bundle: the shell rebuild produced byte-identical `tryon/` assets, `scripts/market-build` rewrote only the `generated` date stamps across `manifest.js` and the three manifest JSON files, and `market:check` passes.

## Testing

- `npm ls fast-uri qs` shows `fast-uri@3.1.6` and `qs@6.16.0` (both "overridden") with no invalid edges.
- `npm audit --legacy-peer-deps` reports 0 vulnerabilities (the audit endpoint itself flakes through the local TUN proxy; retry on "endpoint returned an error").
- `npm run build` in `market/shell` exits 0; `node scripts/market-build` + `pnpm market:check` green with only date-stamp drift.

## Consequences

- The Dependabot alerts clear after GitHub re-scans the default branch.
- The overrides block is the standing security floor; future upgrades of the vendored `0.1.1-rc.2` closure (a separate decision) should re-check it.
- Operational rule: shell lockfile work requires `--legacy-peer-deps`; strict mode is a silent landmine on this tree.
