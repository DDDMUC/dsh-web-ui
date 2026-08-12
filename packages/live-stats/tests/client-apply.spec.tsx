import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'

describe('live-stats client apply', () => {
  it('registers the plugin settings card and nothing into any conversation seat', async () => {
    const injected: string[] = []
    const ctx = {
      effect: (fn: () => unknown) => fn(),
      locale: { register: () => () => {}, bind: () => (key: string) => key },
      slots: {
        inject: (key: string) => { injected.push(key); return () => {} },
        register: () => () => {},
      },
      settingsScope: {
        bind: () => ({
          getSnapshot: () => ({ status: 'unavailable' as const, writable: false }),
          subscribe: () => () => {},
          set: async () => {},
          unset: async () => {},
        }),
      },
    }
    apply(ctx as never)
    // The card mounts into the Web UI plugin group; the TPS group lives in the
    // ui-conversation stats line, so nothing targets a conversation seat.
    expect(injected).toEqual(['web-ui.plugin.item'])
  })
})
