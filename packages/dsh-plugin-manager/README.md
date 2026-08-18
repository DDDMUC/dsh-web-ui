# @linxin666/dsh-client-ui-plugin-manager

English | [中文](README.zh.md)

Plugin manager tab for the dsh web GUI Plugins settings section: installs plugins from npm or git through the official host channels, lists installed plugins with next-start enable switches, surfaces install-time conflict actions with undo, and hands failures off to repair conversations.

## What it does

- Registers a `Plugin manager` tab in the official Plugins settings section (the `settings.plugins.tab` slot, order 20), next to the official installer tab.
- Installs plugins from an npm package name or a git repository URL through the official host installer channels; this package performs no profile patch writes of its own (single-writer discipline).
- Lists installed user plugins with next-start enable switches, update checks, updates, and uninstall.
- Shows the built-in product switches (the official plugin-control surface).
- Surfaces install-time conflict actions: it diffs the product snapshot around each install and reports what the conflict rules disabled, with one-click undo.
- Renders the boot-failure ring per plugin with `Ask the agent to fix` (a repair conversation over the plugin install root) and `Copy error`.
- Shows the host's safe-mode banner and the `Restore normal mode` affordance (the web build applies it at the next manual restart).

## Install

### From npm (recommended)

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-plugin-manager
```

### From the repository (development)

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-plugin-manager
```

Restart `dsh web`; the tab appears in the settings page's Plugins section.

## Config

The tab carries no configuration namespace. Every operation runs through the official host channels (`/plugin-installer`, `/plugin-control`, loopback authority), which the web composition already mounts; enablement switches and installs apply at the next restart.

## Known limitations

- Loopback-only: on a LAN or remote browser the tab renders a local-only notice (the same boundary the official installer tab enforces).
- Requires the official Plugins settings section (`ui-settings-plugins`) and the host `plugin-installer` / `plugin-control` rows; on hosts without them the tab shows an error state with no install affordances.
- The web build has no in-place restart: changes apply at the next manual `dsh web` restart, and safe-mode boot is a desktop feature the tab can only read and exit.
- Install-time conflict detection covers the built-in product rules (product snapshot diff). Duplicate insert-id claims between two user plugins carry no at-install signal and surface through the boot-failure ring after the next start.
- The wire shapes mirror the official installer tab protocol; on drift the tolerant parsers degrade to error rows rather than misbehaving.
- The repair conversation's workspace keeps its path-derived default title.

## License

BSD-3-Clause.
