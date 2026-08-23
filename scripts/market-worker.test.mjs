import test from 'node:test'
import assert from 'node:assert/strict'

import worker from '../market/worker/src/index.js'

function context() { return { waitUntil() {} } }

test('market worker answers like preflight with CORS', async () => {
  const response = await worker.fetch(new Request('https://dsh-market.com/api/like', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://127.0.0.1:3080',
      'access-control-request-headers': 'content-type',
    },
  }), {}, context())
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(response.headers.get('access-control-allow-methods') || '', /POST/)
})

test('market worker rejects the removed card-header Turnstile bypass', async () => {
  const response = await worker.fetch(new Request('https://dsh-market.com/api/like', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-market-client': 'market-card' },
    body: JSON.stringify({ kind: 'skin', asset_id: 'harbor', device_fp: '0123456789abcdef' }),
  }), { TURNSTILE_SECRET: 'configured' }, context())
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error, 'captcha-required')
})

test('market worker preserves static asset cache validators', async () => {
  let requested = ''
  const response = await worker.fetch(new Request('https://dsh-market.com/api/skin-center/v2/skins/harbor/stylesheet'), {
    ASSETS: {
      async fetch(request) {
        requested = request instanceof URL ? request.pathname : new URL(typeof request === 'string' ? request : request.url).pathname
        return new Response('body{}', { headers: { 'content-type': 'text/css', 'cache-control': 'public, max-age=86400', etag: 'abc' } })
      },
    },
  }, context())
  assert.equal(response.status, 200)
  assert.equal(requested, '/tryon-assets/skins/harbor/skin.css')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400')
  assert.equal(response.headers.get('etag'), 'abc')
})
test('worker records a like via one D1 batch with recount and count read', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, action: 'market-like', hostname: 'dsh-market.com' }))
  try {
    const seen = []
    const stmt = () => ({ bind: (...args) => ({ sql: 'stmt', args, original: true }) })
    const db = {
      prepare: (sql) => {
        const s = { sql }
        s.bind = (...args) => { seen.push({ kind: 'bind', sql, args }); return { kind: 'exec', sql } }
        return { bind: s.bind }
      },
      batch: async (items) => {
        seen.push({ kind: 'batch', count: items.length })
        const wants = items.map((i) => i.kind)
        return [
          { results: [] },
          { results: [] },
          { results: [{ votes: 7 }] },
        ]
      },
    }
    const response = await worker.fetch(new Request('https://dsh-market.com/api/like', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'skin', asset_id: 'harbor', device_fp: '0123456789abcdef', turnstile_token: 'token-1' }),
    }), { TURNSTILE_SECRET: 'configured', DB: db }, context())
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.ok, true)
    assert.equal(payload.votes, 7)
    assert.equal(seen.filter((e) => e.kind === 'batch').length, 1)
    const batch = seen.find((e) => e.kind === 'batch')
    assert.equal(batch.count, 3)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('worker stats endpoint is never cached', async () => {
  const db = { prepare: () => ({ all: async () => ({ results: [] }) }) }
  const response = await worker.fetch(new Request('https://dsh-market.com/api/stats'), { DB: db }, context())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
})

test('worker publishes the RFC 9727 API catalog at /.well-known/api-catalog', async () => {
  const response = await worker.fetch(new Request('https://dsh-market.com/.well-known/api-catalog'), {}, context())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/linkset+json')
  assert.match(response.headers.get('link') || '', /rel="api-catalog"/)
  assert.match(response.headers.get('link') || '', /rfc-editor.org\/info\/rfc9727/)
  const payload = await response.json()
  const entry = payload.linkset && payload.linkset[0]
  assert.equal(entry.anchor, 'https://dsh-market.com/api')
  assert.match(entry['service-desc'][0].href, /openapi\.json$/)
  assert.match(entry['service-doc'][0].href, /api-docs\.html$/)
  assert.match(entry.status[0].href, /\/api\/health$/)
})

test('worker serves the OpenAPI description and API docs', async () => {
  const spec = await worker.fetch(new Request('https://dsh-market.com/openapi.json'), {}, context())
  assert.equal(spec.status, 200)
  assert.match(spec.headers.get('content-type') || '', /application\/json/)
  const openapi = await spec.json()
  assert.equal(openapi.openapi, '3.1.0')
  assert.ok(openapi.paths['/api/health'])
  const docs = await worker.fetch(new Request('https://dsh-market.com/api-docs.html'), {}, context())
  assert.equal(docs.status, 200)
  assert.match(docs.headers.get('content-type') || '', /text\/html/)
  assert.match(await docs.text(), /创意工坊 API 文档/)
})

test('worker answers /api with service info', async () => {
  const response = await worker.fetch(new Request('https://dsh-market.com/api'), {}, context())
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.catalog, 'https://dsh-market.com/.well-known/api-catalog')
})

test('challenge page renders the explicit Turnstile widget', async () => {
  const response = await worker.fetch(new Request('https://dsh-market.com/api/turnstile/challenge'), {}, context())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8')
  const html = await response.text()
  assert.match(html, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/)
  assert.match(html, /size:&quot;invisible&quot;|size:\"invisible\"/)
})
