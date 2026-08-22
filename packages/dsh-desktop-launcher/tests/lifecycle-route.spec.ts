/** Managed browser lifecycle route contracts. */

import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { LIFECYCLE_LEASE_MS, LIFECYCLE_RELEASE_GRACE_MS, makeLauncherLifecycleRoute } from '../src/lifecycle-routes.ts'

function request(body: unknown, method = 'POST'): IncomingMessage {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage
  req.method = method
  return req
}

function response() {
  const state = { status: 0, body: '' }
  const res = {
    writeHead: (status: number) => { state.status = status },
    end: (body?: string) => { state.body = body ?? '' },
  } as unknown as ServerResponse
  return { state, res }
}

function harness() {
  let now = 0
  const timers = new Map<number, { fn: () => void; due: number }>()
  let sequence = 0
  const exits: number[] = []
  const lifecycle = makeLauncherLifecycleRoute({
    token: 'secret',
    requestExit: code => { exits.push(code) },
    fence: () => true,
    clock: {
      now: () => now,
      schedule: (fn, ms) => { const id = ++sequence; timers.set(id, { fn, due: now + ms }); return id },
      cancel: id => { timers.delete(id as number) },
    },
  })
  const advance = async (ms: number) => {
    now += ms
    let due: Array<[number, { fn: () => void; due: number }]>
    do {
      due = [...timers].filter(([, timer]) => timer.due <= now)
      for (const [id, timer] of due) { timers.delete(id); timer.fn() }
    } while (due.length > 0)
    await Promise.resolve()
  }
  const send = async (body: unknown) => {
    const { state, res } = response()
    await lifecycle.route.handler(request(body), res)
    return state
  }
  return { exits, send, advance, dispose: lifecycle.dispose }
}

const message = (action: 'attach' | 'heartbeat' | 'release', clientId = 'client-0001') => ({ action, token: 'secret', clientId })

describe('launcher lifecycle route', () => {
  it('rejects a wrong ownership token', async () => {
    const h = harness()
    const state = await h.send({ ...message('attach'), token: 'wrong' })
    expect(state.status).toBe(403)
    expect(h.exits).toEqual([])
  })

  it('exits after the final browser releases its lease and grace elapses', async () => {
    const h = harness()
    expect((await h.send(message('attach'))).status).toBe(200)
    await h.send(message('release'))
    await h.advance(LIFECYCLE_RELEASE_GRACE_MS - 1)
    expect(h.exits).toEqual([])
    await h.advance(1)
    expect(h.exits).toEqual([0])
  })

  it('keeps the host alive while another tab remains attached', async () => {
    const h = harness()
    await h.send(message('attach', 'client-0001'))
    await h.send(message('attach', 'client-0002'))
    await h.send(message('release', 'client-0001'))
    await h.advance(LIFECYCLE_RELEASE_GRACE_MS)
    expect(h.exits).toEqual([])
    await h.send(message('release', 'client-0002'))
    await h.advance(LIFECYCLE_RELEASE_GRACE_MS)
    expect(h.exits).toEqual([0])
  })

  it('cancels final-release shutdown when a refreshed page reattaches', async () => {
    const h = harness()
    await h.send(message('attach', 'client-old'))
    await h.send(message('release', 'client-old'))
    await h.advance(LIFECYCLE_RELEASE_GRACE_MS - 1)
    await h.send(message('attach', 'client-new'))
    await h.advance(1)
    expect(h.exits).toEqual([])
  })

  it('expires a crashed browser whose heartbeat stops', async () => {
    const h = harness()
    await h.send(message('attach'))
    await h.advance(LIFECYCLE_LEASE_MS)
    expect(h.exits).toEqual([0])
  })
})
