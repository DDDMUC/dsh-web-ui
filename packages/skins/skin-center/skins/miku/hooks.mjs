/**
 * Hatsune Miku (miku) skin hooks — the trusted escape hatch of the v2
 * skin contract (x-org.linxin666.skin-center/v1alpha1), reviewed and
 * released with this repository. Loading this module executes nothing;
 * apply() owns every DOM write and registers its retraction through
 * ctx.onCleanup.
 *
 * Port of the v1 plugin effects (packages/skins/miku/src/client/index.ts):
 *  - window chrome: the fixed title bar (note icon + 01 badge + window
 *    glyphs) and status bar (waveform + status cells), mounted on
 *    document.body exactly as v1 did.
 *  - optional localStorage overrides (dsh.miku.title / dsh.miku.cells):
 *    pure presentation state the skin reads itself, with the same bounds
 *    and the same fail-safe degradation as v1. v2 has no storage facet;
 *    the skin remains the explicit owner of these two keys.
 *  - favicon (inline teal-note SVG data URI) and the pinned document
 *    title (restored on dispose only when the skin's own title still
 *    stands).
 * The v1 backdrop (idol art + theme scrim) is declarative in v2: it rides
 * contributes.backgroundMedia in skin.json, owned by the skin-center. The
 * class names are the css-modules hashes the compiled patches.css carries.
 */

/** The product title the skin pins (captured by the shell's DocumentTitle after settle). */
const SKIN_TITLE = '初音未来 · DeepSeek 在线'

/** Status bar cells; the spacer cell splits left and right groups. */
const STATUS_CELLS = ['MIKU 01', '声库就绪', '已连接', '在线', 'VOCALOID 正式版']

/** Title bar window buttons (decorative glyphs, aria-hidden). */
const TITLEBAR_GLYPHS = ['–', '□', '×']

/** localStorage keys for the optional title / status-cell overrides. */
const LS_TITLE = 'dsh.miku.title'
const LS_CELLS = 'dsh.miku.cells'

/** Bounds for localStorage overrides: keep the injected chrome small and
 *  bounded so a large or hostile override cannot stall apply(). */
const MAX_CELLS = 20
const MAX_CELL_LENGTH = 64
const MAX_TITLE_LENGTH = 200

/** Miku note mark (a single eighth note), inline so the skin carries no static assets.
 *  White fill: the title bar wears the blue-violet-magenta gradient, so the icon
 *  must be light to read against it (matches the white title text). */
const NOTE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">',
  '<path d="M32 8v20.6a8 8 0 1 1-4-6.9V13.4L20 16.8v17.8a8 8 0 1 1-4-6.9V12.2c0-.9.6-1.7 1.5-1.9l16-4.4c1-.3 2 .3 2.5 1.1.3.5.5 1 .5 1.5z" fill="#fff"/>',
  '<ellipse cx="24" cy="44" rx="7.5" ry="2.4" fill="rgba(255,255,255,0.45)"/>',
  '</svg>',
].join('')

/** Miku "01" badge: the iconic unit number on a rounded teal chip. The
 *  outline and number are white so the badge reads on the gradient band;
 *  the chip tint is a translucent teal over the bar. */
const BADGE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="18" viewBox="0 0 68 36" aria-hidden="true">',
  '<rect x="1" y="1" width="66" height="34" rx="8" fill="rgba(57,197,187,0.16)" stroke="#fff" stroke-width="2"/>',
  '<text x="34" y="25" text-anchor="middle" font-family="Consolas, monospace" font-size="19" font-weight="700" fill="#fff">01</text>',
  '</svg>',
].join('')

/** Favicon: teal rounded square with a white eighth note. */
const FAVICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
  '<rect x="2" y="2" width="60" height="60" rx="14" fill="#2e9bff"/>',
  '<path d="M42 14v24.6a10 10 0 1 1-5-8.7V20.6l-15 4.1v21.7a10 10 0 1 1-5-8.7V15.4c0-1 .7-2 1.7-2.2l19-5.2c1.2-.3 2.4.4 2.9 1.4.3.6.4 1.1.4 1.6z" fill="#fff"/>',
  '</svg>',
].join('')

