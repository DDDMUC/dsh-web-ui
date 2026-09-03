# Agent Note: dsh-annotation npm package migration

Status: implemented

## Problem

Upstream plugin `dsh-annotation` migrated its npm package from `@omdsh-dev/dsh-annotation` to `@changfenhuang/dsh-annotation` (version 1.4.5). The previous `@omdsh-dev` package was unpublished from npm, causing `npm install` failures with HTTP 404 when users installed the plugin from the Workshop store (issue #1357).

## Decision

1. Update the `npm` field of `dsh-annotation` in `packages/dsh-community-plugins/community.json` to `@changfenhuang/dsh-annotation`.
2. Regenerate the Workshop distribution manifest `market/dist/manifest/plugins.json` via `node scripts/market-build`.

## Testing

- Ran `pnpm --filter @linxin666/dsh-client-ui-community-plugins test`.
- Ran `pnpm market:check` to ensure the manifest is in sync with `community.json`.
- Verified npm metadata for `@changfenhuang/dsh-annotation` resolves cleanly.

## Alternatives considered

- Retain the old package name. Rejected: `@omdsh-dev/dsh-annotation` no longer exists on npm and fails every installation attempt.
- Rely on manual npm installation instructions in documentation. Rejected: the Workshop store provides one-click installation and must carry working package coordinates.

## Consequences

- Workshop users can successfully install `dsh-annotation` with current npm package coordinates.
