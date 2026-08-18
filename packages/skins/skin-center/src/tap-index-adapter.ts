/**
 * tapIndex adapter (issue #506, contract section 8) — the ONLY module in the
 * repo that calls webServer.tapIndex for skin purposes. All tapIndex usage
 * converges here so an upstream semantic change has exactly one fail-closed
 * off switch.
 *
 * What it does on every index.html response:
 *  1. stamps html[data-dsh-skin="<id>"] for the persisted active skin;
 *  2. inserts render-blocking <link> tags for the transformed stylesheet
 *     (and patches, when declared) so first paint is already skinned
 *     (anti-FOUC; mirrors the official boot-theme precedent).
 *
 * Fail-closed: any problem (no active skin, unknown id, invalid manifest,
 * malformed html) yields the unmodified document — the stock look — plus at
 * most one warning per process per reason. The tap never throws.
 * @module @linxin666/dsh-client-ui-skin-center/tap-index-adapter
 */

import { findSkin, loadSkinCatalog } from './skin-repo.ts'
import type { SkinCatalog } from './skin-repo.ts'
import { SKIN_CENTER_V2_PREFIX } from './routes-v2.ts'

export interface SkinIndexTapDeps {
  readActiveId: () => string | null
  loadCatalog?: () => SkinCatalog
  /** Defaults to console.warn; tests inject a collector. */
  warn?: (message: string) => void
}

const HTML_TAG = /<html(\s[^>]*)?>/i
const HEAD_CLOSE = /<\/head>/i

/** Stamp or replace data-dsh-skin on the <html> tag. */
export function stampSkinAttribute(html: string, skinId: string): string {
  return html.replace(HTML_TAG, (match, attrs: string | undefined) => {
    const rest = attrs ?? ''
    if (/\sdata-dsh-skin=/.test(rest)) {
      return match.replace(/\sdata-dsh-skin=("[^"]*"|'[^']*'|[^\s>]+)/, ` data-dsh-skin="${skinId}"`)
    }
    return `<html${rest} data-dsh-skin="${skinId}">`
  })
}

/** Build the link tags injected before </head>. */
export function skinLinkTags(skinId: string, hasPatches: boolean): string {
  const base = `${SKIN_CENTER_V2_PREFIX}/skins/${skinId}`
  const links = [
    `<link rel="stylesheet" href="${base}/stylesheet" data-dsh-skin-link="stylesheet">`,
  ]
  if (hasPatches) {
    links.push(`<link rel="stylesheet" href="${base}/patches" data-dsh-skin-link="patches">`)
  }
  return links.join('')
}

/**
 * Create the index.html tap. Pure html→html, safe to register with
 * webServer.tapIndex; never throws.
 */
export function makeSkinIndexTap(deps: SkinIndexTapDeps): (html: string) => string {
  const loadCatalog = deps.loadCatalog ?? (() => loadSkinCatalog())
  const warn = deps.warn ?? ((message: string) => console.warn(`[skin-center] ${message}`))
  const warned = new Set<string>()
  const warnOnce = (reason: string, message: string) => {
    if (warned.has(reason)) return
    warned.add(reason)
    warn(message)
  }

  return (html: string): string => {
    try {
      const active = deps.readActiveId()
      if (!active) return html
      const catalog = loadCatalog()
      const entry = findSkin(catalog, active)
      if (!entry) {
        warnOnce(`missing:${active}`, `active skin "${active}" not in catalog; serving stock look`)
        return html
      }
      if (!HTML_TAG.test(html) || !HEAD_CLOSE.test(html)) {
        warnOnce('malformed-html', 'index.html has no <html>/</head> anchors; skipping skin injection')
        return html
      }
      const links = skinLinkTags(active, entry.manifest.contributes.patches !== undefined)
      return stampSkinAttribute(html, active).replace(HEAD_CLOSE, `${links}</head>`)
    } catch (error) {
      warnOnce('tap-error', `skin index tap failed closed: ${(error as Error)?.message ?? error}`)
      return html
    }
  }
}
