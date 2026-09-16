import { describe, expect, test, vi } from 'vitest'

import {
  DEFAULT_EXECUTION_EFFORT,
  DEFAULT_PLANNING_EFFORT,
  KNOWN_EFFORTS,
  REQUEST_EVENT,
  apply,
  effortForPhase,
  isPlanningRequest,
  name,
} from '../presets/liangshen/reasoning-effort.mjs'

type Listener = (payload: any, next: () => Promise<any>) => Promise<any>

/**
 * One live context. The phase switch defaults to OFF, so every listener test
 * turns it on explicitly: a helper that silently enabled it would hide the one
 * behavior the switch exists for. Use \`registerRaw\` to observe the off state.
 */
function register(config: Record<string, unknown> = {}, services: Record<string, unknown> = {}) {
  const harness = registerRaw({ autoEffortByPhase: true, ...config }, services)
  const listener = harness.listeners.get(REQUEST_EVENT)
  expect(listener).toBeDefined()
  return { listener: listener!, listeners: harness.listeners }
}

/** Register without assuming the switch, so its off state is observable. */
function registerRaw(config: Record<string, unknown> = {}, services: Record<string, unknown> = {}) {
  const listeners = new Map<string, Listener>()
  const ctx = {
    on(event: string, callback: Listener) { listeners.set(event, callback) },
    get: (service: string) => services[service],
  }
  apply(ctx, config)
  return { listeners }
}

/** Run one request through the waterfall with a frozen config the machine would use. */
function request(harness: { listener: Listener }, payload: any, frozen: any = { provider: 'p', model: 'm', reasoningEffort: 'max' }) {
  return harness.listener(payload, async () => frozen)
}

const PLAN_ON = [{ type: 'plan/mode', data: { active: true } }]
const PLAN_OFF = [{ type: 'plan/mode', data: { active: false } }]

/** One agent whose session log is the supplied events. */
function agentOf(events: unknown[] = []) {
  return { session: { snapshotEvents: () => events } }
}

describe('liangshen-reasoning-effort', () => {
  test('exports a diagnostic plugin name and the request waterfall it joins', () => {
    expect(name).toBe('liangshen-reasoning-effort')
    expect(REQUEST_EVENT).toBe('agent/request')
    expect(KNOWN_EFFORTS).toEqual(['off', 'low', 'high', 'max'])
    expect(DEFAULT_PLANNING_EFFORT).toBe('high')
    expect(DEFAULT_EXECUTION_EFFORT).toBe('low')
  })

  test('reads the planning phase from the log, and treats a first turn as planning', () => {
    expect(isPlanningRequest(PLAN_ON, 5)).toBe(true)
    expect(isPlanningRequest(PLAN_OFF, 5)).toBe(false)
    // No plan/mode event at all: the session is still deciding what the work is.
    expect(isPlanningRequest([], 1)).toBe(true)
    expect(isPlanningRequest([], undefined)).toBe(true)
    expect(isPlanningRequest([], 4)).toBe(false)
  })

  test('resolves one effort per phase from configuration alone', () => {
    const base = { planning: 'high', execution: 'low' }
    expect(effortForPhase({ ...base, events: PLAN_ON, turn: 3 })).toBe('high')
    expect(effortForPhase({ ...base, events: PLAN_OFF, turn: 3 })).toBe('low')
    // First turn with no plan/mode event is planning.
    expect(effortForPhase({ ...base, events: [], turn: 1 })).toBe('high')
    // Nothing configured for the phase means nothing to apply.
    expect(effortForPhase({ events: PLAN_ON, turn: 3, planning: undefined, execution: undefined })).toBeUndefined()
  })

  test('does not second-guess the route: no level check exists at request time', () => {
    // The harness exposes no query for a model's declared levels, so the plugin
    // takes the configured level as given. A route that rejects it fails its own
    // call, visibly, instead of a guard that can never fire masking the misuse.
    const result = effortForPhase({ events: PLAN_ON, turn: 3, planning: 'high', execution: 'low' })
    expect(result).toBe('high')
  })

  test('replaces the frozen configuration when the phase and the level differ', async () => {
    const harness = register()
    const planned = await request(harness, { agent: agentOf(PLAN_ON), turn: 2 })
    expect(planned.reasoningEffort).toBe('high')
    // The rest of the frozen config travels untouched.
    expect(planned.provider).toBe('p')
    expect(planned.model).toBe('m')

    const executing = await request(harness, { agent: agentOf(PLAN_OFF), turn: 7 })
    expect(executing.reasoningEffort).toBe('low')
  })

  test('leaves the configuration alone when it already carries the wanted level', async () => {
    const harness = register()
    const frozen = { provider: 'p', model: 'm', reasoningEffort: 'high' }
    // Identity, not just equality: an unchanged request must not be replaced, or
    // the header snapshot would churn and invalidate the cached prefix.
    const result = await request(harness, { agent: agentOf(PLAN_ON), turn: 2 }, frozen)
    expect(result).toBe(frozen)
  })

  test('holds one effort across a long execution stretch instead of flipping per turn', async () => {
    const harness = register()
    const frozen = { provider: 'p', model: 'm', reasoningEffort: 'low' }
    for (const turn of [4, 5, 6, 7, 8]) {
      const result = await request(harness, { agent: agentOf(PLAN_OFF), turn }, frozen)
      expect(result).toBe(frozen)
    }
  })

  test('applies the configured level without consulting the route', async () => {
    // No llm service is available in this context at all: the switch still lands,
    // because the plugin takes the configured level as given.
    const harness = register()
    const result = await request(harness, { agent: agentOf(PLAN_ON), turn: 2 })
    expect(result.reasoningEffort).toBe('high')
  })

  test('honors configured phase levels and rejects unknown ones', () => {
    const harness = register({ planningEffort: 'max', executionEffort: 'off' })
    expect(harness.listeners.size).toBe(1)
    expect(() => register({ planningEffort: 'very-high' })).toThrow(/planningEffort must be one of/)
    expect(() => register({ executionEffort: 75 })).toThrow(/executionEffort must be one of/)
  })

  test('the phase switch is off by default and registers nothing while off', () => {
    // Off is the default: no config at all must still mean "do not touch requests".
    expect(registerRaw().listeners.size).toBe(0)
    expect(registerRaw({ autoEffortByPhase: false }).listeners.size).toBe(0)
    // An explicit on is the only thing that subscribes.
    expect(registerRaw({ autoEffortByPhase: true }).listeners.size).toBe(1)
    // A truthy non-boolean does not silently enable it.
    expect(registerRaw({ autoEffortByPhase: 'yes' }).listeners.size).toBe(0)
  })

  test('never fails the request: an unreadable session leaves it frozen', async () => {
    const frozen = { provider: 'p', model: 'm', reasoningEffort: 'max' }
    // An agent whose session blows up while folding yields the frozen config.
    const broken = register()
    const exploding = { session: { snapshotEvents: () => { throw new Error('boom') } } }
    expect(await request(broken, { agent: exploding, turn: 2 }, frozen)).toBe(frozen)
    // A session that simply reports no events is not an error: with no plan/mode
    // record the fold falls back to the first-turn rule, which is planning.
    const empty = await request(broken, { agent: { session: null }, turn: 1 }, frozen)
    expect(empty.reasoningEffort).toBe('high')
  })

  test('tolerates a payload with no agent at all', async () => {
    const harness = register()
    const frozen = { provider: 'p', model: 'm', reasoningEffort: 'low' }
    const result = await request(harness, { turn: 1 }, frozen)
    expect(result.reasoningEffort).toBe('high')
  })
})
