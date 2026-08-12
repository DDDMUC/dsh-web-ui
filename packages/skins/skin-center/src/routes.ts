/**
 * Skin-center HTTP routes — the browser half talks to the host through plain
 * same-origin JSON endpoints. The host half delegates to the `dsh-skin` CLI
 * (the single authority over the `dsh-skin managed` section of
 * `~/.dsh/cordis.patch.yml` and the profile symlink), so switching skins from
 * the GUI is exactly `dsh-skin use <name>` — the config watcher hot-reloads
 * the patch within seconds and the frontend reloads the page to pick up the
 * new boot graph. Same pattern as dsh-pet's `/api/pet` family.
 *
 * Unlike pet's behavioral endpoints, `/apply` writes the user's boot config,
 * so every route also rejects cross-site requests (Sec-Fetch-Site / Origin
 * fence) — a malicious webpage must not be able to switch the user's skin
 * through a localhost CSRF post.
 * @module @deepseek-ai/dsh-client-ui-skin-center/routes
 */

import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

/** Browser-facing base path of the skin-center API. */
export const SKIN_CENTER_API_PREFIX = '/api/skin-center'

/** Cap a dsh-skin invocation; a hung CLI must never block the server. */
const DSH_SKIN_TIMEOUT_MS = 15000

/** One JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Require the method or answer 405. */
function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/**
 * Same-origin fence. Browsers send `Sec-Fetch-Site` on every fetch: same-site
 * and cross-site pages both resolve their `Origin` here, so the checks are:
 * a `cross-site` fetch is always rejected, and an `Origin` that does not
 * match the request `Host` is rejected. Requests without either header
 * (curl, node http, old browsers) pass — this is a local single-user tool,
 * and the fence only targets the cross-site browser vector.
 */
function isSameOriginRequest(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    const host = req.headers.host
    if (typeof host !== 'string' || host === '') return false
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

/** Reject cross-site requests with 403. */
function requireSameOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  if (isSameOriginRequest(req)) return true
  json(res, 403, { ok: false, error: 'cross-site-request-rejected' })
  return false
}

/** Read a JSON request body (bounded). */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body-too-large'))
        queueMicrotask(() => req.destroy())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Run `dsh-skin <args>` and resolve with its stdout.
 * @param args - CLI arguments (e.g. `['use', 'qq98']`).
 * @returns stdout on exit code 0.
 * @throws the CLI's stderr (or the spawn error) on any failure.
 */
function runDshSkin(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('dsh-skin', args, { timeout: DSH_SKIN_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout)
        return
      }
      const spawnError = error as NodeJS.ErrnoException
      if (spawnError.code === 'ENOENT') {
        reject(new Error('dsh-skin CLI not found on PATH — install it from dsh-web-ui/scripts/dsh-skin'))
        return
      }
      const detail = (stderr ?? '').trim() || spawnError.message
      reject(new Error(detail || `dsh-skin ${args.join(' ')} failed`))
    })
  })
}

/** The active skin as the CLI sees it ('none' = official stock look). */
function activeName(): Promise<string> {
  return runDshSkin(['current']).then(out => out.trim() || 'none')
}

/** A GET route wrapping one async call, fenced to same-origin requests. */
function getRoute(path: string, run: () => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (!requireMethod(req, res, 'GET')) return
      if (!requireSameOrigin(req, res)) return
      run().then((value) => json(res, 200, value), (error) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

/** A POST JSON route wrapping one async call, fenced to same-origin requests. */
function postRoute(path: string, run: (body: Record<string, unknown>) => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!requireMethod(req, res, 'POST')) return Promise.resolve()
      if (!requireSameOrigin(req, res)) return Promise.resolve()
      return readJsonBody(req).then((body) => {
        const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
        return run(record).then(
          (value) => json(res, 200, value),
          (error) => {
            json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          },
        )
      }, (error) => {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

/** Injectable dsh-skin runner (tests substitute a stub). */
export interface SkinCenterRoutesDeps {
  /** Run `dsh-skin <args>`, resolving stdout; defaults to the real CLI. */
  run?: (args: string[]) => Promise<string>
}

/**
 * Build the skin-center route family.
 * @param deps - optional runner override (tests).
 */
export function makeSkinCenterRoutes(deps: SkinCenterRoutesDeps = {}): WebRoute[] {
  const run = deps.run ?? runDshSkin
  const current = (): Promise<string> => run(['current']).then(out => out.trim() || 'none')
  return [
    getRoute(`${SKIN_CENTER_API_PREFIX}/state`, async () => ({
      ok: true,
      active: await current(),
    })),
    postRoute(`${SKIN_CENTER_API_PREFIX}/apply`, async (body) => {
      const skin = body.skin
      const official = body.official === true
      if (typeof skin !== 'string' || skin === '') {
        if (!official) throw new Error('invalid-skin: pass a skin name or official: true')
      } else if (official) {
        throw new Error('invalid-skin: skin and official are mutually exclusive')
      }
      const target = official ? 'official' : skin
      const out = await run(['use', target])
      return {
        ok: true,
        active: await current(),
        message: out.trim(),
      }
    }),
  ]
}
