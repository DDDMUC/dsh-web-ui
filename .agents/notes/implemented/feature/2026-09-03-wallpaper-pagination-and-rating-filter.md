# Agent Note: Wallpaper Engine library pagination and content rating filter

Status: implemented

## Problem

In the Skin Center's Wallpaper Engine panel, all wallpapers were rendered in a continuous grid, with a basic "Load More" button (12 items per increment). When a user subscribed to dozens or hundreds of workshop wallpapers:
1. Navigating through large collections was tedious without page-based jumping or clear page indicators.
2. Adult/Mature (R18/NSFW) wallpapers from the Steam Workshop were mixed indiscriminately with general-audience wallpapers in the thumbnail grid, creating a major social embarrassment risk ("防社死").

## Decision

We implemented 24-item-per-page pagination and content rating filtering across the data layer, routes, and UI:

1. **Content Rating Derivation (`we-library.ts`)**:
   - Parse `contentrating` from Wallpaper Engine `project.json` (Everyone -> `g`, Questionable -> `pg13`, Mature -> `r18`).
   - If missing or unparseable, fall back to title keywords (`r-?18|nsfw|18\+` -> `r18`, `pg-?13|r-?16` -> `pg13`, default -> `g`).
   - Expose `rating` through `WallpaperEntry`, `synthesizeMediaEntries`, macOS system wallpaper entries, and `/api/skin-center/we/inventory`.
2. **Filtering and Pagination UI (`WallpaperPanel.tsx` & `skin-center.module.css`)**:
   - Rating filter tablist: defaults to G (all-ages safe mode), with tabs `G`, `PG-13`, and `R18`. The "All" option is deliberately omitted to prevent mixed thumbnail exposure and eliminate social embarrassment risk. Switching filters resets pagination to page 1.
   - Paged grid: Mounts only the current page (24 items per page).
   - Rating Badges: High-visibility red badge for `R18`, yellow for `PG-13`, subtle badge for `G` in thumbnail corner.
   - Pagination bar: Previous/Next buttons, smart page number list with ellipsis for large counts, total pages counter, and a direct page jump input.
3. **i18n Support (`locales.ts`)**:
   - Added `wallpaperRatingAll`, `wallpaperRatingG`, `wallpaperRatingPg13`, `wallpaperRatingR18`, `wallpaperPagePrev`, `wallpaperPageNext`, `wallpaperPageJump`, `wallpaperPageTotal` with strict parity across English and Chinese.

Domain notice: Per repository guidelines, changes in the Wallpaper Engine / renderer domain are notified to domain collaborator Aa728848 (EDDYCRAZY-CC).

## Testing

- `packages/skins/skin-center/tests/we-library.spec.ts`: verified `deriveRating` against declared `contentrating` values and fallback title regexes, and confirmed `readProjectJson` and `scanProjectsRoot` populate `rating`.
- `packages/skins/skin-center/tests/wallpaper-panel.spec.tsx`: verified 24-item-per-page grid slicing, next/prev page buttons, page button clicking, jump input form submission, rating filter switching, and R18 badge rendering.
- Gated checks: `pnpm i18n:check`, `pnpm skin-center:check`, `pnpm typecheck`, `pnpm test` (all 32 test files and 601 tests in skin-center pass).

## Alternatives considered

- Infinite scrolling with continuous thumbnail appending. Rejected: maintains heavy DOM trees with hundreds of video/canvas elements, degrades performance, and does not allow jump navigation.
- Pure client-side title regex matching for ratings. Rejected: Wallpaper Engine official manifests provide `contentrating` in `project.json`, which is the authoritative source; regex is kept strictly as a fallback.

## Consequences

- Users can browse large wallpaper collections with predictable pagination performance.
- Sensitive R18/NSFW wallpapers can be filtered out or easily identified, preventing unintended exposure in shared or workplace settings.
