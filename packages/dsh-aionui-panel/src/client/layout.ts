/**
 * The DOM layout controller: extends the web shell's three-column frame
 * (`[data-dsh-frame]`, a grid) with two trailing grid tracks — the preview
 * region and the explorer column — by mirroring the shell's own inline
 * grid-template-columns string and re-appending the two panel tracks on every
 * shell update (MutationObserver, same frame before paint). Also owns the
 * absolute drag handles (12px explorer / 20px preview hit zones), the
 * floating expand button (draggable, position persisted — issue #374; the
 * default center sits below the Window Controls Overlay titlebar — issue
 * #292), the collapse-as-width-0 keep-mounted behavior, and the transient
 * maximize mode (issue #315): while a panel is maximized the target column
 * takes over the whole frame row (or renders as a fixed full-screen overlay
 * on narrow viewports), and Esc / the header button restore the layout.
 *
 * The shell's inline style is the source of truth for the sidebar and details
 * tracks; this controller never guesses their widths. Handles are out-of-flow
 * (absolute), so appending tracks never disturbs the shell's own children.
 *
 * AionUi Layout architecture (Apache-2.0, re-implemented): the explorer
 * column collapses to width 0 while staying mounted; the preview region keeps
 * a 1px left border only (no outer margins — gaps would expose the window
 * background, jarring in dark mode).
 * @module dsh-aionui-panel/client/layout
 */

import { handlePointerDragStart } from './drag.ts'
import {
  DEFAULT_PREVIEW_REGION_PX, DEFAULT_WORKSPACE_PANEL_PX,
  MAX_PREVIEW_REGION_PX, MAX_WORKSPACE_PANEL_PX,
  MIN_PREVIEW_PANEL_PX, MIN_WORKSPACE_PANEL_PX,
  KEY_EXPLORER_WIDTH, KEY_PREVIEW_WIDTH,
  clampExplorerWidth, clampPreviewWidth,
  type MaximizeTarget,
} from './store.ts'
import { writeStoredNumber, readStoredNumber } from './persist.ts'
import { maximizedGridTracks, maximizedOverlay } from './maximize.ts'
import {
  FLOATING_BUTTON_HEIGHT_PX, FLOATING_DRAG_THRESHOLD_PX, KEY_FLOATING_TOP,
  centeredFloatingTop, clampFloatingTop, titlebarAreaHeight,
} from './floating.ts'
import type { LayoutStore } from './store.ts'

/** The frame grid element (portals target it). */
let frameElement: HTMLElement | null = null

/** Read the current frame element (undefined while the shell is not mounted). */
export function getFrameElement(): HTMLElement | null {
  return frameElement
}

/**
 * Locate the frame grid element the two panel columns append into. The web-ui
 * aggregate's compat shim stamps `data-dsh-frame` onto the grid, but a
 * STANDALONE install of this package has no shim (the attribute never
 * appears), so the panel would wait forever and never mount (issue #56). Fall
 * back to the rc.6-native structure: the frame grid is the parent of the
 * sidebar column, exactly the element the shim would stamp.
 */
function findFrame(): HTMLElement | null {
  const stamped = document.querySelector<HTMLElement>('[data-dsh-frame]')
  if (stamped !== null) return stamped
  return document.querySelector<HTMLElement>('[class*="sidebarCol"]')?.parentElement ?? null
}

/**
 * Parse an inline grid-template-columns string into its tracks. Handles
 * "minmax(0, 1fr)" (spaces inside parens must not split). Empty on failure.
 */
export function parseGridTracks(input: string): string[] {
  const tracks: string[] = []
  let depth = 0
  let current = ''
  for (const char of input) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ' ' && depth === 0) {
      if (current !== '') {
        tracks.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current !== '') tracks.push(current)
  return tracks
}

/** Extract a px width from one track (0 for fr/minmax/non-px tracks). */
export function trackPx(track: string): number {
  const match = /^(-?[\d.]+)px$/.exec(track.trim())
  return match === null ? 0 : Number(match[1])
}

