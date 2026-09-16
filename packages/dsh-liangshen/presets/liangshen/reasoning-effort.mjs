/**
 * reasoning-effort — the LiangShen preset's phase-aware reasoning budget.
 *
 * The mode's working discipline asks for deep architectural reasoning while a
 * plan is being formed and for fast, single-step tool work once execution is
 * under way. This plugin turns that intention into the request's own
 * `reasoningEffort` by joining the host's `agent/request` waterfall, which the
 * API catalog documents as "Replace the frozen call configuration" and dispatches
 * agent-scoped: the listener receives `{ agent, turn, step, signal }` and returns
 * the `LlmCallConfig` the request will use.
 *
 * TWO CONSTRAINTS SHAPE THE DESIGN:
 *
 * 1. `reasoningEffort` is a branded id whose legal values are the levels the
 *    deployment DECLARED for the routed model (the DeepSeek adapter accepts
 *    `'off' | 'low' | 'high' | 'max'`; a profile may narrow that set, and a model
 *    with `reasoningEfforts: false` accepts none). A plugin cannot invent a level,
 *    so the configured values are validated against that set at load time. The
 *    plugin deliberately does NOT try to verify the level against the route at
 *    request time: the harness exposes no query for a model's declared levels, so
 *    a "guard" could never fire and would only suggest a check that does not
 *    happen. A deployment whose route rejects a configured level surfaces that as
 *    its own call failure, and the operator narrows the configuration.
 *
 * 2. The effort is part of the request-header snapshot that governs cache reuse
 *    (`dsh-llm/call-config`), so every change invalidates the cached prefix once.
 *    Switching on EVERY turn would therefore pay a cache miss per turn to save
 *    reasoning tokens. This plugin switches only at a genuine phase boundary —
 *    entering or leaving plan mode — and leaves the effort alone in between, so a
 *    long execution stretch keeps one effort and one stable prefix.
 */

import { planModeState } from './working-context.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'liangshen-reasoning-effort'

/** The waterfall that replaces one request's frozen call configuration. */
export const REQUEST_EVENT = 'agent/request'

/**
 * The levels this plugin is willing to request. The DeepSeek adapter's own set;
 * a deployment that declares fewer leaves the request untouched instead of
 * sending a level the route does not offer.
 */
export const KNOWN_EFFORTS = ['off', 'low', 'high', 'max']

/** Default planning effort: deep enough to design, not the maximum. */
export const DEFAULT_PLANNING_EFFORT = 'high'

/** Default execution effort: one notch down, for single-step tool work. */
export const DEFAULT_EXECUTION_EFFORT = 'low'

/** Validate one configured effort against the accept set. */
function effortValue(value, field, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !KNOWN_EFFORTS.includes(value)) {
    throw new TypeError(`${name}: ${field} must be one of ${JSON.stringify(KNOWN_EFFORTS)}`)
  }
  return value
}

/** Session events, tolerating both snapshotEvents() and events array. */
function sessionEvents(session) {
  if (Array.isArray(session?.events)) return session.events
  if (typeof session?.snapshotEvents === 'function') return session.snapshotEvents()
  return []
}

/**
 * Whether this request belongs to the planning phase. Plan mode is authoritative
 * when the log says so; before any `plan/mode` event the session is in its first
 * turn, which is where the shape of the work is decided.
 */
export function isPlanningRequest(events, turn) {
  const plan = planModeState(events)
  if (plan.seen) return plan.active
  return turn === undefined || turn <= 1
}

/**
 * The effort one request should carry, or undefined when nothing should change.
 *
 * The level is taken from configuration alone. Whether the routed model actually
 * accepts it is the deployment's business: the harness exposes no query for a
 * model's declared levels (the llm service offers providers, models and call
 * preparation, not the effort set), so this plugin does not pretend to check it.
 * A route that rejects the level fails its own call, which is visible, rather
 * than being silently masked by a guard that can never fire.
 */
export function effortForPhase(options) {
  const { events, turn, planning, execution } = options
  const wanted = isPlanningRequest(events, turn) ? planning : execution
  if (wanted === undefined) return undefined
  return wanted
}

/**
 * Register the request-waterfall listener that swaps the reasoning budget at a
 * plan-mode boundary.
 */
export function apply(ctx, config) {
  const planning = effortValue(config?.planningEffort, 'planningEffort', DEFAULT_PLANNING_EFFORT)
  const execution = effortValue(config?.executionEffort, 'executionEffort', DEFAULT_EXECUTION_EFFORT)

  ctx.on(REQUEST_EVENT, async (payload, next) => {
    const current = await next()
    try {
      const agent = payload?.agent
      const events = sessionEvents(agent?.session)
      const wanted = effortForPhase({ events, turn: payload?.turn, planning, execution })
      // Only replace the config at a phase boundary: this field governs cache
      // reuse, so restating the same value (or flipping it every turn) is worse
      // than leaving the frozen header alone.
      if (wanted === undefined || current?.reasoningEffort === wanted) return current
      return { ...current, reasoningEffort: wanted }
    } catch {
      // A listener that cannot decide must not fail the request: the frozen
      // configuration the machine would have used stands.
      return current
    }
  })
}
