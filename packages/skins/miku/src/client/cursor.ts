/**
 * Miku cursor - the skin's custom pointer: a Hatsune Miku icon (32x32 PNG,
 * first frame of the user's Windows cursor pack "Normal Select.ani" by
 * Moos柚眠, resized and inlined as a data URI so the skin carries no static
 * assets). Firefox 67+ silently rejects custom cursors larger than 32x32, so
 * the icon ships at the maximum portable size.
 *
 * Usage note: this artwork is a fan-made Hatsune Miku depiction by
 * Moos柚眠 (B站 / 米画师), labelled "请勿商用或二改" (no commercial use, no
 * derivative works). It is fine for personal use of this skin; if you
 * publish or distribute the skin, ask the author first or swap in a
 * different cursor image.
 *
 * The cursor is applied to the body while the skin is active and retracted
 * on dispose. It can be turned off through localStorage `dsh.miku.cursor`
 * ("off" disables; any other value or absence keeps it on), matching the
 * other presentation-only overrides.
 */

/** localStorage key for the cursor toggle. */
const LS_CURSOR = 'dsh.miku.cursor'

/** The 32x32 Miku cursor icon (PNG data URI, hotspot at 3,4 - the tip apex). */
const MIKU_CURSOR_URI =
  'data:image/png;base64,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'

/** Read the cursor toggle; defaults to on. */
export function cursorEnabled(): boolean {
  try {
    return window.localStorage.getItem(LS_CURSOR) !== 'off'
  } catch {
    return true
  }
}

/** The inline cursor value and priority, captured for an exact restore. */
export interface CursorSnapshot {
  value: string
  priority: string
}

/**
 * Apply the Miku cursor to the body (when enabled), returning the previous
 * inline cursor value and its priority for restore.
 */
export function applyCursor(body: HTMLElement): CursorSnapshot {
  const previous: CursorSnapshot = {
    value: body.style.getPropertyValue('cursor'),
    priority: body.style.getPropertyPriority('cursor'),
  }
  if (cursorEnabled()) {
    body.style.setProperty('cursor', `url("${MIKU_CURSOR_URI}") 3 4, auto`)
  }
  return previous
}

/** Restore the cursor the skin found on entry (value and priority). */
export function restoreCursor(body: HTMLElement, previous: CursorSnapshot): void {
  if (previous.value === '') {
    body.style.removeProperty('cursor')
  } else {
    body.style.setProperty('cursor', previous.value, previous.priority || undefined)
  }
}