/**
 * Route-layer tests for /git/*: the loopback fence must reject non-loopback
 * clients (JSON operations and the SSE stream alike) with the same 403 body
 * dsh-ssh uses, while loopback clients keep working exactly as before.
 * Exercises the handlers through a fake ctx.webServer registry.
 */
import { describe, expect, it, vi } from 'vitest'
import { registerGitRoutes } from '../src/host/routes.ts'

/** A minimal ctx fulfilling what registerGitRoutes touches. */
function fakeCtx(): {
  ctx: Record<string, unknown>
  registrations: Array<{ kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }>
} {
  const registrations: Array<{ kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }> = []
  const ctx = {
    logger: { warn: vi.fn() },
    webServer: {
      register: (row: { kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
        registrations.push(row)
        return () => {}
      },
    },
  }
  return { ctx, registrations }
}

interface RequestOptions {
  method?: string
  remoteAddress?: string
  host?: string
  body?: string
  on?: (event: string, handler: () => void) => void
}

/** One fake IncomingMessage: loopback socket + Host by default. */
function fakeRequest(url: string, options: RequestOptions = {}): Record<string, unknown> {
  const body = options.body
  const req: Record<string, unknown> = {
    method: options.method ?? 'POST',
    url,
    headers: {
      host: options.host ?? '127.0.0.1:3000',
      'content-type': 'application/json',
    },
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
    on: options.on ?? vi.fn(),
  }
  if (body !== undefined) {
    req[Symbol.asyncIterator] = async function* iterate() {
      yield Buffer.from(body)
    }
  }
  return req
}

/** One fake ServerResponse collecting status/headers/body/writes. */
function fakeResponse(): {
  res: Record<string, unknown>
  status: number
  headers: Record<string, string>
  body: string
  writes: string[]
} {
  const state = { status: 0, headers: {} as Record<string, string>, body: '', writes: [] as string[] }
  const res: Record<string, unknown> = {
    writeHead: (code: number, head: Record<string, string> = {}) => {
      state.status = code
      state.headers = { ...head }
    },
    write: (chunk: unknown) => { state.writes.push(String(chunk)) },
    end: (chunk?: unknown) => {
      if (chunk !== undefined && chunk !== null) state.writes.push(String(chunk))
      state.body = state.writes.join('')
    },
  }
  return {
    res,
    get status() { return state.status },
    get headers() { return state.headers },
    get body() { return state.body },
    get writes() { return state.writes },
  }
}

/** Drive one request through a registered handler. */
async function drive(
  handler: (req: unknown, res: unknown) => Promise<void>,
  url: string,
  options: RequestOptions = {},
): Promise<{ status: number; headers: Record<string, string>; body: string; writes: string[] }> {
  const response = fakeResponse()
  await handler(fakeRequest(url, options), response.res)
  return { status: response.status, headers: response.headers, body: response.body, writes: response.writes }
}

describe('/git loopback fence', () => {
  it('serves loopback clients exactly as before', async () => {
    const status = vi.fn(async () => ({ root: '/w', branch: 'main', head: 'abc1234', dirtyFiles: 0 }))
    const { ctx, registrations } = fakeCtx()
    registerGitRoutes(ctx as never, { status } as never)
    const prefix = registrations.find((row) => row.kind === 'prefix')
    expect(prefix).toBeDefined()

    const result = await drive(prefix!.handler, '/git/status', {
      body: JSON.stringify({ path: '/w' }),
    })

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({
      ok: true,
      value: { root: '/w', branch: 'main', head: 'abc1234', dirtyFiles: 0 },
    })
    expect(status).toHaveBeenCalledWith('/w')
  })

  it('rejects non-loopback JSON operations with 403 before touching the service', async () => {
    const status = vi.fn(async () => null)
    const { ctx, registrations } = fakeCtx()
    registerGitRoutes(ctx as never, { status } as never)
    const prefix = registrations.find((row) => row.kind === 'prefix')!

    const result = await drive(prefix.handler, '/git/status', {
      remoteAddress: '192.168.1.20',
      host: '192.168.1.10:3000',
      body: JSON.stringify({ path: '/w' }),
    })

    expect(result.status).toBe(403)
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(result.body)).toEqual({ error: 'forbidden: loopback-only' })
    expect(status).not.toHaveBeenCalled()
  })

  it('rejects non-loopback requests before method/content-type checks', async () => {
    const { ctx, registrations } = fakeCtx()
    registerGitRoutes(ctx as never, {} as never)
    const prefix = registrations.find((row) => row.kind === 'prefix')!

    const result = await drive(prefix.handler, '/git/status', {
      method: 'GET',
      remoteAddress: '192.168.1.20',
      host: '192.168.1.10:3000',
    })

    expect(result.status).toBe(403)
    expect(JSON.parse(result.body)).toEqual({ error: 'forbidden: loopback-only' })
  })

  it('rejects non-loopback SSE before opening the stream', async () => {
    const status = vi.fn(async () => null)
    const { ctx, registrations } = fakeCtx()
    registerGitRoutes(ctx as never, { status } as never)
    const sse = registrations.find((row) => row.kind === 'exact')!

    const result = await drive(sse.handler, '/git/events?path=%2Fw', {
      method: 'GET',
      remoteAddress: '192.168.1.20',
      host: '192.168.1.10:3000',
    })

    expect(result.status).toBe(403)
    expect(JSON.parse(result.body)).toEqual({ error: 'forbidden: loopback-only' })
    expect(result.writes.join('')).not.toContain('retry:')
    expect(status).not.toHaveBeenCalled()
  })

  it('still opens the SSE stream for loopback clients', async () => {
    const closeHandlers: Array<() => void> = []
    const { ctx, registrations } = fakeCtx()
    registerGitRoutes(ctx as never, { status: async () => null } as never)
    const sse = registrations.find((row) => row.kind === 'exact')!

    const result = await drive(sse.handler, '/git/events?path=%2Fw', {
      method: 'GET',
      on: (event, handler) => {
        if (event === 'close') closeHandlers.push(handler)
      },
    })

    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(result.writes.join('')).toContain('retry: 2000')
    for (const close of closeHandlers) close()
  })
})
