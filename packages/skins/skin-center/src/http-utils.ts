/**
 * Shared HTTP helpers for the skin-center route families (extracted from the
 * retired v1 routes.ts; issue #506). Same-origin fence: /active writes the
 * user's GUI state, so a malicious webpage must not be able to switch the
 * user's skin through a localhost CSRF post.
 * @module @linxin666/dsh-client-ui-skin-center/http-utils
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** One JSON response. */
export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * Same-origin fence. Browsers send Sec-Fetch-Site on every fetch: a
 * cross-site fetch is always rejected, and an Origin that does not match the
 * request Host is rejected. Requests without either header (curl, node http,
 * old browsers) pass — this is a local single-user tool, and the fence only
 * targets the cross-site browser vector.
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
export function requireSameOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  if (isSameOriginRequest(req)) return true
  json(res, 403, { ok: false, error: 'cross-site-request-rejected' })
  return false
}

/** Read a JSON request body (bounded to 64KB). */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
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