/** Compiled css-modules class names (see patches.css). */
const CLS = {
  mikuTitlebar: 'NPtzYa_mikuTitlebar',
  mikuTitlebarIcon: 'NPtzYa_mikuTitlebarIcon',
  mikuTitlebarBadge: 'NPtzYa_mikuTitlebarBadge',
  mikuTitlebarTitle: 'NPtzYa_mikuTitlebarTitle',
  mikuTitlebarBtn: 'NPtzYa_mikuTitlebarBtn',
  mikuStatusbar: 'NPtzYa_mikuStatusbar',
  mikuStatusbarWave: 'NPtzYa_mikuStatusbarWave',
  mikuStatusbarSpacer: 'NPtzYa_mikuStatusbarSpacer',
  mikuStatusbarCell: 'NPtzYa_mikuStatusbarCell',
}

/** Read one optional localStorage override; returns undefined when storage
 *  is unavailable (private mode, file://, sandboxed iframe) or the key is
 *  absent. Never throws. */
function readOverride(key) {
  try {
    return window.localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

/** Resolve the pinned title: localStorage dsh.miku.title wins when it is
 *  non-blank and within the length bound, else the default. */
function resolveTitle() {
  const override = readOverride(LS_TITLE)?.trim()
  if (override && override.length <= MAX_TITLE_LENGTH) return override
  return SKIN_TITLE
}

/** Resolve the status cells: localStorage dsh.miku.cells (JSON string
 *  array) wins when it parses to a bounded array of trimmed, non-blank
 *  strings, else the defaults. */
function resolveCells() {
  const raw = readOverride(LS_CELLS)
  if (raw !== undefined) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= MAX_CELLS) {
        const cells = []
        for (const cell of parsed) {
          if (typeof cell !== 'string') return STATUS_CELLS
          const trimmed = cell.trim()
          if (trimmed === '' || trimmed.length > MAX_CELL_LENGTH) return STATUS_CELLS
          cells.push(trimmed)
        }
        if (cells.length > 0) return cells
      }
    } catch {
      // Fall through to the defaults on malformed JSON.
    }
  }
  return STATUS_CELLS
}

export default function defineSkinHooks() {
  return {
    apply(ctx) {
      const body = document.body
      const originalTitle = document.title
      // Resolve the pinned title once up front so the title-bar text and the
      // document title always agree, and the dispose check compares against the
      // exact value the skin wrote.
      const pinnedTitle = resolveTitle()

      const titlebar = document.createElement('div')
      titlebar.className = CLS.mikuTitlebar
      titlebar.dataset.skinChrome = 'titlebar'
      const icon = document.createElement('span')
      icon.className = CLS.mikuTitlebarIcon
      icon.innerHTML = NOTE_SVG
      const badge = document.createElement('span')
      badge.className = CLS.mikuTitlebarBadge
      badge.innerHTML = BADGE_SVG
      const title = document.createElement('span')
      title.className = CLS.mikuTitlebarTitle
      title.textContent = pinnedTitle
      titlebar.append(icon, badge, title)
      for (const glyph of TITLEBAR_GLYPHS) {
        const btn = document.createElement('span')
        btn.className = CLS.mikuTitlebarBtn
        btn.setAttribute('aria-hidden', 'true')
        btn.textContent = glyph
        titlebar.append(btn)
      }

      const statusbar = document.createElement('div')
      statusbar.className = CLS.mikuStatusbar
      statusbar.dataset.skinChrome = 'statusbar'
      const wave = document.createElement('span')
      wave.className = CLS.mikuStatusbarWave
      wave.innerHTML = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="12" viewBox="0 0 72 12" aria-hidden="true">',
        '<path d="M1 6h3l2-4 2 8 2-9 2 6 2-3 2 5 2-7 2 4 2-2 2 3 2-6 2 7 2-5 2 4 2-3 2 2 2-4 2 3 2-2 2 1 2-3 2 2 2-1 2 2 2-4 2 2 2-1 1 1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
        '</svg>',
      ].join('')
      const spacer = document.createElement('span')
      spacer.className = CLS.mikuStatusbarSpacer
      statusbar.append(wave, spacer)
      for (const cell of resolveCells()) {
        const el = document.createElement('span')
        el.className = CLS.mikuStatusbarCell
        el.dataset.skinCell = ''
        el.textContent = cell
        statusbar.append(el)
      }

      const favicon = document.createElement('link')
      favicon.rel = 'icon'
      favicon.href = `data:image/svg+xml;utf8,${encodeURIComponent(FAVICON_SVG)}`
      document.head.append(favicon)

      document.title = pinnedTitle
      body.append(titlebar, statusbar)

      ctx.onCleanup(() => {
        titlebar.remove()
        statusbar.remove()
        favicon.remove()
        // Only restore when the skin's own title still stands — a session title
        // projected by the shell must not be clobbered by skin teardown.
        if (document.title === pinnedTitle) document.title = originalTitle
      })
    },
  }
}
