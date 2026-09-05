# Agent Note: family row-state route for #1372 UI gating

Status: proposed

## Problem

Disabling a family row of the aggregate (`web-ui-market`, `web-ui-plugin-manager`, ...) removes only the host half: the loader never starts that entry, so the row's backend channels vanish, while the aggregate client bundle still registers the row's settings tab unconditionally. The tab stays and errors on click — the #1372 complaint. The first fix attempt (v0.3.15) gated mounting on `__DSH_BOOT__.entries` and was reverted the next day ([aggregate child mount boot wire shape](../../implemented/bug-fix/2026-09-05-aggregate-child-mount-boot-wire-shape.md)): boot entries carry served-bundle package ids only and cannot express per-row state. The revert restored service but left #1372 unfixed: disabled rows keep a visible UI entry.

## Proposal

Give the aggregate's browser half an authoritative, self-hosted answer to "which family rows are active", served by the aggregate's own host half over the same plugin-route idiom every family plugin already uses (same-origin fetch to a `webServer.register` route, like task-board's `HttpTaskBoardHostTransport`).

Host half (`packages/dsh-web-all/src/shell.ts` + a new `rows.ts` ledger):

- The shell already runs once per family row and knows the row's child package name (`config.plugin`, e.g. `@linxin666/dsh-client-ui-market` — the same name space as the client children). On each shell apply, record that name in a module-level active-rows ledger; on entry dispose, remove it (`ctx.effect`, the degraded-route ref-count pattern). Record at apply start, not after a successful start: a row that is enabled but degraded keeps its tab (honest state), only a disabled row loses it.
- The self row (`web-ui-compat`, config-less) additionally owns route registration, so the route survives even when every family row is disabled. Registration stays ref-counted and shared with the existing degraded route's singleton discipline.
- New route `GET /api/dsh-web-all/rows` answers `{ ok: true, children: ["@linxin666/dsh-client-ui-market", ...] }` — the active child package names. No fence beyond platform defaults, matching every existing family `/api` route; the payload exposes nothing beyond names already public in the shipped bundle.

Browser half (`mount-children.ts`):

- Before mounting, fetch the route with a short timeout and defensive shape checks. Any uncertainty — network error, non-200, unexpected shape, timeout, route absent (older host half) — yields "unknown" and the gate FAILS OPEN: every family child mounts, which is exactly today's hotfix behavior. The gate may only hide a child when the route answered with a well-formed active set that lacks that child's name.
- Double-mount guard unchanged: a child whose own package id appears in `__DSH_BOOT__.entries` is still skipped first (standalone installs win).
- `mountClientChildren` becomes async; the client `apply` awaits it. Tabs register a few dozen milliseconds later; no other ordering dependency exists.

Consistency gate: a test asserts that every aggregate patch row's `config.plugin` for family rows is a known client-child name, so adding a family can never silently break the join between the row config and the client ledger keys.

## Context & Efficiency Impact

One extra same-origin GET per page load (a few hundred bytes, `no-store`), one in-memory Map on the host, roughly 100 lines across shell/client plus tests. No schema, protocol, or on-disk format changes; the route is additive and version-skew-safe (a 404 degrades to fail-open).

## Desktop shell

The desktop app is an Electron window over the same origin: `desktop/src/main.cjs` spawns the plain `dsh web` host on a dedicated loopback port and `loadURL`s the token URL at `http://127.0.0.1:<port>/`, so the page, the index-tap boot payload, and same-origin `fetch` behave exactly as in a browser. `preload.cjs` only exposes a `desktop` bridge and touches no page globals, and the navigation guard allows loopback http(s), which covers the route. The desktop profile installs the aggregate through the normal plugin paths, so the ledger/route and the gating apply unchanged; the desktop-bundled host cohort needs no new host feature (the shell already registers routes), and the fail-open rule absorbs any cohort skew. The splash flow waits for GUI readiness before any page load, so the async fetch never races host startup.

## Alternatives considered

- Query the host `loader` service (`inject: ['loader']`, read `entry.options.id`/`options.name`/`entry.disabled`): the most authoritative signal (evaluates `!!js` disabled expressions and ancestor inheritance), but it couples the plugin to host loader internals and buys nothing over the ledger — the loader only starts enabled rows, so an absent shell apply already means disabled, whatever the reason.
- Reuse the official plugin-inventory UI's data source: it is host-internal, versioned with the host, and not a published plugin contract; same coupling objection.
- Mount-then-prune (mount everything, unregister tabs after the fetch): slot and side-effect teardown is unreliable across every family UI; a visible-then-vanishing tab is worse than a slightly deferred mount.
- Server-side pruning (serve per-row client bundles): re-architects the single-bundle aggregate; rejected before in [#1372 discussion](../../implemented/bug-fix/2026-09-04-multi-issue-landing-1368-1370-1372-1359.md) for performance and structure.

## Acceptance criteria

- Disabling any single family row and reloading the GUI removes that row's settings entry; all other family entries stay; re-enabling restores it.
- With the route unreachable, erroring, or shape-broken, every family child mounts (bit-identical to the post-revert hotfix behavior) — the v0.3.15 hide-everything failure cannot recur by construction.
- Standalone+aggregate mixed installs still double-mount-guard through boot entries, independent of row state.
- Package and repository gates pass; live GUI QA exercises disable/enable on a real profile with screenshots.

## Risks

- Residual edge: compat row AND every family row disabled leaves no route owner; the client fails open and shows error tabs for the disabled rows (the pre-0.3.15 behavior for a fully-dismantled aggregate). Accepted; documented.
- The route is unauthenticated like all plugin `/api` routes (index/gateway auth does not cover named routes); it discloses only active family child names. Accepted as platform parity; revisit if the platform adds route-level auth.
- A row toggled while a page stays open is reflected only after the loader's plugin-change reload; acceptable (same freshness model as the degraded route).
