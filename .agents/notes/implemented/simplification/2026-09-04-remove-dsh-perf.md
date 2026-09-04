# Agent Note: remove dsh-perf

Status: implemented

Removes the built-in performance-observation plugin entirely, following the same pattern as the [dsh-aionui-panel removal](2026-08-28-remove-dsh-aionui-panel.md): the aggregate row, the stale workspace dependency, and every reference go, and the package directory is deleted.

## Problem

dsh-perf shipped a host metrics API (loopback-fenced `/api/dsh-perf/stats`), a client HUD, a render-degrade pipeline over `sessions.list`, and a settings card. Its tuning row was the only sanctioned patcher of the `session-persistence-jsonl` harness entry, and it carried special cases in three build scripts (`aggregate.mjs` patch-ordering comment, `sync-shared.mjs` pre-0.1.2 settings-form exception, `i18n-audit.mjs` package row). With the plugin retired, keeping the code, its dictionary namespace, its CI labeler rule, and its issue-template option alive meant maintaining dead surface area across the whole family surface: the aggregate, the lockfiles, the desktop runtime payload, the ru language pack, the market badge allowlist, and the README feature list.

## Decision

The dsh-perf package is removed completely:

- The `packages/dsh-perf` directory (including its `docs/dsh-perf-optimization-report.md`) is deleted, and its rows leave the dsh-web-all `aggregate.yml` `patchFrom` and `deps` lists. `node scripts/aggregate.mjs` regenerates the patch (the `web-ui-dsh-perf` insert row and the `session-persistence-jsonl` tuning patch disappear), and the generator's keep-unknown-deps rule is overridden by hand so the stale `@linxin666/dsh-perf` workspace dependency leaves `packages/dsh-web-all/package.json` (the same manual step the aionui removal recorded).
- `scripts/aggregate.mjs` loses the dsh-perf/better-session patch-ordering comment (the mechanism stays; only the now-nonexistent example goes), and `scripts/aggregate.test.mjs` flips its assertion: the aggregate patch must NOT contain `@linxin666/dsh-perf` instead of asserting the tuning row is the one permitted `session-persistence-jsonl` patcher.
- `scripts/sync-shared.mjs` drops the `SETTINGS_CARD_ONLY_CONSUMERS` list and the lowercase `plugin-settings-card.tsx` copy target; the settings trio consumers are one uniform list again.
- `scripts/i18n-audit.mjs` drops the dsh-perf locale audit row; `packages/dsh-i18n` deletes `src/client/ru/perf.ts`, unregisters the `dsh-perf` namespace, and updates its README namespace table and tests (14 namespaces now).
- Gating and metadata: `.github/labeler.yml` loses `area/perf`, the issue templates lose the `性能监控 (dsh-perf)` option, `.gitignore` drops `packages/dsh-perf/lib/`, and `market/worker/src/npm-badge.js` keeps `@linxin666/dsh-perf` in `FAMILY_PACKAGES` — the badge aggregates downloads of already-published package names, and the npm package stays published on the registry, so removing it would silently shrink the reported total.
- Documentation: the root README pair loses the Performance Engine feature section and tagline item (pair hashes re-recorded), and the dsh-i18n README pair loses its table row.
- Desktop runtime: `desktop/runtime/profile-web/pnpm-workspace.yaml` and its lockfile drop the `@linxin666/dsh-perf@0.3.14` release-age exclude and lock entries; the staged `desktop/resources/runtime/` payload copies are refreshed in the same change (`build-runtime.mjs` is unaffected — it installs from the published `@linxin666/dsh-web-all`, which only stops depending on dsh-perf at its next publish).
- Comment-level references that describe live behavior remain: `packages/dsh-usage/src/host/routes.ts` (loopback fence design lineage), `packages/dsh-session-archive/src/host/session-files.ts` (the session-rdb fingerprint contract the deleted plugin originated), `docs/dsh-sleeping-tabs-research.md` (research doc), frozen release notes and archived notes.

## Alternatives considered

- Keeping the package installable but out of the aggregate: rejected — the plugin's only surfaces were its settings card and HUD, both driven by the aggregate client child wiring; an orphaned package would keep every maintenance cost (build preset, i18n audit row, ru dictionary, release prep) with no user reachable from a default install.
- Keeping the `session-persistence-jsonl` tuning row (moving it to a surviving package or the aggregate itself): rejected — the tuning values (write-batch delay, prepared cache size) were dsh-perf's governance knobs, not neutral defaults; reverting to the stock harness row is the honest removal, and the aggregate test now asserts dsh-perf never reappears.

## Consequences

Every install loses the performance HUD, the attribution scoreboard, render degrade, and the write-batch tuning — the stock `session-persistence-jsonl` harness row serves sessions with its own defaults. The ru language pack covers 14 namespaces instead of 15. The npm badge total is unchanged. Already-published dsh-web-all versions still depend on `@linxin666/dsh-perf` from the registry; desktop payloads pinned to those versions keep working until re-staged. Users who mounted dsh-perf standalone keep whatever they installed, but the package receives no further releases.

## Testing

`node scripts/aggregate.mjs --check` passes (18 rows, 17 deps, 14 client children); `pnpm install` pruned the workspace importer from `pnpm-lock.yaml` (86 lines) and the desktop runtime lockfile passes `pnpm install --lockfile-only` policy checks; `pnpm build` regenerates `packages/dsh-web-all/lib/client.js` with zero dsh-perf regions; `pnpm typecheck`, `pnpm test`, `pnpm test:scripts`, `pnpm docs:check`, `pnpm i18n:check`, `pnpm aggregate:check`, and `pnpm market:check` all pass. Residual mentions are intentional: this note's cross-links and comment-level references listed above, frozen release notes and archives, the market badge allowlist, and the re-creation guard in `aggregate.test.mjs`.