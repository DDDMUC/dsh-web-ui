# @linxin666/dsh-client-ui-plugin-manager

English | [中文](README.zh.md)

Plugin manager tab for the dsh web GUI Plugins settings section: installs plugins from npm or git, lists installed plugins with next-start enable switches, surfaces install-time conflict actions with undo, and hands failures off to repair conversations.

## What it does

- Registers a `Plugin manager` tab in the official Plugins settings section (the `settings.plugins.tab` slot, order 20), next to the official installer tab.
- Dual-channel transport: on runtimes with the official installer services (DSHCode and the 1.0.4 checkout web), every operation rides the official `/plugin-installer` and `/plugin-control` loopback RPC channels; on the npm-published web runtime those channels do not exist, so the package's host half mounts a loopback-fenced HTTP gateway that spawns the official `dsh plugin` CLI for installs/removals (the single writer) and writes `disabled` override rows for enablement.
- Installs plugins from an npm package name or a git repository URL, with progress.
- Lists installed user plugins with next-start enable switches, update checks (registry, npm sources), updates, and uninstall.
- Shows the built-in product switches when the official plugin-control surface exists.
- Surfaces install-time conflict actions: the product-snapshot diff around each install (official mode) or the profile layer diff around each CLI run (gateway mode), with undo for reversible actions and an `Ask the agent to fix` handoff on every conflict row.
- Protects the next boot on the npm runtime: after each install the gateway composes the profile with the CLI's `--dump-config` preflight, and detects duplicate entry-id claims; a failing or duplicate install is disabled automatically so the next start cannot fail, with the error and repair handoff on the error row.
- Renders the boot-failure ring per plugin with `Ask the agent to fix` (a repair conversation over the plugin install root) and `Copy error`; the npm web runtime keeps no failure ring, so only install errors offer the repair handoff there.
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

The tab carries no configuration namespace. Enablement switches and installs apply at the next restart.

## Known limitations

- Loopback-only: on a LAN or remote browser the tab renders a local-only notice (the same boundary the official installer tab enforces; the gateway refuses non-loopback requests with 403).
- On the npm-published web runtime, gateway writes go through the official CLI, so the `dsh` binary must be on the host process PATH; installs of git sources can take minutes and run as background jobs.
- On the npm-published web runtime there is no boot-failure ring and no safe mode: those surfaces degrade to empty, and only install errors offer the repair handoff.
- Enablement on the npm runtime writes bare `disabled` override rows into the profile's cordis.patch.yml; the runtime's loader honors them at the next start, but this path is less exercised than the official desktop writer's.
- The web build has no in-place restart: changes apply at the next manual restart.
- Install-time conflict detection reports what the install actually changed (product rows in official mode, profile rows and bundle entries in gateway mode). On the npm runtime, duplicate insert-id claims are detected after install and the new plugin is disabled automatically; on official runtimes the host's own rules and the boot-failure ring own that case.
- The npm runtime's boot preflight (`--dump-config`) catches composition failures such as packages published without their lib build artifacts; runtime apply failures still surface only at the next real start, where official runtimes keep the failure ring and the npm runtime does not.
- The wire shapes mirror the official installer tab protocol; on drift the tolerant parsers degrade to error rows rather than misbehaving.
- The repair conversation's workspace keeps its path-derived default title.

## License

BSD-3-Clause.
