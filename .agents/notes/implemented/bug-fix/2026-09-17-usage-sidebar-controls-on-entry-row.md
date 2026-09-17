# Agent Note: Usage sidebar controls seat on the entry row

Status: implemented

Follows up on [issue batch 1587-1600](2026-09-16-issue-batch-1587-1600-fixes.md): the #1592 sidebar surface it shipped rendered the panel with its own header; this note records the control-layout fix and updates that note's panel facts.

## Problem

The #1592 sidebar usage surface stacked two rows reading 用量: the injected entry row (gauge icon, label) and the panel's own header (title, 刷新, 折叠). It also carried two collapse mechanisms — clicking the entry row hid the whole panel container (unpersisted, lost on reload), while the panel header's 折叠 button collapsed only the body (persisted to localStorage). The duplicated header read as broken UX, and the refresh control vanished whenever the panel header scrolled out of the narrow rail.

## Decision

1. The shared sidebar-entry core (`shared/client/sidebar-entry-core.ts`) gained an optional `actions` array: trailing buttons seated at the row's right edge. A row with actions switches to a composite structure — a container div holding a main button (icon + label, the toggle hit area) plus the action buttons — because nested interactive elements are invalid HTML. A row without actions keeps the classic single-button structure untouched, so dsh-ssh, dsh-task-board, and dsh-skill-explorer render byte-identical rows. Each action carries a stable `data-dsh-entry-action` id, a localized label (aria-label + title), an optional inactive-state icon that turns it into a state mirror (icon swap + aria-expanded on every active-state change), and a click handler that receives the button for transient affordances.
2. dsh-usage seats the panel's controls on the row: a refresh command (circular-arrow glyph, 3 s cooldown shown as a spinning icon) and a collapse chevron (down while expanded, right while collapsed, localized Collapse/Expand label, aria-expanded). The row's main area and the chevron both toggle the panel; clicks on the row padding still toggle, preserving the old edge-to-edge hit area.
3. One open state replaces the two collapse mechanisms. The panel mount owns it: initialized from `localStorage` (`dsh-usage.sidebar.collapsed`, same key), flipped by the row's controls, persisted on every flip, and mirrored to the React body and the entry row through one subscribe/isOpen face. The panel renders only content — the quota/balance body while expanded, the current provider's today strip while collapsed (see [the pet-decoupling note](../simplification/2026-09-17-usage-pet-decoupling-collapsed-summary.md)) — and polls at 10 s expanded, 30 s collapsed, paused while the page is hidden. The old panel header, its local collapsed state, and the `usage.sidebar.title` copy are gone (zh/en/ru dictionaries updated together).

## Alternatives considered

- Keeping the panel header and restyling it. Rejected: two headers for one small surface stays confusing no matter the styling; the controls belong on the row the user already sees.
- Appending the action buttons inside the classic single-button row. Rejected: buttons inside a button are invalid HTML, and the click routing (which button fired) becomes fragile against shell re-renders.
- Forking the entry core inside dsh-usage. Rejected: generated copies drift by design; the conditional composite keeps the sibling packages byte-identical while the API lives in one place.
- Text buttons (刷新/折叠) on the row. Rejected: the sidebar idiom is icon buttons (the workspace header seats search/filter glyphs the same way), and text would crowd a 36 px-high nav row.

## Consequences

- All four synced copies of the entry core carry the actions API; only dsh-usage opts in, so the other three packages' rows, tests, and rail behavior are unchanged.
- The collapsed 56 px rail hides the action buttons (the row renders as the bare gauge icon again), and the row's active highlight plus the chevron now update live: the entry's active bridge previously passed a no-op subscribe, so the highlight only reflected the mount-time state.
- The refresh control is available while the panel is collapsed, and the collapse choice survives a reload from the same single state.
- Environment note: under Node >= 23 the runtime's own flag-less `localStorage` shadows jsdom's Storage in vitest (`getWindowKeys` keeps a pre-existing global), so any spec touching `window.localStorage` breaks locally while CI (Node 22) stays green; `tests/sidebar-panel-mount.spec.ts` installs a standards-shaped in-memory Storage when the real one is absent. CI runs Node 22, so this stays a local-only shim.

## Testing

- `packages/dsh-usage/tests/sidebar-entry.spec.ts`: the row seats both localized controls, refresh forces one probe cycle and cools the button down, chevron and main-area clicks toggle, and the chevron mirrors collapse/expansion (icon, label, aria-expanded).
- `packages/dsh-usage/tests/sidebar-panel-mount.spec.ts`: the collapse choice persists across a remount (same localStorage key), subscribers are notified with the new state, and the container stays seated directly after the entry row.
- `packages/dsh-usage/tests/sidebar-panel.spec.tsx`: rewritten for the content-only body — rendering, empty/error states, the collapsed summary strip, and polling that pauses only while the page is hidden.
- Gates: `pnpm --filter @linxin666/dsh-usage test` and `typecheck`, repository `pnpm typecheck`, `pnpm test:standards` (baseline re-recorded for the pre-existing debt the dev sync brought in), `pnpm i18n:check`, `pnpm emoji:check`, `node scripts/sync-shared.mjs --check`, plus the dsh-web-all rebuild and the lib fingerprint gate.
