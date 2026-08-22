/**
 * Shared shell rendering corrections for every visual mode owned by the skin
 * center (issue #954). The official shell exposes stable slot / composer
 * anchors, while the workspace-list fade itself is still a CSS-module class.
 * Keep that fallback scoped below sidebar.workspaces so an unrelated animation
 * or overlay whose class contains "fade" is never affected.
 *
 * The stylesheet is inert for the stock look: a catalog skin, custom theme or
 * wallpaper must be active. It is installed once per runtime and removed with
 * that runtime, so disabling the plugin restores the shell unchanged.
 * @module @linxin666/dsh-client-ui-skin-center/runtime/shell-rendering
 */

/** Marker owned by the shared shell-rendering stylesheet. */
export const SHELL_RENDERING_STYLE_ATTR = 'data-dsh-shell-rendering'

/** Fallback composer seat height for scrollport bottom clearance (px). */
export const DEFAULT_COMPOSER_CLEARANCE_PX = 100

const ACTIVE_VISUAL_SELECTOR = [
  'html[data-dsh-skin]',
  'html[data-dsh-custom-theme]:not([data-dsh-skin])',
  'html[data-dsh-wallpaper-active]',
].join(', ')

const COMPOSER_SEAT_SELECTORS = [
  '[data-slot="conversation.composer"]',
  '[data-composer-seat]',
  '[data-dsh-surface="composer"]',
]

/** Build the inert-by-default public rendering corrections. */
export function shellRenderingCss(): string {
  const scopes = ACTIVE_VISUAL_SELECTOR.split(', ')
  const scoped = (selector: string): string => scopes.map(scope => `${scope} ${selector}`).join(',\n')
  return `
    ${scoped('[data-slot="sidebar.workspaces"] [class*="_fade"]')} {
      background: none !important;
      background-image: none !important;
    }
    ${scoped('[data-composer-card] textarea[data-phase]::placeholder')},
    ${scoped('textarea[data-dsh-part="composer-input"]::placeholder')} {
      color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-caption)) !important;
      -webkit-text-fill-color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-caption)) !important;
      opacity: 1 !important;
    }
    ${scoped('[data-conversation-scroll]')},
    ${scoped('[data-dsh-part="scrollport"]')} {
      padding-bottom: var(--dsh-composer-height, ${DEFAULT_COMPOSER_CLEARANCE_PX}px) !important;
      scroll-padding-bottom: var(--dsh-composer-height, ${DEFAULT_COMPOSER_CLEARANCE_PX}px) !important;
    }
  `
}

/** Install the shared corrections and return their idempotent teardown. */
export function installShellRenderingAdapter(doc: Document): () => void {
  if (doc.head === null) return () => {}
  const existing = doc.head.querySelector<HTMLStyleElement>(`style[${SHELL_RENDERING_STYLE_ATTR}]`)
  if (existing !== null) return () => {}

  const style = doc.createElement('style')
  style.setAttribute(SHELL_RENDERING_STYLE_ATTR, '')
  style.textContent = shellRenderingCss()
  doc.head.appendChild(style)

  const win = doc.defaultView
  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null
  let observedComposer: Element | null = null

  const syncHeight = (): void => {
    if (doc.body === null) return
    const composer = doc.body.querySelector(COMPOSER_SEAT_SELECTORS.join(', '))
    if (composer !== null) {
      if (observedComposer !== composer) {
        if (observedComposer !== null && resizeObserver !== null) {
          resizeObserver.unobserve(observedComposer)
        }
        observedComposer = composer
        if (resizeObserver !== null) {
          resizeObserver.observe(composer)
        }
      }
      const rect = composer.getBoundingClientRect()
      if (rect.height > 0) {
        doc.documentElement?.style.setProperty('--dsh-composer-height', `${Math.ceil(rect.height)}px`)
      }
    }
  }

  if (win !== null && typeof win.ResizeObserver === 'function') {
    resizeObserver = new win.ResizeObserver(() => syncHeight())
  }

  if (win !== null && typeof win.MutationObserver === 'function' && doc.body !== null) {
    mutationObserver = new win.MutationObserver(() => syncHeight())
    mutationObserver.observe(doc.body, { childList: true, subtree: true })
  }

  syncHeight()

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (resizeObserver !== null) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (mutationObserver !== null) {
      mutationObserver.disconnect()
      mutationObserver = null
    }
    observedComposer = null
    doc.documentElement?.style.removeProperty('--dsh-composer-height')
    style.remove()
  }
}
