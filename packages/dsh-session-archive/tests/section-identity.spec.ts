/**
 * Section-identity contract for the 2026-09-15 native-first decision: the
 * plugin takes over the OFFICIAL archived-sessions settings section (the id
 * and order that @deepseek-ai/dsh-client-ui-settings-unarchive-sessions seats)
 * instead of registering a parallel first-level entry, and dsh-web-all retires
 * the official row. A regression here puts two near-identical archive entries
 * back into Settings.
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'

interface Registration {
  name: string
  options: Record<string, unknown>
}

/** Mount the browser half against a capture-only ctx. */
function mountClient(): Registration[] {
  const registrations: Registration[] = []
  const settingsScope = {
    get: () => undefined,
    set: async () => {},
    subscribe: () => () => {},
    getSnapshot: () => ({}),
  }
  const ctx = {
    effect: (run: () => unknown) => {
      run()
      return () => {}
    },
    get: () => undefined,
    settingsScope: { bind: () => settingsScope },
    locale: {
      register: () => () => {},
      bind: () => (key: string) => (zh as Record<string, string>)[key] ?? key,
    },
    slots: {
      inject: (_name: string, run: () => unknown) => run(),
      register: (options: Record<string, unknown>) => {
        registrations.push({ name: String(options.name), options })
        return () => {}
      },
    },
  }
  apply(ctx as never)
  return registrations
}

function section(): Registration | undefined {
  return mountClient().find((entry) => entry.name === 'settings.section')
}

describe('archived-sessions section identity', () => {
  it('seats the official section id and order instead of a parallel entry', () => {
    const seated = section()
    expect(seated).toBeDefined()
    expect(seated?.options.id).toBe('archived-sessions')
    expect(seated?.options.order).toBe(25)
  })

  it('keeps the superseded id out of the plugin so no second entry can exist', () => {
    const seated = section()
    expect(seated?.options.id).not.toBe('dsh-session-archive')
  })

  it('labels the single entry with the archived-sessions nav copy', () => {
    const label = section()?.options.label as (() => string) | undefined
    expect(typeof label).toBe('function')
    expect(label?.()).toBe('已归档会话')
    expect(en['arch.nav']).toBe('Archived sessions')
  })
})
