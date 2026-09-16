import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPluginCard, officialPluginCardSeatDeclared } from '../src/client/plugin-card-seat.ts'

/** Minimal client context double for the seat probe. */
function context(options: { officialSeat?: boolean; refuse?: boolean } = {}): {
  ctx: unknown
  injected: string[]
  registrations: Array<Record<string, unknown>>
  warns: string[]
} {
  const injected: string[] = []
  const registrations: Array<Record<string, unknown>> = []
  const warns: string[] = []
  const ctx = {
    slots: {
      spec: (key: string) => (options.officialSeat === true && key === 'settings.plugin.item' ? { kind: 'keyed' } : undefined),
      inject: (key: string, factory: () => unknown) => {
        injected.push(key)
        factory()
        return () => {}
      },
      register: (entry: Record<string, unknown>) => {
        if (options.refuse === true) throw new Error('slot "settings.plugin.item" is not declared')
        registrations.push(entry)
        return () => {}
      },
    },
  }
  return { ctx, injected, registrations, warns }
}

const Card = (): null => null

afterEach(() => {
  vi.restoreAllMocks()
})

describe('installPluginCard (issue #1589)', () => {
  it('contributes to the official keyed seat when the host declares it', () => {
    const harness = context({ officialSeat: true })
    installPluginCard(harness.ctx as never, {
      namespace: 'remote-web-ui',
      id: 'remote-web-ui',
      order: 90,
      locale: 'remote',
      inject: () => ({ ready: true }),
      component: Card,
    })
    expect(harness.injected).toEqual(['settings.plugin.item'])
    expect(harness.registrations).toHaveLength(1)
    expect(harness.registrations[0]).toMatchObject({ name: 'settings.plugin.item', key: 'remote-web-ui' })
    expect(harness.registrations[0]).not.toHaveProperty('id')
  })

  it('contributes to the family list seat when the official seat is absent', () => {
    const harness = context()
    installPluginCard(harness.ctx as never, {
      namespace: 'remote-web-ui',
      id: 'remote-web-ui',
      order: 90,
      locale: 'remote',
      component: Card,
    })
    expect(harness.injected).toEqual(['web-ui.plugin.item'])
    expect(harness.registrations[0]).toMatchObject({ name: 'web-ui.plugin.item', id: 'remote-web-ui', order: 90 })
    expect(harness.registrations[0]).not.toHaveProperty('key')
  })

  it('reports a refused registration instead of leaving the card silently missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const harness = context({ officialSeat: true, refuse: true })
    installPluginCard(harness.ctx as never, {
      namespace: 'remote-web-ui',
      id: 'remote-web-ui',
      locale: 'remote',
      component: Card,
    })
    expect(harness.registrations).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('settings.plugin.item')
  })

  it('treats an unreadable slot surface as "official seat absent"', () => {
    expect(officialPluginCardSeatDeclared({ slots: {} } as never)).toBe(false)
    expect(officialPluginCardSeatDeclared({
      slots: { spec: () => { throw new Error('older service surface') } },
    } as never)).toBe(false)
    expect(officialPluginCardSeatDeclared({ slots: { spec: () => ({ kind: 'keyed' }) } } as never)).toBe(true)
  })
})
