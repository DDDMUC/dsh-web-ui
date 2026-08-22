/** Browser lease for a host process started by the generated desktop shortcut. */

import { LAUNCHER_API, type LauncherLifecycleAction, type LauncherLifecycleMessage } from '../protocol.ts'

const TOKEN_PARAM = 'dsh-launcher'
const TOKEN_STORAGE = 'dsh.desktop-launcher.token'
const HEARTBEAT_MS = 2_000

function consumeLauncherToken(): string | undefined {
  const current = new URL(window.location.href)
  const fragment = new URLSearchParams(current.hash.startsWith('#') ? current.hash.slice(1) : current.hash)
  const incoming = fragment.get(TOKEN_PARAM)?.trim()
  if (incoming !== undefined && incoming !== '') {
    try { window.sessionStorage.setItem(TOKEN_STORAGE, incoming) } catch {}
    fragment.delete(TOKEN_PARAM)
    const remaining = fragment.toString()
    current.hash = remaining === '' ? '' : '#' + remaining
    window.history.replaceState(window.history.state, '', current.toString())
    return incoming
  }
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE)?.trim() || undefined
  } catch {
    return undefined
  }
}

function clientId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2)
}

/** Start heartbeats when this page belongs to a shortcut-managed launch. */
export function startLauncherLifecycle(): () => void {
  const token = consumeLauncherToken()
  if (token === undefined) return () => {}
  const id = clientId()
  let stopped = false

  const message = (action: LauncherLifecycleAction): LauncherLifecycleMessage => ({ action, token, clientId: id })
  const post = (action: LauncherLifecycleAction): void => {
    void fetch(LAUNCHER_API.lifecycle, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message(action)),
      keepalive: true,
    }).catch(() => {})
  }
  const release = (): void => {
    if (stopped) return
    stopped = true
    window.clearInterval(interval)
    window.removeEventListener('pagehide', release)
    const body = JSON.stringify(message('release'))
    if (typeof navigator.sendBeacon !== 'function' || !navigator.sendBeacon(LAUNCHER_API.lifecycle, body)) post('release')
  }

  post('attach')
  const interval = window.setInterval(() => { post('heartbeat') }, HEARTBEAT_MS)
  window.addEventListener('pagehide', release)
  return release
}
