/**
 * PanelLayoutController DOM integration tests (issues #374 / #292 / #315):
 * drive the controller against a jsdom frame element and assert the real
 * DOM outcomes — the maximized takeover grid, the narrow-screen overlay
 * class, Esc restore (with the editing-surface exemption), the floating
 * button positioning under a mocked Window Controls Overlay, drag vs
 * click disambiguation, and the persisted drag position.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PanelLayoutController } from '../src/client/layout.ts'
import { createLayoutStore, layoutSetRoot, type LayoutStore } from '../src/client/store.ts'
import { FLOATING_BUTTON_HEIGHT_PX, FLOATING_MARGIN_PX, KEY_FLOATING_TOP } from '../src/client/floating.ts'

/** jsdom lacks ResizeObserver; the controller only needs a silent stub. */
class SilentResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function domRect(width: number, height: number): DOMRect {
  return { width, height, top: 0, left: 0, bottom: height, right: width, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
}

let frame: HTMLElement
let layout: LayoutStore
let controller: PanelLayoutController

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = SilentResizeObserver
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  Object.defineProperty(navigator, 'windowControlsOverlay', { value: undefined, configurable: true })

  frame = document.createElement('div')
  frame.setAttribute('data-dsh-frame', '')
  frame.style.gridTemplateColumns = '240px minmax(0, 1fr) 0px'
  frame.getBoundingClientRect = () => domRect(1280, 900)
  document.body.appendChild(frame)

  layout = createLayoutStore()
  layoutSetRoot(layout, '/w', false)
  controller = new PanelLayoutController(layout)
  controller.mount()
})

afterEach(() => {
  controller.dispose()
  document.body.innerHTML = ''
})

const grid = (): string => frame.style.gridTemplateColumns
const explorerCol = (): HTMLElement => document.querySelector('[data-aionui-explorer-col]') as HTMLElement
const previewCol = (): HTMLElement => document.querySelector('[data-aionui-preview-col]') as HTMLElement
const floatingButton = (): HTMLButtonElement => document.querySelector('.aionui-floating-expand') as HTMLButtonElement

describe('maximize (issue #315)', () => {
  it('writes the normal five tracks on mount', () => {
    expect(grid()).toBe('240px minmax(0, 1fr) 0px 0px 260px')
  })

  it('takes over the whole row while maximized and restores on Esc', () => {
    layout.update((prev) => ({ ...prev, maximized: 'explorer' }))
    expect(grid()).toBe('0px 0px 0px 0px 1280px')
    expect(explorerCol().style.visibility).toBe('visible')
    expect(previewCol().style.visibility).toBe('hidden')
    expect(floatingButton().style.display).toBe('none')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(layout.getSnapshot().maximized).toBeNull()
    expect(grid()).toBe('240px minmax(0, 1fr) 0px 0px 260px')
  })

  it('leaves Esc to focused editing surfaces', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    layout.update((prev) => ({ ...prev, maximized: 'preview' }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(layout.getSnapshot().maximized).toBe('preview')
  })

  it('switches to the fixed full-screen overlay on narrow rows', () => {
    layout.update((prev) => ({ ...prev, availableWidth: 500, maximized: 'explorer' }))
    expect(explorerCol().classList.contains('aionui-maximized')).toBe(true)
    expect(previewCol().classList.contains('aionui-maximized')).toBe(false)
    // The takeover grid is skipped in overlay mode: the fixed column covers.
    expect(grid()).toBe('240px minmax(0, 1fr) 0px 0px 260px')

    layout.update((prev) => ({ ...prev, maximized: null }))
    expect(explorerCol().classList.contains('aionui-maximized')).toBe(false)
  })

  it('resets maximized on a root switch', () => {
    layout.update((prev) => ({ ...prev, maximized: 'explorer' }))
    layoutSetRoot(layout, '/other', false)
    expect(layout.getSnapshot().maximized).toBeNull()
  })
})

describe('floating expand button (issues #374 / #292)', () => {
  const collapse = (): void => { layout.update((prev) => ({ ...prev, explorerCollapsed: true })) }

  it('centers inside the content area below the WCO titlebar', () => {
    Object.defineProperty(navigator, 'windowControlsOverlay', {
      value: { visible: true, getTitlebarAreaRect: () => ({ height: 36 }) }, configurable: true,
    })
    collapse()
    const top = parseFloat(floatingButton().style.top)
    expect(top).toBe(36 + (900 - 36 - FLOATING_BUTTON_HEIGHT_PX) / 2)
    expect(floatingButton().style.transform).toBe('none')
  })

  it('drags to a new clamped position and persists it', () => {
    collapse()
    const button = floatingButton()
    button.setPointerCapture = () => {}
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 450 }))
    button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 560 }))
    button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: 560 }))
    const top = parseFloat(button.style.top)
    expect(top).toBeGreaterThan(FLOATING_MARGIN_PX)
    expect(top).toBeLessThan(900 - FLOATING_BUTTON_HEIGHT_PX - FLOATING_MARGIN_PX)
    expect(localStorage.getItem(KEY_FLOATING_TOP)).toBe(String(Math.round(top)))
  })

  it('clamps a drag below the WCO titlebar', () => {
    Object.defineProperty(navigator, 'windowControlsOverlay', {
      value: { visible: true, getTitlebarAreaRect: () => ({ height: 36 }) }, configurable: true,
    })
    collapse()
    const button = floatingButton()
    button.setPointerCapture = () => {}
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 450 }))
    button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: -200 }))
    button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: -200 }))
    expect(parseFloat(button.style.top)).toBe(36 + FLOATING_MARGIN_PX)
  })

  it('suppresses the click after a drag but keeps plain clicks', () => {
    collapse()
    const button = floatingButton()
    button.setPointerCapture = () => {}
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 450 }))
    button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 480 }))
    button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: 480 }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(layout.getSnapshot().explorerCollapsed).toBe(true)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(layout.getSnapshot().explorerCollapsed).toBe(false)
  })

  it('restores the persisted top on a fresh controller', () => {
    localStorage.setItem(KEY_FLOATING_TOP, '300')
    controller.dispose()
    controller = new PanelLayoutController(layout)
    controller.mount()
    collapse()
    expect(parseFloat(floatingButton().style.top)).toBe(300)
  })

  it('hides while the explorer is expanded', () => {
    expect(floatingButton().style.display).toBe('none')
    collapse()
    expect(floatingButton().style.display).toBe('flex')
    layout.update((prev) => ({ ...prev, explorerCollapsed: false }))
    expect(floatingButton().style.display).toBe('none')
  })
})
