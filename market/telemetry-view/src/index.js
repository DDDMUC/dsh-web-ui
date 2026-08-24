/**
 * dsh-market-telemetry-view — private real-time viewer for the dsh-market
 * UV/PV aggregates, served at tv.dsh-market.com.
 *
 * Access model (defense in depth):
 * - The route is meant to sit behind a Cloudflare Access application; once
 *   the app exists, unauthenticated requests never reach this worker.
 * - Regardless of Access, the worker itself verifies the Cf-Access-Jwt-
 *   Assertion signature against the team JWKS and refuses to serve anything
 *   until ACCESS_TEAM and ACCESS_AUD secrets are configured.
 *
 * The worker holds no data: every render fetches the live aggregate from
 * dsh-market.com /api/telemetry/summary with TELEMETRY_READ_KEY, so the
 * market worker stays the single source of truth.
 */

const SUMMARY_BASE = 'https://dsh-market.com/api/telemetry/summary'

let jwksCache = { at: 0, keys: null }

async function getJwks(team) {
  const now = Date.now()
  if (jwksCache.keys && now - jwksCache.at < 3600000) return jwksCache.keys
  const res = await fetch('https://' + team + '.cloudflareaccess.com/cdn-cgi/access/certs')
  if (!res.ok) throw new Error('jwks fetch failed')
  const body = await res.json()
  jwksCache = { at: now, keys: body.keys || [] }
  return jwksCache.keys
}

function b64uToBytes(text) {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
}

/** Verify the Access JWT signature, audience and expiry against the team. */
async function accessVerified(request, env) {
  const jwt = request.headers.get('cf-access-jwt-assertion')
  if (!jwt || !env.ACCESS_TEAM || !env.ACCESS_AUD) return false
  const [headB64, claimsB64, sigB64] = jwt.split('.')
  if (!headB64 || !claimsB64 || !sigB64) return false
  let header, claims
  try {
    header = JSON.parse(new TextDecoder().decode(b64uToBytes(headB64)))
    claims = JSON.parse(new TextDecoder().decode(b64uToBytes(claimsB64)))
  } catch { return false }
  if (claims.aud !== env.ACCESS_AUD || Number(claims.exp) * 1000 < Date.now()) return false
  const keys = await getJwks(env.ACCESS_TEAM)
  const jwk = keys.find((key) => key.kid === header.kid)
  if (!jwk) return false
  const cryptoKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, b64uToBytes(sigB64), b64uToBytes(headB64 + '.' + claimsB64))
}

function page(status, title, body) {
  return new Response('<!doctype html><meta charset="utf-8"><title>' + title + '</title>' + body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      'referrer-policy': 'no-referrer',
    },
  })
}

const SETUP_HTML = [
  '<h1>telemetry view: setup required</h1>',
  '<p>This viewer refuses to serve data until Cloudflare Access is configured.</p>',
  '<ol>',
  '<li>Zero Trust &gt; Access &gt; Applications: create a self-hosted app for <code>tv.dsh-market.com</code> with an email-OTP policy for your address.</li>',
  '<li>Copy the application AUD tag.</li>',
  '<li>From <code>market/telemetry-view</code> run:<br>',
  '<code>npx wrangler@4 secret put ACCESS_TEAM --name dsh-market-telemetry-view</code> (your team name, the part before <code>.cloudflareaccess.com</code>)<br>',
  '<code>npx wrangler@4 secret put ACCESS_AUD --name dsh-market-telemetry-view</code></li>',
  '</ol>',
].join('')

function esc(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
}

function renderDashboard(data, days) {
  const site = data.site || { totals: {}, daily: [], top_paths: [] }
  const plugins = data.plugins || { items: [] }
  const dailyRows = site.daily.map((row) =>
    '<tr><td>' + esc(row.day) + '</td><td>' + esc(row.pv) + '</td><td>' + esc(row.uv) + '</td></tr>').join('')
  const pathRows = site.top_paths.map((row) =>
    '<tr><td><code>' + esc(row.path) + '</code></td><td>' + esc(row.pv) + '</td></tr>').join('')
  const itemRows = plugins.items.map((row) =>
    '<tr><td><code>' + esc(row.item) + '</code></td><td>' + esc(row.instances) + '</td><td>' + esc(row.active_today) + '</td></tr>').join('')
  return [
    '<style>body{font:14px/1.6 -apple-system,sans-serif;color:#e5e7eb;background:#111827;max-width:880px;margin:24px auto;padding:0 16px}',
    'h1{font-size:20px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse;width:100%;margin:8px 0}',
    'th,td{border:1px solid #374151;padding:5px 10px;text-align:left}th{background:#1f2937}code{color:#93c5fd}</style>',
    '<h1>dsh-web-ui telemetry</h1>',
    '<p>last ' + esc(days) + ' days &middot; <a href="?days=' + esc(days) + '" style="color:#93c5fd">refresh</a> &middot; ',
    '<a href="?days=7" style="color:#93c5fd">7d</a> <a href="?days=30" style="color:#93c5fd">30d</a> <a href="?days=90" style="color:#93c5fd">90d</a> <a href="?days=365" style="color:#93c5fd">365d</a></p>',
    '<h2>Site PV / UV</h2>',
    '<p>Total PV <b>' + esc(site.totals.pv || 0) + '</b> &middot; UV sum <b>' + esc(site.totals.uv_daily_sum || 0) + '</b></p>',
    '<table><tr><th>day</th><th>PV</th><th>UV</th></tr>' + dailyRows + '</table>',
    '<h2>Top paths</h2>',
    '<table><tr><th>path</th><th>PV</th></tr>' + pathRows + '</table>',
    '<h2>Plugin installs (instances = distinct browsers; active today = heartbeated today)</h2>',
    '<table><tr><th>package</th><th>instances</th><th>active today</th></tr>' + itemRows + '</table>',
  ].join('')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!env.ACCESS_TEAM || !env.ACCESS_AUD) {
      return page(503, 'telemetry view setup', SETUP_HTML)
    }
    if (!(await accessVerified(request, env))) {
      return page(401, 'telemetry view', '<h1>401</h1><p>Cloudflare Access verification failed.</p>')
    }
    let days = Number.parseInt(url.searchParams.get('days') || '', 10)
    if (!Number.isFinite(days)) days = 30
    days = Math.min(Math.max(days, 1), 365)
    const summaryRes = await fetch(SUMMARY_BASE + '?days=' + days, {
      headers: { 'x-telemetry-key': env.TELEMETRY_READ_KEY || '' },
    })
    if (!summaryRes.ok) {
      return page(502, 'telemetry view', '<h1>502</h1><p>Summary upstream returned ' + summaryRes.status + '.</p>')
    }
    const data = await summaryRes.json()
    return page(200, 'dsh-web-ui telemetry', renderDashboard(data, days))
  },
}
