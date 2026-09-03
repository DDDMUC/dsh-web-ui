# Agent Note: Blue Fantasy skin backdrop-filter GPU performance optimization

Status: implemented

## Problem

When using the Blue Fantasy skin with a background image (e.g. whale-art.jpg) during session task runs with continuous streaming token output, the GPU and CPU load reached over 80% (issue #1358).

This occurred because `packages/skins/skin-center/skins/blue-fantasy/patches.css` attached `backdrop-filter: blur(12px)` to the root viewport container `.aionui-root`. Every incremental token addition in the chat bubbles triggered full-viewport repaint and expensive Gaussian blur resampling over the underlying background wallpaper.

## Decision

1. In `packages/skins/skin-center/skins/blue-fantasy/patches.css`, remove `.aionui-root` from the `backdrop-filter: blur(12px)` rule, keeping the blur only on sidebar columns (`[data-aionui-explorer-col], [data-aionui-preview-col]`).
2. Add `contain: paint` to the sidebar columns so DOM mutations in the primary chat scroll region do not invalidate sidebar layers.
3. Rebuild Workshop distribution assets via `node scripts/market-build`.

## Testing

- Ran `pnpm market:check` to verify regenerated assets in `market/dist/`.
- Ran `pnpm skin-center:check` to ensure skin catalog and hooks registry consistency.
- Ran `pnpm --filter @linxin666/dsh-client-ui-skin-center test` (32 test files, 601 tests passed).

## Alternatives considered

- Removing blur entirely from all elements. Rejected: dialogs and explorer sidebars benefit visually from the frosted-glass style without causing streaming degradation once isolated from the main chat viewport.
- Throttling React DOM streaming updates. Rejected: streaming responsiveness is host-controlled; fixing the overly broad CSS selector resolves the root cause cleanly.

## Consequences

- Streaming tokens in the main chat viewport no longer trigger full-viewport blur resampling against the background art.
- GPU and CPU utilization remain normal during high-throughput agent runs.
