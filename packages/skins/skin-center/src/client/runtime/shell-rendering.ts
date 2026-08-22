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

const ACTIVE_VISUAL_SELECTOR = [
  'html[data-dsh-skin]',
  'html[data-dsh-custom-theme]:not([data-dsh-skin])',
  'html[data-dsh-wallpaper-active]',
].join(', ')

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

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    style.remove()
  }
}
