/**
 * Page-wide body mutation hub: one native observer regardless of how many
 * family plugins subscribe, coalesced per animation frame, with records
 * delivered and clean teardown of the last subscriber.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeBodyMutations } from '../client/body-mutations.ts'

const HUB_KEY = Symbol.for('dsh-web.body-mutation-hub')

interface MutationObserverSpy {
  instances: number
  observeCalls: number
  disconnects: number
}

/** Count native observers without changing their behaviour. */
function spyOnMutationObserver(): MutationObserverSpy {
  const Native = globalThis.MutationObserver
  const spy: MutationObserverSpy = { instances: 0, observeCalls: 0, disconnects: 0 }
  class Counting extends Native {
    observe(target: Node, options?: MutationObserverInit): void {
      spy.observeCalls += 1
      super.observe(target, options)
    }
    override disconnect(): void {
      spy.disconnects += 1
      super.disconnect()
    }
  }
  vi.stubGlobal('MutationObserver', Counting as unknown as typeof MutationObserver)
  spy.instances = 0
  // The hub counts instances through the constructor.
  const Original = Counting
  const proxy = new Proxy(Original, {
    construct(target, args) {
      spy.instances += 1
      return Reflect.construct(target, args)
    },
  })
  vi.stubGlobal('MutationObserver', proxy)
  return spy
}

/** Controllable animation-frame queue (jsdom's rAF timing is not deterministic here). */
function stubAnimationFrame(): { flush: () => void; pending: () => number } {
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.push(callback)
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return {
    flush: () => {
      const batch = queue.splice(0, queue.length)
      for (const callback of batch) callback(0)
    },
    pending: () => queue.length,
  }
}

function clearHub(): void {
  const registry = globalThis as unknown as Record<symbol, unknown>
  const hub = registry[HUB_KEY] as { observer?: { disconnect(): void } } | undefined
  hub?.observer?.disconnect()
  delete registry[HUB_KEY]
}

describe('subscribeBodyMutations', () => {
  beforeEach(() => {
    clearHub()
  })

  afterEach(() => {
    clearHub()
    vi.unstubAllGlobals()
  })

  it('uses exactly one native observer for many subscribers', () => {
    const spy = spyOnMutationObserver()
    stubAnimationFrame()
    const disposers = [
      subscribeBodyMutations(() => {}),
      subscribeBodyMutations(() => {}),
      subscribeBodyMutations(() => {}),
    ]
    expect(spy.instances).toBe(1)
    expect(spy.observeCalls).toBe(1)
    disposers.forEach(dispose => dispose())
  })

  it('delivers childList mutations to every subscriber, coalesced per frame', async () => {
    spyOnMutationObserver()
    const frames = stubAnimationFrame()
    const first = vi.fn()
    const second = vi.fn()
    const disposeFirst = subscribeBodyMutations(first)
    const disposeSecond = subscribeBodyMutations(second)

    const node = document.createElement('div')
    document.body.appendChild(node)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(frames.pending()).toBe(1)

    frames.flush()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    const records = first.mock.calls[0]?.[0] as MutationRecord[]
    expect(records.length).toBeGreaterThan(0)
    expect(records.some(record => record.type === 'childList')).toBe(true)

    // Further mutations in a later frame are delivered again, not lost.
    const another = document.createElement('span')
    document.body.appendChild(another)
    await new Promise(resolve => setTimeout(resolve, 0))
    frames.flush()
    expect(first).toHaveBeenCalledTimes(2)

    disposeFirst()
    disposeSecond()
  })

  it('keeps working for the remaining subscribers when one throws', async () => {
    spyOnMutationObserver()
    const frames = stubAnimationFrame()
    const healthy = vi.fn()
    const disposeThrower = subscribeBodyMutations(() => { throw new Error('boom') })
    const disposeHealthy = subscribeBodyMutations(healthy)

    document.body.appendChild(document.createElement('div'))
    await new Promise(resolve => setTimeout(resolve, 0))
    frames.flush()
    expect(healthy).toHaveBeenCalledTimes(1)

    disposeThrower()
    disposeHealthy()
  })

  it('drops the hub when the last subscriber leaves and re-creates it after', () => {
    const spy = spyOnMutationObserver()
    stubAnimationFrame()
    const disposeFirst = subscribeBodyMutations(() => {})
    const disposeSecond = subscribeBodyMutations(() => {})
    expect(spy.instances).toBe(1)

    disposeFirst()
    expect(spy.disconnects).toBe(0)
    disposeSecond()
    expect(spy.disconnects).toBe(1)

    const disposeThird = subscribeBodyMutations(() => {})
    expect(spy.instances).toBe(2)
    disposeThird()
  })

  it('returns an inert disposer when MutationObserver is unavailable', () => {
    vi.stubGlobal('MutationObserver', undefined)
    const dispose = subscribeBodyMutations(() => {})
    expect(() => dispose()).not.toThrow()
  })
})
