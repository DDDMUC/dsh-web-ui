/**
 * Loopback-only lifecycle lease for dsh processes started by the generated
 * desktop launcher. A launcher-scoped token prevents ordinary browser tabs
 * or unrelated local pages from controlling the host lifetime.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { LAUNCHER_API, type LauncherLifecycleMessage } from './protocol.ts'
import { isLoopbackRequest } from './loopback.ts'

/** Environment variable inherited by a shortcut-started dsh process. */
export const LAUNCHER_TOKEN_ENV = 'DSH_DESKTOP_LAUNCHER_TOKEN'
/** Maximum silence accepted from one managed browser page. */
export const LIFECYCLE_LEASE_MS = 8_000
/** Reload/navigation grace before the final managed page closes the host. */
export const LIFECYCLE_RELEASE_GRACE_MS = 3_000

interface LifecycleClock {
  now(): number
  schedule(fn: () => void, ms: number): unknown
  cancel(handle: unknown): void
}

export interface LauncherLifecycleDeps {
  token: string
  requestExit(code: number): void
  fence?: (request: IncomingMessage) => boolean
  clock?: LifecycleClock
}

export interface LauncherLifecycleRoute {
  route: WebRoute
  dispose(): void
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readMessage(req: IncomingMessage): Promise<LauncherLifecycleMessage | undefined> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 4_096) return undefined
    chunks.push(buffer)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<LauncherLifecycleMessage>
    if ((value.action !== 'attach' && value.action !== 'heartbeat' && value.action !== 'release')
      || typeof value.token !== 'string' || typeof value.clientId !== 'string' || value.clientId.length < 8) return undefined
    return value as LauncherLifecycleMessage
  } catch {
    return undefined
  }
}

/** Build the managed-browser lease route and its timer disposer. */
export function makeLauncherLifecycleRoute(deps: LauncherLifecycleDeps): LauncherLifecycleRoute {
  const fence = deps.fence ?? isLoopbackRequest
  const clock: LifecycleClock = deps.clock ?? {
    now: Date.now,
    schedule: (fn, ms) => setTimeout(fn, ms),
    cancel: handle => { clearTimeout(handle as ReturnType<typeof setTimeout>) },
  }
  const clients = new Map<string, number>()
  let timer: unknown
  let disposed = false
  let exitRequested = false

  const clearTimer = (): void => {
    if (timer !== undefined) clock.cancel(timer)
    timer = undefined
  }
  const requestExit = (): void => {
    clearTimer()
    if (disposed || exitRequested) return
    exitRequested = true
    deps.requestExit(0)
  }
  const expire = (): void => {
    timer = undefined
    const now = clock.now()
    for (const [clientId, seenAt] of clients) {
      if (now - seenAt >= LIFECYCLE_LEASE_MS) clients.delete(clientId)
    }
    if (clients.size === 0) {
      requestExit()
      return
    }
    const nextExpiry = Math.min(...clients.values()) + LIFECYCLE_LEASE_MS
    timer = clock.schedule(expire, Math.max(1, nextExpiry - now))
  }
  const scheduleLease = (): void => {
    clearTimer()
    const nextExpiry = Math.min(...clients.values()) + LIFECYCLE_LEASE_MS
    timer = clock.schedule(expire, Math.max(1, nextExpiry - clock.now()))
  }
  const scheduleRelease = (): void => {
    clearTimer()
    timer = clock.schedule(requestExit, LIFECYCLE_RELEASE_GRACE_MS)
  }

  return {
    route: {
      kind: 'exact',
      path: LAUNCHER_API.lifecycle,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, code: 'method_not_allowed' })
          return
        }
        if (!fence(req)) {
          writeJson(res, 403, { ok: false, code: 'forbidden' })
          return
        }
        const message = await readMessage(req)
        if (message === undefined) {
          writeJson(res, 400, { ok: false, code: 'invalid_message' })
          return
        }
        if (message.token !== deps.token) {
          writeJson(res, 403, { ok: false, code: 'invalid_token' })
          return
        }
        if (disposed || exitRequested) {
          writeJson(res, 410, { ok: false, code: 'closing' })
          return
        }
        if (message.action === 'release') {
          clients.delete(message.clientId)
          if (clients.size === 0) scheduleRelease()
          else scheduleLease()
        } else {
          clients.set(message.clientId, clock.now())
          scheduleLease()
        }
        writeJson(res, 200, { ok: true })
      },
    },
    dispose: () => {
      disposed = true
      clearTimer()
      clients.clear()
    },
  }
}
