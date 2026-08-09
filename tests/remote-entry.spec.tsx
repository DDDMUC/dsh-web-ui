// @vitest-environment jsdom
/** The sidebar entry + panel: issue flow, status stream, and the three actions. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RemoteEntry, type RemoteEntryProps } from '../src/client/RemoteEntry.tsx'
import { en, type RemoteKey } from '../src/client/locales.ts'

// English dictionary translate stub with {param} interpolation.
const t: RemoteEntryProps['t'] = (key, params) => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

const neverHook = (() => { throw new Error('shell must not read this hook') }) as never

/** Minimal EventSource stub: instances record messages for manual dispatch. */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  closed = false
  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this)
  }
  close(): void {
    this.closed = true
  }
  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent<string>)
  }
}

/** fetch stub answering the pair endpoints. */
function mockFetch(issue: { ok: boolean; status?: number; code?: string; url?: string; token?: string; expiresAt?: number }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const status = init?.method === 'POST' && url === '/api/pair/issue' && !issue.ok ? (issue.status ?? 409) : 200
    const body = url === '/api/pair/issue' && issue.ok
      ? { ok: true, url: issue.url, token: issue.token, expiresAt: issue.expiresAt }
      : url === '/api/pair/issue'
        ? { ok: false, code: issue.code }
        : { ok: true }
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  })
}

function mount(issue: { ok: boolean; status?: number; code?: string; url?: string; token?: string; expiresAt?: number } = { ok: true, url: 'http://192.168.1.5:3080/?pair=tok-1', token: 'tok-1', expiresAt: Date.now() + 60_000 }) {
  const fetch = mockFetch(issue)
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('EventSource', FakeEventSource)
  const view = render(
    <RemoteEntry
      wide={true}
      useSessions={neverHook}
      useWorkspaces={(selector: (s: { recentWorkspaceId: string }) => unknown) => selector({ recentWorkspaceId: 'ws-1' })}
      t={t}
    />,
  )
  return { fetch, view }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  FakeEventSource.instances = []
  vi.useRealTimers()
})

describe('RemoteEntry', () => {
  it('opens the panel on trigger click: title, subtitle, QR card, hint, actions', async () => {
    const { fetch } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Mobile remote control' }))
    expect(fetch).toHaveBeenCalledWith('/api/pair/issue', expect.objectContaining({ method: 'POST' }))
    await waitFor(() => expect(screen.getByText('Mobile remote control')).toBeTruthy())
    expect(screen.getByText('Scan the QR code or open the link on your phone to control this workspace remotely')).toBeTruthy()
    expect(screen.getByText('Scan to connect')).toBeTruthy()
    expect(screen.getByText('Waiting for a phone')).toBeTruthy()
    // The QR svg renders from the issued URL (the trigger's phone icon is a
    // separate svg; the QR carries its own test id).
    expect(document.querySelector('[data-testid="remote-qr"]')).not.toBeNull()
    expect(screen.getByText('Cannot scan? Open the link on your phone')).toBeTruthy()
    expect(screen.getByText('http://192.168.1.5:3080/?pair=tok-1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh QR' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
    // The issue payload carries the current workspace for the deep link.
    const init = fetch.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ workspaceId: 'ws-1' })
  })

  it('shows the lan-required banner instead of a QR when the bind is loopback-only', async () => {
    mount({ ok: false, code: 'lan-required' })
    fireEvent.click(screen.getByRole('button', { name: 'Mobile remote control' }))
    await waitFor(() => expect(screen.getByText('This feature needs dsh web started with --host 0.0.0.0')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(document.querySelector('[data-testid="remote-qr"]')).toBeNull()
  })

  it('shows the loopback-required banner when the loopback-only fence rejects the mint', async () => {
    // A LAN-origin desktop page (e.g. the GUI opened at 192.168.1.x) hits
    // the issue endpoint's loopback fence and gets 403 — the server may be
    // bound fine, so the banner must say "use 127.0.0.1", not "restart with
    // --host 0.0.0.0".
    mount({ ok: false, status: 403, code: 'forbidden' })
    fireEvent.click(screen.getByRole('button', { name: 'Mobile remote control' }))
    await waitFor(() => expect(screen.getByText('The pairing panel works on this machine only')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(document.querySelector('[data-testid="remote-qr"]')).toBeNull()
    // No status stream on a failure banner: the events endpoint sits behind
    // the same loopback fence, so opening it would only start a doomed
    // reconnect loop.
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('shows the unreachable banner when the issue fetch fails', async () => {
    const { fetch } = mount()
    fetch.mockRejectedValueOnce(new Error('network down'))
    fireEvent.click(screen.getByRole('button', { name: 'Mobile remote control' }))
    await waitFor(() => expect(screen.getByText('Cannot reach the pairing service')).toBeTruthy())
    expect(document.querySelector('[data-testid="remote-qr"]')).toBeNull()
  })

  it('reflects live status frames: connected and back to offline', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Mobile remote control' }))
    await waitFor(() => expect(screen.getByText('Waiting for a phone')).toBeTruthy())
    const source = FakeEventSource.instances[0]
    expect(source?.url).toBe('/api/pair/events')
    source?.emit({ type: 'state', phase: 'connected', lanAvailable: true, tokenId: 'tok-1', tokenExpiresAt: Date.now() + 60_000, deviceCount: 1, onlineCount: 1 })
    await waitFor(() => expect(screen.getByText('1 device(s) connected')).toBeTruthy())
    source?.emit({ type: 'state', phase: 'disconnected', lanAvailable: true, tokenId: 'tok-1', tokenExpiresAt: Date.now() + 60_000, deviceCount: 1, onlineCount: 0 })
    await waitFor(() => expect(screen.getByText('Paired devices offline')).toBeTruthy())
  })

  it('stop posts the revocation; refresh mints a new QR; copy gives feedback', async () => {
    const { fetch } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Mobile remote control' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(fetch).toHaveBeenCalledWith('/api/pair/stop', expect.objectContaining({ method: 'POST' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh QR' }))
    expect(fetch.mock.calls.filter(call => call[0] === '/api/pair/issue').length).toBe(2)
    // Clipboard: stub navigator.clipboard.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://192.168.1.5:3080/?pair=tok-1'))
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
  })
})

describe('apply compat seam', () => {
  it('prefers slots.inject when the runtime provides it', async () => {
    const { apply } = await import('../src/client/index.ts')
    const injected: string[] = []
    const ctx = {
      effect: (fn: () => unknown) => fn(),
      locale: { register: () => () => {}, bind: () => (key: string) => key },
      get: (name: string) => {
        if (name === 'slots') {
          return {
            inject: (key: string) => { injected.push(key); return () => {} },
            register: () => () => {},
          }
        }
        if (name === 'connection') return { isLoopback: true }
        return undefined
      },
    }
    // The compat branch must not call deferRegistration on a missing export.
    apply(ctx as never)
    expect(injected).toEqual(['sidebar.remote'])
  })
})