/** One drag handle's geometry (hit zone + visual line) — pure CSS in the module. */
export const EXPLORER_HANDLE_WIDTH = 12
export const PREVIEW_HANDLE_WIDTH = 20

/**
 * Drag target width: apply the hard px bounds (the same min/max the handle
 * always enforced), then the store's ordered container-aware clamp so the
 * grid never re-clamps a width the drag showed.
 */
export function dragTargetWidth(
  kind: 'explorer' | 'preview',
  startWidth: number,
  deltaX: number,
  snapshot: { availableWidth: number; previewOpen: boolean; explorerWidth: number },
): number {
  const requested = startWidth + deltaX
  if (kind === 'explorer') {
    const bounded = Math.min(MAX_WORKSPACE_PANEL_PX, Math.max(MIN_WORKSPACE_PANEL_PX, requested))
    return clampExplorerWidth(bounded, snapshot.availableWidth, snapshot.previewOpen)
  }
  const bounded = Math.min(MAX_PREVIEW_REGION_PX, Math.max(MIN_PREVIEW_PANEL_PX, requested))
  return clampPreviewWidth(bounded, snapshot.availableWidth, snapshot.explorerWidth)
}

/** The layout controller: frame sync, handles, floating button, width math. */
export class PanelLayoutController {
  private frame: HTMLElement | null = null
  private previewCol: HTMLDivElement | null = null
  private explorerCol: HTMLDivElement | null = null
  private explorerHandle: HTMLDivElement | null = null
  private previewHandle: HTMLDivElement | null = null
  private floatingButton: HTMLButtonElement | null = null
  private styleObserver: MutationObserver | null = null
  private sizeObserver: ResizeObserver | null = null
  private waitObserver: MutationObserver | null = null
  private frameWidth = 0
  /** The shell's own 3 tracks (sidebar, center, details) — mirror of its inline style. */
  private shellTracks: string[] = []
  private instantTimer: ReturnType<typeof setTimeout> | undefined
  private disposers: Array<() => void> = []
  /** Persisted floating-button top px (-1 = never dragged: use the center). */
  private floatingTop = -1
  /** In-flight vertical drag of the floating button (null = not dragging). */
  private floatingDrag: { startY: number; startTop: number; moved: boolean } | null = null
  /** Swallow exactly one click after a floating-button drag. */
  private suppressFloatingClick = false

  constructor(private readonly layout: LayoutStore) {}

  /** Start watching for the frame and attach once it appears. */
  mount(): void {
    const tryAttach = (): void => {
      if (this.frame !== null) return
      const frame = findFrame()
      if (frame === null) return
      this.attach(frame)
    }
    this.waitObserver = new MutationObserver(() => { tryAttach() })
    this.waitObserver.observe(document.body, { childList: true, subtree: true })
    tryAttach()
  }

