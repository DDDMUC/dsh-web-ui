/**
 * Skin-center HTTP routes — the browser half talks to the host through plain
 * same-origin JSON endpoints. The host half delegates to the `dsh-skin` CLI
 * (the single authority over the `dsh-skin managed` section of
 * `~/.dsh/cordis.patch.yml` and the profile symlink), so switching skins from
 * the GUI is exactly `dsh-skin use <name>` — the config watcher hot-reloads
 * the patch within seconds and the frontend reloads the page to pick up the
 * new boot graph. Same pattern as dsh-pet's `/api/pet` family.
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
      const detail = (stderr ?? '').trim() || (error as Error).message
      reject(new Error(detail || `dsh-skin ${args.join(' ')} failed`))
    })
  })
}

/** The active skin as the CLI sees it ('none' = official stock look). */
function activeName(): Promise<string> {
  return runDshSkin(['current']).then(out => out.trim() || 'none')
}

/** A GET route wrapping one async call. */
function getRoute(path: string, run: () => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (!requireMethod(req, res, 'GET')) return
      run().then((value) => json(res, 200, value), (error) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

/** A POST JSON route wrapping one async call. */
function postRoute(path: string, run: (body: Record<string, unknown>) => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!requireMethod(req, res, 'POST')) return Promise.resolve()
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

/** Build the skin-center route family. */
export function makeSkinCenterRoutes(): WebRoute[] {
  return [
    getRoute(`${SKIN_CENTER_API_PREFIX}/state`, async () => ({
      ok: true,
      active: await activeName(),
    })),
    postRoute(`${SKIN_CENTER_API_PREFIX}/apply`, async (body) => {
      const skin = body.skin
      const official = body.official === true
      if (typeof skin !== 'string' || skin === '') {
        if (!official) throw new Error('invalid-skin: pass a skin name or official: true')
      }
      const target = official ? 'official' : skin
      const out = await runDshSkin(['use', target])
      return {
        ok: true,
        active: await activeName(),
        message: out.trim(),
      }
    }),
  ]
}
