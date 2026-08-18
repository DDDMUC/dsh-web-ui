# @linxin666/dsh-skins

English | [中文](README.zh.md)

Retired compatibility carrier (kept for one release cycle): every skin is built into `@linxin666/dsh-client-ui-skin-center`. This package no longer ships skin assets; it only pulls the skin center in as a dependency so users upgrading @linxin666/dsh-skins get it automatically.

## What it is

- **Dependency carrier only**: installing or upgrading this package installs the skin center (`skin-center`), which ships the full built-in skin collection (xp / blue-fantasy / dragon-heir / minecraft / miku / trading / whale-song / harbor / whale-mom / matrix / maid-atelier / mint) as pure asset directories.
- **No build output**: `build.mjs` is an intentional no-op; there is nothing to copy.
- **Removal next cycle**: this package is scheduled for retirement; new installs should use `@linxin666/dsh-client-ui-skin-center` directly (or the family aggregate `@linxin666/dsh-web-ui-all`).

## Install

### From npm (recommended)

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-skin-center
```

### From the repository (development)

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/skins/skin-center
```

Switch skins in the GUI's first-level Skin Center section, or with `dsh-skin use <id>`; only one skin is active at a time.

## Known limitations

- The browser bundle targets the web only, scoped to the dsh web GUI.
- Skins are presentation-only: they mutate the browser DOM and never touch a model request.
- Maid Atelier is licensed separately under CC BY-NC-SA 4.0 and is restricted to non-commercial use; its license and attribution ship inside the skin-center package's skin directory.
