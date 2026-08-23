/**
 * The DSH Market seat machine (shared/client/settings/market-tab.ts):
 * the two-seat registration discipline of the category cards. The hub
 * declares `dsh-market.tab`; a card registers as a tab when the hub is
 * installed and falls back to its own `settings.section` entry standalone.
 * Tests drive a minimal slots fake that mirrors the real declaration ordering
 * (inject waits fire on declare; register commits synchronously).
 */

import { describe, expect, it, vi } from 'vitest'
import { installMarketTabSeat, MARKET_TAB_KEY } from '../client/settings/market-tab.ts'

interface FakeEntry {
  name: string
  id: string
  unregistered: boolean
}

function makeCtx() {
  const declared = new Set<string>()
  const waits: Record<string, Array<() => void>> = {}
  const entries: FakeEntry[] = []
  const effects: Array<(() => void) | null> = []
  const ctx = {
    slots: {
      inject(name: string, cb: () => void): () => void {
        let effect: (() => void) | null = null
        const run = (): void => {
          const result = cb()
          if (typeof result === 'function') effect = result
        }
        if (declared.has(name)) run()
        else (waits[name] ??= []).push(run)
        return () => {
          effect?.()
          effect = null
        }
      },
      register(options: { name: string; id?: string }): () => void {
        const entry: FakeEntry = { name: options.name, id: options.id ?? '', unregistered: false }
        entries.push(entry)
        return () => { entry.unregistered = true }
      },
    },
    declare(name: string): void {
      declared.add(name)
      for (const wait of (waits[name] ?? []).splice(0)) wait()
    },
    entries,
    effectDisposer(name: string): (() => void) | null {
      return effects.find(() => true) ?? null
    },
  }
  return ctx
}

function seatProbe(ctx: ReturnType<typeof makeCtx>): {
  registerTab: ReturnType<typeof vi.fn>
  registerSection: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
} {
  const registerTab = vi.fn(() => ctx.slots.register({ name: MARKET_TAB_KEY, id: 'probe-tab' }))
  const registerSection = vi.fn(() => ctx.slots.register({ name: 'settings.section', id: 'probe-section' }))
  const release = vi.fn(() => {})
  const seat = {
    registerTab: registerTab as unknown as () => () => void,
    registerSection: registerSection as unknown as () => () => void,
    release: release as unknown as () => void,
  }
  return { registerTab, registerSection, release }
}

describe('installMarketTabSeat', () => {
  it('fallback-only standalone: registers the section entry and never the tab', () => {
    const ctx = makeCtx()
    const probe = seatProbe(ctx)
    installMarketTabSeat(ctx as never, probe as never)
    ctx.declare('settings.section')
    expect(probe.registerSection).toHaveBeenCalledTimes(1)
    expect(probe.registerTab).not.toHaveBeenCalled()
    expect(ctx.entries.map((e) => e.name)).toEqual(['settings.section'])
  })

  it('section-first then hub takeover: tab registers, fallback unregisters, no release', () => {
    const ctx = makeCtx()
    const probe = seatProbe(ctx)
    installMarketTabSeat(ctx as never, probe as never)
    ctx.declare('settings.section')
    expect(ctx.entries).toHaveLength(1)
    ctx.declare(MARKET_TAB_KEY)
    expect(probe.registerTab).toHaveBeenCalledTimes(1)
    expect(ctx.entries).toHaveLength(2)
    // The fallback entry was unregistered by the takeover…
    expect(ctx.entries[0].unregistered).toBe(true)
    // …and the shared release did NOT fire (the tab now owns the controller).
    expect(probe.release).not.toHaveBeenCalled()
  })

  it('tab-first order: the section callback is a no-op', () => {
    const ctx = makeCtx()
    const probe = seatProbe(ctx)
    installMarketTabSeat(ctx as never, probe as never)
    ctx.declare(MARKET_TAB_KEY)
    ctx.declare('settings.section')
    expect(probe.registerTab).toHaveBeenCalledTimes(1)
    expect(probe.registerSection).not.toHaveBeenCalled()
    expect(ctx.entries.map((e) => e.name)).toEqual([MARKET_TAB_KEY])
  })

  it('release fires exactly once when the live tab seat dies (idempotent disposer)', () => {
    const ctx = makeCtx()
    const probe = seatProbe(ctx)
    const dispose = installMarketTabSeat(ctx as never, probe as never)
    ctx.declare(MARKET_TAB_KEY)
    dispose() // tab seat effect + section wait disposed
    dispose()
    expect(probe.release).toHaveBeenCalledTimes(1)
  })

  it('release fires when the sole section seat dies', () => {
    const ctx = makeCtx()
    const probe = seatProbe(ctx)
    const dispose = installMarketTabSeat(ctx as never, probe as never)
    ctx.declare('settings.section')
    dispose()
    expect(probe.release).toHaveBeenCalledTimes(1)
  })
})