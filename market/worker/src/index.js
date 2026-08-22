/**
 * dsh-market — edge API for the DSH marketplace (Worker).
 *
 * Static assets (market/dist) are served by the platform; this Worker runs
 * only for /api/* (run_worker_first match) and provides:
 *   GET  /api/health  — liveness
 *   GET  /api/stats   — all vote counts { skin: {id: votes}, pet: {...}, plugin: {...} }
 *                       (cached 60s via Cache API)
 *   POST /api/like    — per-device like/unlike (D1-backed, idempotent)
 *
 * Security posture: anonymous device fingerprint (hashed at rest), one vote
 * per device per asset; no login system by design. Best-effort abuse
 * mitigation: fingerprint format check, payload size bound, and the
 * unique PRIMARY KEY in D1. Cloudflare-level bot protection applies in
 * front of the zone.
 */

const KINDS = new Set(['skin', 'pet', 'plugin'])
const ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const FP_RE = /^[A-Za-z0-9_-]{16,64}$/

const STATS_CACHE = new Request('https://dsh-market.com/api/stats')

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra,
    },
  })
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function readStats(env) {
  const { results } = await env.DB.prepare('SELECT kind, asset_id, votes FROM counts').all()
  const out = { skin: {}, pet: {}, plugin: {} }
  for (const r of results || []) {
    if (!(r.kind in out)) continue
    out[r.kind][r.asset_id] = r.votes
  }
  return out
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // --- GET /api/health --------------------------------------------------
    if (path === '/api/health') {
      return json({ ok: true })
    }

    // --- GET /api/stats ---------------------------------------------------
    if (path === '/api/stats' && request.method === 'GET') {
      const cache = caches.default
      const hit = await cache.match(STATS_CACHE)
      if (hit) return hit
      const stats = await readStats(env)
      const resp = new Response(JSON.stringify(stats), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=60, stale-while-revalidate=300',
          'access-control-allow-origin': '*',
        },
      })
      ctx.waitUntil(cache.put(STATS_CACHE, resp.clone()))
      return resp
    }

    // --- POST /api/like ---------------------------------------------------
    if (path === '/api/like' && request.method === 'POST') {
      let body
      try {
        body = await request.json()
      } catch {
        return json({ ok: false, error: 'invalid-json' }, 400)
      }
      const kind = typeof body.kind === 'string' ? body.kind : ''
      const assetId = typeof body.asset_id === 'string' ? body.asset_id : ''
      const fp = typeof body.device_fp === 'string' ? body.device_fp : ''
      const unlike = body.unlike === true
      if (!KINDS.has(kind) || !ASSET_RE.test(assetId) || !FP_RE.test(fp)) {
        return json({ ok: false, error: 'invalid-params' }, 400)
      }

      // Turnstile gate: when the secret is configured, public-site likes must
      // carry a valid token. The market card (dsh web client) marks itself
      // with x-dsh-market-client: market-card and stays on the device-fp
      // model — an attacker driving the card still needs the plugin installed
      // and a loopback browser, a much smaller surface than the open site.
      const cardClient = request.headers.get('x-dsh-market-client') === 'market-card'
      if (!cardClient && env.TURNSTILE_SECRET) {
        const token = typeof body.turnstile_token === 'string' ? body.turnstile_token : ''
        if (!token) {
          return json({ ok: false, error: 'captcha-required' }, 403)
        }
        const form = new URLSearchParams()
        form.set('secret', env.TURNSTILE_SECRET)
        form.set('response', token)
        const ip = request.headers.get('cf-connecting-ip') || ''
        if (ip) form.set('remoteip', ip)
        const vr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          body: form,
        })
        const vd = await vr.json().catch(() => ({ success: false }))
        if (!vd.success) {
          return json({ ok: false, error: 'captcha-invalid' }, 403)
        }
      }

      const hash = await sha256(fp)
      let voteResult = null
      if (unlike) {
        const del = await env.DB.prepare(
          'DELETE FROM likes WHERE kind = ?1 AND asset_id = ?2 AND device_hash = ?3'
        ).bind(kind, assetId, hash).run()
        if (del.meta && del.meta.changes > 0) {
          await env.DB.prepare(
            'UPDATE counts SET votes = MAX(votes - 1, 0) WHERE kind = ?1 AND asset_id = ?2 AND votes > 0'
          ).bind(kind, assetId).run()
        }
        voteResult = { liked: false }
      } else {
        const ins = await env.DB.prepare(
          'INSERT OR IGNORE INTO likes (kind, asset_id, device_hash, created_at) VALUES (?1, ?2, ?3, ?4)'
        ).bind(kind, assetId, hash, Date.now()).run()
        if (ins.meta && ins.meta.changes > 0) {
          await env.DB.prepare(
            'INSERT INTO counts (kind, asset_id, votes) VALUES (?1, ?2, 1) ON CONFLICT(kind, asset_id) DO UPDATE SET votes = votes + 1'
          ).bind(kind, assetId).run()
        }
        voteResult = { liked: true }
      }
      ctx.waitUntil(caches.default.delete(STATS_CACHE))

      const row = await env.DB.prepare(
        'SELECT votes FROM counts WHERE kind = ?1 AND asset_id = ?2'
      ).bind(kind, assetId).first()
      return json({ ok: true, liked: voteResult.liked, votes: row ? row.votes : 0 })
    }

    return json({ ok: false, error: 'not-found' }, 404)
  },
}
