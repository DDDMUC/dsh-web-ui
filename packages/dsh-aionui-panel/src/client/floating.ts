/**
 * Floating expand button geometry (issues #374 / #292): the button is a
 * fixed chrome element docked at the viewport's top-right corner — exactly
 * where the explorer's collapse chevron sits while the panel is open — so
 * the re-expand control replaces the close button in place and the toggle
 * position stays consistent. Its top stays below the Window Controls
 * Overlay titlebar strip when dsh-desktop reports one (issue #292). Every
 * computed position is clamped into the usable range.
 * @module dsh-aionui-panel/client/floating
 */

/** Breathing room above/below the button (px) — matches the chevron's 6px
 * top offset below the titlebar strip, so the docked default and the drag
 * clamp floor share the chevron row. */
export const FLOATING_MARGIN_PX = 6
/** The button's rendered size (kept in sync with tokens.module.css). */
export const FLOATING_BUTTON_HEIGHT_PX = 24
/** Top offset of the explorer's collapse chevron inside its tab bar (px);
 * the floating button docks at the same height so the open button lands
 * exactly where the close button was (kept in sync with the chevron rule
 * in tokens.module.css). */
export const COLLAPSE_CHEVRON_TOP_PX = 6

/** Minimal Window Controls Overlay surface (untyped in older TS DOM libs). */
interface WindowControlsOverlayLike {
  visible: boolean
  getTitlebarAreaRect?: () => { height?: number }
}

/** The WCO titlebar height when visible; 0 in a plain browser tab. */
export function titlebarAreaHeight(): number {
  const wco = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlayLike }).windowControlsOverlay
  if (wco === undefined || !wco.visible || wco.getTitlebarAreaRect === undefined) return 0
  try {
    const rect = wco.getTitlebarAreaRect()
    const height = rect?.height ?? 0
    return height > 0 ? Math.round(height) : 0
  } catch {
    return 0
  }
}

/** Clamp a requested top px into the usable vertical range. */
export function clampFloatingTop(
  top: number,
  viewportHeight: number,
  buttonHeight: number,
  titlebar: number,
): number {
  const min = titlebar + FLOATING_MARGIN_PX
  const max = Math.max(min, viewportHeight - buttonHeight - FLOATING_MARGIN_PX)
  if (!Number.isFinite(top)) return min
  return Math.min(max, Math.max(min, top))
}

/** The default top: aligned with the collapse chevron at the top-right. */
export function topAlignedFloatingTop(viewportHeight: number, buttonHeight: number, titlebar: number): number {
  return clampFloatingTop(
    titlebar + COLLAPSE_CHEVRON_TOP_PX,
    viewportHeight,
    buttonHeight,
    titlebar,
  )
}
