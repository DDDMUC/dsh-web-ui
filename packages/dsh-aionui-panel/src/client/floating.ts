/**
 * Floating expand button geometry (issues #374 / #292): the button is a
 * fixed chrome element on the viewport's right edge. Its vertical position
 * is user-draggable and persisted per browser (like the pet's position); the
 * default is the vertical center of the CONTENT area — below the Window
 * Controls Overlay titlebar strip when dsh-desktop reports one, so the
 * button never lands under the native window buttons (issue #292). Every
 * computed position is clamped into the usable range.
 * @module dsh-aionui-panel/client/floating
 */

/** Storage key of the persisted top offset (px, -1 = never dragged). */
export const KEY_FLOATING_TOP = 'aionui-floating-expand-top'
/** Breathing room above/below the button (px). */
export const FLOATING_MARGIN_PX = 8
/** Drag dead zone: smaller moves keep the pointer-down a click (px). */
export const FLOATING_DRAG_THRESHOLD_PX = 3
/** The button's rendered height (kept in sync with tokens.module.css). */
export const FLOATING_BUTTON_HEIGHT_PX = 64

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

/** The default top: vertical center of the content area below the titlebar. */
export function centeredFloatingTop(viewportHeight: number, buttonHeight: number, titlebar: number): number {
  return clampFloatingTop(
    titlebar + (viewportHeight - titlebar - buttonHeight) / 2,
    viewportHeight,
    buttonHeight,
    titlebar,
  )
}
