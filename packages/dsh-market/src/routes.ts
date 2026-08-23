/**
 * Market host HTTP routes — the loopback-only install gateway the browser
 * half calls to install skins/pets from dsh-market.com into the DSH home
 * asset directories. Endpoints (all under /api/market):
 *  - POST /api/market/install-skin { id, force? }
 *  - POST /api/market/install-pet { id, force? }
 * The host fetches the manifest itself, validates every path, and never
 * accepts a URL or a file list from the client (see core/installer).
 * @module @linxin666/dsh-client-ui-market/routes
 */

import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { dshHome } from './dsh-home.ts'
import { isLoopbackRequest } from './loopback.ts'
import { installAsset, isSafeRel, MARKET_ORIGIN, type MarketKind } from './core/installer.ts'
import { readJsonBody } from './http.ts'

export const MARKET_API_PREFIX = '/api/market'

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function isLoopback(req: IncomingMessage): boolean {
  try { return isLoopbackRequest(req) } catch { return false }
}

export interface MakeMarketRoutesDeps {
  /** DSH home root (defaults to the live $DSH_HOME resolution). */
  dshHome?: string
  /** fetch impl (test seam). */
  fetchImpl?: typeof fetch
  /** Runtime hook for tests. */
  now?: () => number
}

/** Build the market install routes. */
export function makeMarketRoutes(deps: MakeMarketRoutesDeps = {}): WebRoute[] {
  const home = deps.dshHome ?? dshHome()
  const fetchImpl = deps.fetchImpl ?? fetch

  const handleInstall = (kind: MarketKind) => async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopback(req)) {
      json(res, 403, { ok: false, error: 'loopback-only' })
      return
    }
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'method-not-allowed' })
      return
    }
    // Shared lenient reader (16 KiB cap): an empty body lands on {} (legacy
    // empty-body semantics); invalid JSON and over-limit bodies also yield
    // null, so the id validator below keeps answering 400 with the same
    // { ok: false, error } envelope (the stream-error catch stays as a guard).
    let body: { id?: unknown; force?: unknown }
    try {
      body = ((await readJsonBody(req, { maxBytes: 16 * 1024 })) ?? {}) as { id?: unknown; force?: unknown }
    } catch {
      json(res, 400, { ok: false, error: 'invalid-body' })
      return
    }
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id || (typeof id === 'string' && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id))) {
      json(res, 400, { ok: false, error: 'invalid-id' })
      return
    }
    try {
      const result = await installAsset(kind, id, {
        dshHome: home,
        force: body.force === true,
        fetchImpl,
      })
      json(res, 200, result)
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'write'
      const status = code === 'conflict' ? 409 : code === 'manifest' ? 502 : 500
      json(res, status, { ok: false, error: code, message: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleInstalled = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopback(req)) {
      json(res, 403, { ok: false, error: 'loopback-only' })
      return
    }
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'method-not-allowed' })
      return
    }
    const listDirs = (base: string): string[] => {
      try {
        return readdirSync(base, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
          .map((entry) => entry.name)
          .sort()
      } catch {
        return []
      }
    }
    json(res, 200, {
      skins: listDirs(path.join(home, 'skins')),
      pets: listDirs(path.join(home, 'pets')),
    })
  }

  const installSkin = handleInstall('skin')
  const installPet = handleInstall('pet')

  return [
    {
      kind: 'exact',
      path: `${MARKET_API_PREFIX}/installed`,
      handler: handleInstalled,
    },
    {
      kind: 'exact',
      path: `${MARKET_API_PREFIX}/install-skin`,
      handler: installSkin,
    },
    {
      kind: 'exact',
      path: `${MARKET_API_PREFIX}/install-pet`,
      handler: installPet,
    },
  ]
}

export { isSafeRel, MARKET_ORIGIN }