  /** Attach to the frame: columns, handles, observers, store subscription. */
  private attach(frame: HTMLElement): void {
    this.frame = frame
    frameElement = frame

    // The two panel columns: trailing grid items (tracks 4 and 5).
    const previewCol = document.createElement('div')
    previewCol.dataset.aionuiPreviewCol = ''
    previewCol.className = 'aionui-preview-col'
    previewCol.style.minWidth = '0'
    previewCol.style.overflow = 'hidden'
    previewCol.style.display = 'flex'
    previewCol.style.flexDirection = 'column'
    previewCol.style.borderLeft = '1px solid var(--aion-bg-3, #e5e6eb)'

    const explorerCol = document.createElement('div')
    explorerCol.dataset.aionuiExplorerCol = ''
    explorerCol.className = 'aionui-explorer-col'
    explorerCol.style.minWidth = '0'
    explorerCol.style.overflow = 'hidden'
    explorerCol.style.display = 'flex'
    explorerCol.style.flexDirection = 'column'
    explorerCol.style.borderLeft = '1px solid var(--aion-bg-3, #e5e6eb)'

    frame.appendChild(previewCol)
    frame.appendChild(explorerCol)
    this.previewCol = previewCol
    this.explorerCol = explorerCol

    // The absolute drag handles (out of the grid flow). Both sit on the left
    // edge of their panel: dragging left widens (reverse).
    this.explorerHandle = this.createHandle('aionui-explorer-handle', EXPLORER_HANDLE_WIDTH, true, 'explorer')
    this.previewHandle = this.createHandle('aionui-preview-handle', PREVIEW_HANDLE_WIDTH, true, 'preview')
    frame.appendChild(this.explorerHandle)
    frame.appendChild(this.previewHandle)

    // The floating expand button (fixed, right edge) — DOM-level, no React.
    // Vertical drag moves and persists the position (issue #374); a plain
    // click still toggles the explorer.
    this.floatingButton = document.createElement('button')
    this.floatingButton.type = 'button'
    this.floatingButton.className = 'aionui-floating-expand'
    this.floatingButton.setAttribute('aria-label', 'Expand explorer')
    this.floatingButton.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>'
    const floatingButton = this.floatingButton
    floatingButton.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.button !== 0) return
      this.floatingDrag = {
        startY: event.clientY,
        startTop: floatingButton.getBoundingClientRect().top,
        moved: false,
      }
      floatingButton.setPointerCapture(event.pointerId)
    })
    floatingButton.addEventListener('pointermove', (event: PointerEvent) => {
      const drag = this.floatingDrag
      if (drag === null) return
      const dy = event.clientY - drag.startY
      if (!drag.moved && Math.abs(dy) < FLOATING_DRAG_THRESHOLD_PX) return
      drag.moved = true
      const top = clampFloatingTop(
        drag.startTop + dy,
        window.innerHeight,
        FLOATING_BUTTON_HEIGHT_PX,
        titlebarAreaHeight(),
      )
      this.floatingTop = Math.round(top)
      floatingButton.style.top = `${this.floatingTop}px`
      floatingButton.style.transform = 'none'
    })
    const endFloatingDrag = (): void => {
      const drag = this.floatingDrag
      if (drag === null) return
      this.floatingDrag = null
      if (!drag.moved) return
      // Persist the clamped position the drag applied (the same value the
      // inline style carries — rect reads are unavailable in jsdom tests).
      writeStoredNumber(KEY_FLOATING_TOP, this.floatingTop)
      // A drag that ends over the button would otherwise fire a click and
      // toggle the panel — swallow exactly that one click.
      this.suppressFloatingClick = true
    }
    floatingButton.addEventListener('pointerup', endFloatingDrag)
    floatingButton.addEventListener('pointercancel', endFloatingDrag)
    floatingButton.addEventListener('click', () => {
      if (this.suppressFloatingClick) {
        this.suppressFloatingClick = false
        return
      }
      this.toggleExplorer()
    })
    document.body.appendChild(floatingButton)
    this.floatingTop = readStoredNumber(KEY_FLOATING_TOP, -1, 1_000_000, -1)

    // Window Controls Overlay (dsh-desktop, issue #292): re-position when
    // the titlebar area changes (button must stay below the window buttons).
    const overlay = (navigator as Navigator & { windowControlsOverlay?: EventTarget }).windowControlsOverlay
    if (overlay !== undefined) {
      const onGeometryChange = (): void => { this.positionFloatingButton() }
      overlay.addEventListener('geometrychange', onGeometryChange)
      this.disposers.push(() => overlay.removeEventListener('geometrychange', onGeometryChange))
    }

    // Esc restores a maximized panel (issue #315). Editing surfaces own Esc:
    // while an input/textarea/contenteditable is focused, leave it alone.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const target = event.target instanceof Element ? event.target : null
      if (target !== null && target.closest('input, textarea, [contenteditable="true"]') !== null) return
      this.layout.update((prev) => (prev.maximized === null ? prev : { ...prev, maximized: null }))
    }
    window.addEventListener('keydown', onKeyDown)
    this.disposers.push(() => window.removeEventListener('keydown', onKeyDown))

    // Sync the shell's inline grid: any shell write re-appends our tracks.
    const syncGrid = (): void => {
      const el = this.frame
      if (el === null) return
      const inline = el.style.gridTemplateColumns
      if (inline === '') return
      const tracks = parseGridTracks(inline)
      if (tracks.length >= 2 && tracks.length <= 3) {
        // The shell's own write (3 tracks) — remember it and re-append ours.
        this.shellTracks = tracks
        this.applyGrid()
        return
      }
      if (tracks.length === 5 && this.shellTracks.length === 3) {
        // Our own write — keep it (the shell tracks are already mirrored).
        return
      }
    }
    this.styleObserver = new MutationObserver(syncGrid)
    this.styleObserver.observe(frame, { attributes: true, attributeFilter: ['style'] })

    // Measure the row width: frame minus the shell's sidebar + details tracks.
    const measure = (): void => {
      if (this.frame === null) return
      this.frameWidth = this.frame.getBoundingClientRect().width
      const sidebar = this.shellTracks.length >= 1 ? trackPx(this.shellTracks[0]) : 0
      const details = this.shellTracks.length >= 3 ? trackPx(this.shellTracks[2]) : 0
      const available = Math.max(0, this.frameWidth - sidebar - details)
      const state = this.layout.getSnapshot()
      if (Math.abs(state.availableWidth - available) > 0.5) {
        this.layout.update((prev) => ({ ...prev, availableWidth: available }))
      }
      this.layout.shrinkToFit(this.layout.getSnapshot())
    }
    this.sizeObserver = new ResizeObserver(() => {
      measure()
      this.applyGrid()
    })
    this.sizeObserver.observe(frame)

    // Store -> DOM: grid, handles, floating button.
    this.disposers.push(this.layout.subscribe(() => this.applyGrid()))

    // Initial sync: read the shell's inline style (it is already applied).
    const initial = frame.style.gridTemplateColumns
    if (initial !== '') {
      const tracks = parseGridTracks(initial)
      if (tracks.length >= 2 && tracks.length <= 3) {
        this.shellTracks = tracks
      } else if (tracks.length === 5 && trackPx(tracks[0]) > 0) {
        // The frame may already carry our own previous 5-track write: the
        // plugin hot-reloads in place (client HMR re-materializes the fiber),
        // and the shell's grid is then the first three tracks. A zero-width
        // first track is never a shell write (the shell collapses to the 56px
        // rail, drags clamp at 280px) — treat it as untrusted and wait for
        // the next shell write instead of mirroring the damage.
        this.shellTracks = tracks.slice(0, 3)
      }
    }
    measure()
    this.applyGrid()
  }

  /** Create one drag handle element with its pointer wiring. */
  private createHandle(
    className: string,
    hitWidth: number,
    reverse: boolean,
    kind: 'explorer' | 'preview',
  ): HTMLDivElement {
    const el = document.createElement('div')
    el.className = className
    el.style.position = 'absolute'
    el.style.top = '0'
    el.style.bottom = '0'
    // Same layer as the columns (z 30): the handle strips overlap the
    // column tracks, so anything lower would be painted under the opaque
    // columns and stop receiving pointer events (issue #234 follow-up).
    // Full-screen overlay drawers must render at the ROOT stacking context
    // (z 100~1000) to cover both the columns and the handles — see the
    // columns' stacking-contract note in tokens.module.css.
    el.style.zIndex = '30'
    el.style.cursor = 'col-resize'
    el.style.width = `${hitWidth}px`
    if (reverse) {
      // The preview handle extends LEFT of the preview region's left edge.
      el.style.marginLeft = `-${hitWidth}px`
    }
    el.addEventListener('pointerdown', (event: PointerEvent) => {
      const isExplorer = kind === 'explorer'
      handlePointerDragStart(event, el, {
        reverse,
        getStartWidth: () => {
          const state = this.layout.getSnapshot()
          return isExplorer ? state.explorerWidth : state.previewWidth
        },
        compute: (startWidth, deltaX) => dragTargetWidth(
          isExplorer ? 'explorer' : 'preview',
          startWidth,
          deltaX,
          this.layout.getSnapshot(),
        ),
        onFrame: (width) => {
          // layout.update notifies the subscribers (subscribe -> applyGrid),
          // so no explicit applyGrid here — double-writing every frame.
          this.layout.update((prev) => (
            isExplorer ? { ...prev, explorerWidth: width } : { ...prev, previewWidth: width }
          ))
        },
        onEnd: (width) => {
          writeStoredNumber(isExplorer ? KEY_EXPLORER_WIDTH : KEY_PREVIEW_WIDTH, width)
        },
      })
    })
    // Double-click resets THIS panel to its default width (instant, like
    // every panel width change — the shell's grid transition must not lag).
    el.addEventListener('dblclick', () => {
      this.instant(() => {
        const width = kind === 'explorer' ? DEFAULT_WORKSPACE_PANEL_PX : DEFAULT_PREVIEW_REGION_PX
        this.layout.update((prev) => (
          kind === 'explorer' ? { ...prev, explorerWidth: width } : { ...prev, previewWidth: width }
        ))
        writeStoredNumber(kind === 'explorer' ? KEY_EXPLORER_WIDTH : KEY_PREVIEW_WIDTH, width)
        this.applyGrid()
      })
    })
    // The visual line is drawn by CSS (::after) — the hit zone is transparent.
    return el
  }

  /** Toggle explorer collapse (width 0, kept mounted; no transition). */
  toggleExplorer(): void {
    const state = this.layout.getSnapshot()
    const next = !state.explorerCollapsed
    this.instant(() => {
      this.layout.update((prev) => ({ ...prev, explorerCollapsed: next }))
      try {
        localStorage.setItem(`project-panel-collapse:${state.root}`, next ? 'collapsed' : 'expanded')
      } catch {
        // best-effort
      }
      this.applyGrid()
    })
  }

  /** Toggle the preview region (open = tabs exist; close keeps tabs). */
  setPreviewOpen(open: boolean): void {
    this.instant(() => {
      this.layout.update((prev) => ({ ...prev, previewOpen: open }))
      this.applyGrid()
    })
  }

  /** Position the floating button: persisted top, else the content-area center. */
  private positionFloatingButton(): void {
    const el = this.floatingButton
    if (el === null) return
    const height = window.innerHeight
    const titlebar = titlebarAreaHeight()
    const top = this.floatingTop >= 0
      ? clampFloatingTop(this.floatingTop, height, FLOATING_BUTTON_HEIGHT_PX, titlebar)
      : centeredFloatingTop(height, FLOATING_BUTTON_HEIGHT_PX, titlebar)
    el.style.top = `${Math.round(top)}px`
    el.style.transform = 'none'
  }

  /** Apply one store update with transitions disabled for exactly one frame. */
  private instant(fn: () => void): void {
    const frame = this.frame
    if (frame === null) {
      fn()
      return
    }
    frame.setAttribute('data-aionui-instant', '')
    if (this.instantTimer !== undefined) clearTimeout(this.instantTimer)
    this.instantTimer = setTimeout(() => {
      this.instantTimer = undefined
      frame.removeAttribute('data-aionui-instant')
    }, 0)
    fn()
  }

  /** Re-write the frame grid and reposition handles + floating button. */
  private applyGrid(): void {
    const frame = this.frame
    if (frame === null) return
    // Never guess the shell tracks: without a mirrored shell write, the old
    // fallback zeroed the sidebar track (the bug where the left sidebar
    // vanished after a hot reload). Skip the write until syncGrid observes
    // the shell's own 3-track grid.
    if (this.shellTracks.length !== 3) return
    const state = this.layout.getSnapshot()
    const width = this.frameWidth > 0 ? this.frameWidth : frame.getBoundingClientRect().width

    if (state.maximized !== null) {
      this.applyMaximized(frame, state.maximized, width)
      return
    }
    this.clearMaximizedChrome()

    const explorer = this.layout.explorerWidthPx(state)
    const preview = this.layout.previewWidthPx(state)

    // Five tracks: shell sidebar, center, shell details, preview, explorer.
    frame.style.gridTemplateColumns =
      `${this.shellTracks[0]} minmax(0, 1fr) ${this.shellTracks[2]} ${Math.round(preview)}px ${Math.round(explorer)}px`

    // Column contents follow the tracks (both columns always mounted).
    if (this.explorerCol !== null) {
      this.explorerCol.style.visibility = explorer > 0 ? 'visible' : 'hidden'
    }
    if (this.previewCol !== null) {
      this.previewCol.style.visibility = preview > 0 ? 'visible' : 'hidden'
    }

    // Handles: at the left edge of each panel.
    if (this.explorerHandle !== null) {
      const left = Math.round(width - explorer)
      this.explorerHandle.style.left = `${left}px`
      this.explorerHandle.style.marginLeft = `${-EXPLORER_HANDLE_WIDTH / 2}px`
      this.explorerHandle.style.display = explorer > 0 && state.root !== '' ? 'block' : 'none'
    }
    if (this.previewHandle !== null) {
      const left = Math.round(width - explorer - preview)
      this.previewHandle.style.left = `${left}px`
      this.previewHandle.style.display = preview > 0 && state.root !== '' ? 'block' : 'none'
    }

    // The official shell renders its own details drag handle at
    // `viewport - details` (details treated as the last track). Once this
    // panel extends the grid with preview/explorer tracks, the real
    // center/details boundary shifts left by preview + explorer — re-derive
    // the handle position from the actual tracks so it stays on the details
    // column's left edge (degenerates to the official value when both panels
    // are closed).
    const detailsTrack = trackPx(this.shellTracks[2])
    const detailsHandle = frame.querySelector<HTMLElement>('[data-side="details"]')
    if (detailsHandle !== null) {
      detailsHandle.style.left = `${Math.round(width - detailsTrack - preview - explorer)}px`
    }

    // Floating expand button: visible only when the explorer is collapsed.
    if (this.floatingButton !== null) {
      const show = state.root !== '' && state.explorerCollapsed
      this.floatingButton.style.display = show ? 'flex' : 'none'
      this.positionFloatingButton()
    }
  }

  /**
   * Maximize layout: the target column takes over the whole frame row (the
   * other tracks collapse to 0px). On narrow viewports the takeover grid is
   * skipped and the column renders as a fixed full-screen overlay instead
   * (issue #315). Everything stays mounted — only geometry changes.
   */
  private applyMaximized(frame: HTMLElement, target: MaximizeTarget, width: number): void {
    const overlay = maximizedOverlay(this.layout.getSnapshot().availableWidth)
    if (!overlay) {
      frame.style.gridTemplateColumns = maximizedGridTracks(target, width)
    }
    if (this.explorerCol !== null) {
      this.explorerCol.style.visibility = target === 'explorer' ? 'visible' : 'hidden'
      this.explorerCol.classList.toggle('aionui-maximized', target === 'explorer' && overlay)
    }
    if (this.previewCol !== null) {
      this.previewCol.style.visibility = target === 'preview' ? 'visible' : 'hidden'
      this.previewCol.classList.toggle('aionui-maximized', target === 'preview' && overlay)
    }
    // No drag chrome while maximized: nothing to resize, and the floating
    // button only makes sense for the collapsed explorer.
    if (this.explorerHandle !== null) this.explorerHandle.style.display = 'none'
    if (this.previewHandle !== null) this.previewHandle.style.display = 'none'
    if (this.floatingButton !== null) this.floatingButton.style.display = 'none'
  }

  /** Remove the narrow-screen overlay class from both columns. */
  private clearMaximizedChrome(): void {
    this.explorerCol?.classList.remove('aionui-maximized')
    this.previewCol?.classList.remove('aionui-maximized')
  }

  /** Detach everything (plugin unload). */
  dispose(): void {
    this.waitObserver?.disconnect()
    this.styleObserver?.disconnect()
    this.sizeObserver?.disconnect()
    for (const dispose of this.disposers) dispose()
    this.previewCol?.remove()
    this.explorerCol?.remove()
    this.explorerHandle?.remove()
    this.previewHandle?.remove()
    this.floatingButton?.remove()
    if (this.instantTimer !== undefined) clearTimeout(this.instantTimer)
    if (frameElement === this.frame) frameElement = null
    this.frame = null
  }
}
