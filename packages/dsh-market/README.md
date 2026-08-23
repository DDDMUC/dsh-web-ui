# @linxin666/dsh-client-ui-market

English | [中文](README.zh.md)

Workshop store card for the DSH Web GUI settings page: one first-level Workshop
section that browses [dsh-market.com](https://dsh-market.com) from inside the GUI and installs skins,
pets and plugins locally with one click; installed items are managed by their own settings sections
(Skin Center, Pet, and the plugin manager in the official Plugins section).

## What it does

- Three-category catalog (skins / pets / plugins) with the same ranking used by the Workshop site:
  device-backed likes first (tie-broken by the manifest order), a search box, and per-card preview
  links (skins open the live try-on simulator).
- One-click asset install (loopback browsers): skins download into `$DSH_HOME/skins/<id>/` and pets
  into `$DSH_HOME/pets/<id>/` — the DSH home directories that the Skin Center and the pet registry
  already scan, so no restart is needed (reopen the card to pick them up). Reinstalling an existing
  directory asks for confirmation and replaces it atomically.
- One-click plugin install through the optional `pluginManager` service (provided by
  `@linxin666/dsh-client-ui-plugin-manager`); without it the card degrades to the copy-command index.
- Remote browsers see the read-only catalog: install buttons are hidden, the Workshop site link and
  copy-command fallbacks stay available.

## Install

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-market
```

Restart `dsh web`; the Workshop section appears in the settings page and opens this store card
directly (skins / pets / plugins tabs). The Skin Center, the Pet section and the plugin manager in the
official Plugins section are separate first-level settings entries.

## Config

- Enable switch: the card carries its own master switch in the plugin configuration section (persisted
  in the `dsh-market` settings namespace). Turning it off hides the catalog and keeps the switch only.
- No other configuration; the catalog data always comes from dsh-market.com.

## Known limitations

- Remote (non-loopback) browsers cannot drive installs at all; they get the read-only catalog with
  copy-command fallbacks.
- Asset installs require the Workshop site to be reachable; a manifest or download failure leaves the
  existing asset directory untouched.
- Likes are per-device (the browser stores one anonymous fingerprint); they are not tied to any login.

## Architecture

- The host half (`src/index.ts`) registers the `dsh-market` settings namespace and mounts the
  loopback-only gateway (`/api/market/installed`, `/api/market/install-skin`, `/api/market/install-pet`).
- The installer core (`src/core/installer.ts`) fetches the manifest from `dsh-market.com` itself,
  validates every path against a conservative allowlist, and writes atomically (temp dir then rename),
  so a failed download never leaves a half-written asset directory. The client never supplies URLs or
  file lists.
- Every market asset carries an explicit file list, so a new skin pack ships to installs automatically
  as soon as `scripts/market-build` regenerates `market/dist`.

## Security model

- Install routes answer only loopback requests (the same gate as the plugin manager); remote browsers
  cannot drive them.
- All downloaded content comes from `https://dsh-market.com` (asset URLs are rebuilt from the
  validated manifest); skin CSS is sanitized by the Skin Center runtime before it is applied.
- Plugin installs go through the same confirmation and CLI path as the Plugin manager tab.
