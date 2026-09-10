# Agent Note: Whale-yuan voucher in a Token Bank tab (dsh-usage)

Status: implemented

## Problem

The usage statistics section renders tokens as admin stats — totals, bars, plan windows. Nothing about it is worth sharing: a user who pushed tens of millions of tokens through the official DeepSeek API has no fun artifact to show for it. The owner wanted a playful, shareable proof-of-spend aimed specifically at the official DeepSeek provider (the only family the plugin prices): a banknote-style "鲸元券" whose face value is the tokens actually used, generated from real ledger data and exportable as an image.

## Decision

The section grows a third tab, Token 银行, next to 用量 and 个人套餐.

### Data path

The overview document carries a new optional `usage.all` window: the whole retained ledger (every day still under `retainDays`, today included) aggregated per provider with the same `summarizeDays` fold the trend uses. It is optional in the wire type, so an older host document degrades the tab to the 30-day `range` window instead of breaking it. The card sums the DeepSeek official family rows (`deepseek` alias plus `deepseek-official` live route, the same family test as the spend estimate); other providers never mint. Zero family tokens renders the empty state, not a zero-token note.

### Face composition

The artwork (`assets/jingyuan-note.jpg`, a 1400x714 banknote inlined into the bundle as a generated base64 data URL module) is drawn onto a canvas, and the draw stamps three locale-neutral lines into the free band under the 鲸元券 title: the face value (full digits with thousands separators, auto-shrunk until it clears the red seal), a `tokens` caption, and a seal-red serial line `NO.<tokens mod 1e9, zero-padded> <from> - <to>`. No CJK and no dictionary on the canvas: the shared image needs no translation and the i18n audit stays out of the export path. All geometry is proportional to the artwork size, so regenerating the asset at another resolution reflows.

### Sharing

The save button exports the canvas as a PNG download (`dsh-whale-voucher-<to>.png`); the share button appears only when `navigator.canShare` accepts files and hands the same PNG to the native share sheet. Both read the already-drawn canvas; nothing is uploaded anywhere.

## Alternatives considered

- Drawing the whole note in code (SVG/CSS banknote) instead of shipping artwork. Rejected: the charm lives in the owner's artwork; a code-drawn replica is a different, worse thing.
- Serving the artwork from a host route instead of inlining it. Rejected: it adds a binary route, a files-whitelist entry, and aggregate-install path questions for ~200 KB that the bundle carries without a new surface.
- Putting the voucher on the existing usage tab. Rejected by the owner: the tab is already dense; a third tab keeps the toy discoverable and separate from the numbers people check.
- Face value as estimated CNY spend instead of tokens. Rejected: "how many tokens" is the ask, and CNY is already on the usage tab; the card still shows the minted tokens plus the cost estimate line.

## Consequences

- The overview wire document grows one optional field; hosts and clients of different versions interoperate (older host degrades to the fallback window, older client ignores `all`).
- The client bundle grows by the inlined artwork (~300 KB base64); the section decodes it once per page and redraws only while the bank tab is open.
- The face value only ever covers the retained window: days pruned by `retainDays` leave both the trend chart and the note, and the README says so.
- Replacing the artwork is two steps documented in the generated module header (drop a new JPEG into `assets/`, regenerate the data URL module); the draw reflows to the new geometry.

## Testing

- `tests/voucher.spec.ts`: family summation (aliases combined, other providers ignored, cache tokens counted), denomination formatting, deterministic serial.
- `tests/section-card.spec.tsx`: the bank tab's empty state, the minted line from `usage.all`, and the `range` fallback for hosts without the aggregate; the share button stays absent where `navigator.canShare` is missing.
- `tests/usage-service.spec.ts`: the whole-ledger aggregate reaches past the 30-entry trend window and matches the persisted days.
- The face composition is verified visually (headless-Chrome screenshots of the real draw path, including the 42 / 999,999,999 / 1,234,567,890 token extremes); canvas pixels carry no unit test.
