# Agent Note: Workshop editor-picks category

Status: implemented

## Problem

The Workshop store card (`packages/dsh-market`) presented its catalog as four mutually exclusive kind tabs — skins / pets / plugins / presets. Everything a user could see was either the full catalog or a search-and-filter reduction of it, so there was no editorial surface that names a small, fixed set of recommendations spanning kinds. The maintainer asked for a 编辑推荐 (Editor's Picks) category that only ever shows a curated selection of skins, pets and community plugins, seeded for the first release from the maintainer's own locally active skin and pet plus the community plugins installed from the Workshop.

## Decision

The store card gains a leading 编辑推荐 tab backed by a new published manifest.

- Source of truth: `market/editor-picks.json` — a hand-authored, ordered list of `{ kind, id }` references restricted to `skin` / `pet` / `plugin`. Presets are deliberately out of scope.
- `scripts/market-build` reads that file, verifies every reference resolves inside the catalogs it just scanned and that no reference repeats, and emits `market/dist/manifest/editor-picks.json` in the same `{ generated, items }` shape as the other manifests. A dangling pick fails the build instead of quietly emptying the category.
- The card fetches `manifest/editor-picks.json` alongside the catalogs. The fetch is non-fatal: an older deployment leaves the tab on its `picks.empty` message instead of failing the whole catalog. Each reference is resolved against the loaded catalog, the manifest order is preserved, and references that repeat, name an unsupported kind or resolve to nothing are dropped.
- The tab renders mixed kinds. It carries no search box and no category/subcategory chip row, and each card keeps the affordances of its own kind (skin and pet install buttons and preview links, the plugin install command plus one-click install, likes, repository links). Kind-specific rendering was already entry-driven, so the change moved the card render path from the selected tab's kind to the entry's kind and keyed cards by `kind:id`.
- The tab count shows the number of resolved picks, so a deployment whose manifest references nothing still reads as empty rather than as a catalog size.

First-release content: skin `orca-link` (the maintainer's active skin), pet `jyn` (the active pet), and the four catalog community plugins installed in the maintainer's running profile — `dsh-annotation`, `dsh-chatgpt-subscription`, `dsh-free-search`, `dsh-llm-verifier`.

Locale keys `tab.picks` and `picks.empty` were added to the card dictionary (zh is the key source, en mirrors it) and mirrored into the central ru pack in `dsh-i18n`.

## Alternatives considered

- Bundle the fixed list into the client bundle: rejected. It forks the single-source-of-truth model every other catalog uses and turns an editorial edit into a plugin release.
- Derive the category at runtime from local state (active skin, active pets, installed plugins): rejected. 编辑推荐 is an editorial selection every user sees, not a per-user view of what happens to be installed; the maintainer's local state was only the seed for the first list.
- Admit presets to the category: rejected. The requested scope is skins, plugins and pets, and presets already own a tab and a contribution slot (`dsh-workshop.panel`).
- Add the same category to the dsh-market.com nav in this change: deferred, not rejected. `manifest/editor-picks.json` is the site's data too, so a site nav category can consume it later; keeping the store card as the only consumer leaves the site's kind-driven browse (探索 / 皮肤 / 宠物 / 插件 / 预设 plus tag and category filters) untouched.
- Give the picks tab search and filter controls like the catalog tabs: rejected. The category is fixed by definition; browsing it would contradict 只固定展示.

## Consequences

- The card's tabs are now 编辑推荐 / 皮肤 / 宠物 / 插件 / 预设; 皮肤 remains the default tab, so an empty or unreachable picks manifest never becomes the landing state.
- `market/editor-picks.json` is now a maintained repository input: every entry must keep resolving in the catalogs, or `scripts/market-build` (and therefore the `market:check` gate) fails.
- The GUI card reads its manifest from the deployed dsh-market.com, so the tab shows its empty state until `market/dist` is deployed; the same deployment-ordering limitation already documented for the plugin subcategory manifest applies.
- A pick is a reference, not a copy: cards always render the catalog record (name, author, description, version, repo, thumbnails), so editorial order and catalog metadata cannot drift apart.

## Testing

- `pnpm --filter @linxin666/dsh-client-ui-market typecheck` and `test` — 82 vitest tests, including three new MarketCard cases: fixed mixed-kind order with no search box or chips, dismissal of duplicate / unsupported-kind / unresolvable references, and the empty state.
- `node scripts/market-build` emits `manifest/editor-picks.json`; `node --test scripts/market-layout.test.mjs scripts/market-build-clean.test.mjs` passes 16/16, including two new clean-checkout rejections (a pick naming a missing asset, a pick outside the skin / pet / plugin kinds) and a layout assertion that the committed manifest mirrors the hand-authored order.
- `pnpm docs:check` and `pnpm i18n:check` (1407 zh keys mirrored in ru).
