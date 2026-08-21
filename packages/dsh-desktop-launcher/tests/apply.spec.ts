import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

/**
 * The host half gates every surface on the resolved `enabled`: with the
 * plugin off (the default) nothing registers; turning it on mounts the
 * create/shutdown routes and the system-prompt announcement. The settings
 * service is faked to feed one resolved value per case.
 */

/** The fake settings service feeds installSettingsSection one static scope. */
interface FakeScope {
  get: () => Record<string, unknown>
  watch: () => () => void
}

function makeScope(value: Record<string, unknown>): FakeScope {
  return {
    get: () => value,
    watch: () => () => {},
  }
}

/** Fiber disposers collected from the fake ctx; run after each case to reset mountOnce. */
const disposers: Array<() => void> = []

function makeCtx(scope: FakeScope) {
  const registered = new Set<string>()
  const announced = new Set<string>()
  const effect = (fn: () => unknown) => {
    const disposer = fn()
    disposers.push(disposer as () => void)
    return disposer
  }
  const ctx = {
    effect,
    get: () => undefined,
    // dsh-settings checks ctx.fiber.state when a registration tears down.
    fiber: { state: 0 },
    inject: (_deps: string[], fn: (sctx: { settings: { register: () => FakeScope }; effect: typeof effect }) => void) => {
      fn({ settings: { register: () => scope }, effect })
      return () => {}
    },
    webServer: {
      register: (route: { path: string }) => {
        registered.add(route.path)
        return () => {}
      },
    },
    systemPrompt: {
      section: (section: { name: string }) => {
        announced.add(section.name)
        return () => {}
      },
    },
  }
  return { ctx: ctx as never, registered, announced }
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()!()
})

describe('desktop-launcher host apply', () => {
  it('mounts nothing while the plugin is off', () => {
    const { ctx, registered, announced } = makeCtx(makeScope({ enabled: false }))
    apply(ctx, {})
    expect(registered.size).toBe(0)
    expect(announced.size).toBe(0)
  })

  it('mounts the routes and an explicitly enabled announcement', () => {
    const { ctx, registered, announced } = makeCtx(makeScope({ enabled: true, announceToAgent: true }))
    apply(ctx, {})
    expect(registered).toEqual(new Set([
      '/api/dsh-desktop-launcher/create',
      '/api/dsh-desktop-launcher/shutdown',
    ]))
    expect(announced).toEqual(new Set(['plugin:dsh-desktop-launcher']))
  })
})
