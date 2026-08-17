/**
 * Floating expand button geometry tests (issues #374 / #292): the vertical
 * clamp keeps the button inside the usable range (below the WCO titlebar
 * strip when one is reported), the default center sits in the content area,
 * and the titlebar height comes from navigator.windowControlsOverlay.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  FLOATING_BUTTON_HEIGHT_PX, FLOATING_MARGIN_PX,
  centeredFloatingTop, clampFloatingTop, titlebarAreaHeight,
} from '../src/client/floating.ts'

const H = FLOATING_BUTTON_HEIGHT_PX
const M = FLOATING_MARGIN_PX

afterEach(() => {
  Object.defineProperty(navigator, 'windowControlsOverlay', { value: undefined, configurable: true })
})

describe('clampFloatingTop', () => {
  it('keeps an in-range top unchanged', () => {
    expect(clampFloatingTop(200, 900, H, 0)).toBe(200)
  })

  it('floors at the margin below the titlebar', () => {
    expect(clampFloatingTop(-40, 900, H, 36)).toBe(36 + M)
    expect(clampFloatingTop(0, 900, H, 0)).toBe(M)
  })

  it('caps at viewport minus button minus margin', () => {
    expect(clampFloatingTop(9999, 900, H, 0)).toBe(900 - H - M)
  })

  it('clamps non-finite values to the floor', () => {
    expect(clampFloatingTop(Number.NaN, 900, H, 0)).toBe(M)
  })

  it('never lets the max sink below the min on tiny viewports', () => {
    const top = clampFloatingTop(50, 40, H, 0)
    expect(top).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(top)).toBe(true)
  })
})

describe('centeredFloatingTop', () => {
  it('centers inside the full viewport without a titlebar', () => {
    expect(centeredFloatingTop(900, H, 0)).toBe((900 - H) / 2)
  })

  it('centers inside the content area below the WCO titlebar (issue #292)', () => {
    const titlebar = 36
    expect(centeredFloatingTop(900, H, titlebar)).toBe(titlebar + (900 - titlebar - H) / 2)
  })

  it('clamps when the titlebar eats most of the viewport', () => {
    expect(centeredFloatingTop(60, H, 50)).toBe(50 + M)
  })
})

describe('titlebarAreaHeight', () => {
  it('is 0 in a plain browser tab', () => {
    expect(titlebarAreaHeight()).toBe(0)
  })

  it('reads the overlay rect when visible', () => {
    Object.defineProperty(navigator, 'windowControlsOverlay', {
      value: { visible: true, getTitlebarAreaRect: () => ({ height: 36 }) },
      configurable: true,
    })
    expect(titlebarAreaHeight()).toBe(36)
  })

  it('stays 0 when the overlay is invisible', () => {
    Object.defineProperty(navigator, 'windowControlsOverlay', {
      value: { visible: false, getTitlebarAreaRect: () => ({ height: 36 }) },
      configurable: true,
    })
    expect(titlebarAreaHeight()).toBe(0)
  })

  it('survives a throwing getTitlebarAreaRect', () => {
    Object.defineProperty(navigator, 'windowControlsOverlay', {
      value: { visible: true, getTitlebarAreaRect: () => { throw new Error('boom') } },
      configurable: true,
    })
    expect(titlebarAreaHeight()).toBe(0)
  })
})
