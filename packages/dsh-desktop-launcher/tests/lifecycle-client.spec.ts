/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { startLauncherLifecycle } from '../src/client/lifecycle.ts'

afterEach(() => {
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('browser launcher lifecycle', () => {
  it('stays inert for an ordinary browser tab', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    startLauncherLifecycle()()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('consumes the fragment token, heartbeats, and releases with a beacon', () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }))
    const beacon = vi.fn((_url: string | URL, _data?: BodyInit | null) => true)
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: beacon })
    window.history.replaceState(null, '', '/#dsh-launcher=secret-token')

    const dispose = startLauncherLifecycle()
    expect(window.location.hash).toBe('')
    expect(window.sessionStorage.getItem('dsh.desktop-launcher.token')).toBe('secret-token')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({ action: 'attach', token: 'secret-token' })

    vi.advanceTimersByTime(2_000)
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).action).toBe('heartbeat')
    dispose()
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(JSON.parse(beacon.mock.calls[0]![1] as string)).toMatchObject({ action: 'release', token: 'secret-token' })
    vi.useRealTimers()
  })
})
