# maid-atelier - Abyssal Maid Atelier

English | [中文](README.zh.md)

A presentation-only DeepSeek Harness Web GUI skin with a two-character workshop backdrop, navy ornamental panels, and responsive sidebar artwork. `apply()` owns the `data-dsh-maid-atelier` scope and every DOM or CSSOM write, and its Cordis effect disposer retracts them without injecting services, emitting events, or touching model requests.

## Features

- Light and dark workshop backdrops with two character layers.
- Navy, porcelain, periwinkle, and muted-gold panel styling.
- Responsive sidebar mascot, ornamental chrome, favicon, and a skin-owned text mark.
- Composer and workspace layouts that adapt without remote assets.
- Artwork embedded in the client bundle as data URIs.

## Install

Install the aggregate package, then select the skin:

```sh
dsh plugin --profile web add @linxin666/dsh-skins
dsh-skin use maid-atelier
```

For repository development, build this package before rebuilding the skin center and aggregate assets.

## Artwork and license

This skin and its embedded artwork are distributed under **CC BY-NC-SA 4.0** and are restricted to non-commercial use. The full license is in [LICENSE](LICENSE), and [NOTICE](NOTICE) records the attribution chain for the whale-girl character derivatives by 上善, zipzip, and Small-tailqwq.

The title bar uses an original `MAID ATELIER` text treatment and does not embed the DeepSeek Harness BrandWordmark vector. The independent upstream project is [Small-tailqwq/dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale).

## Development

```sh
pnpm --filter @linxin666/dsh-client-ui-skin-maid-atelier build
pnpm --filter @linxin666/dsh-client-ui-skin-maid-atelier test
node scripts/skin-center-bundles
node scripts/gallery-build
pnpm --filter @linxin666/dsh-skins build
```

## Known limitations

- The CC BY-NC-SA 4.0 non-commercial restriction applies even when the skin is installed through the aggregate package.
- The skin relies on current DSH Web DOM markers for sidebar, workspace, composer, and title-bar decoration; unsupported shell layouts retain the background and omit unavailable ornaments.
- Large embedded artwork increases the client bundle size.
