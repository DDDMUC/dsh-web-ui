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
 * THE SWITCH. `autoEffortByPhase` defaults to OFF and gates everything: off
 * registers no listener, so the preset does not touch the request and whatever
 * the model picker carries stands. Taking over a session's reasoning level is a
 * behavior change the user opts into, not one they discover.
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

import { resultIsError } from './paging.mjs'
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

/**
 * Default review effort: the level used after a failed step, until a fix lands.
 * Falls back to the planning level when unset, because diagnosing a failure is
 * the same kind of work as forming a plan.
 */
export const DEFAULT_REVIEW_EFFORT = undefined

/** Validate one configured effort against the accept set (an absent value keeps the fallback). */
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
 * Whether the session currently sits in the review that follows a failure.
 *
 * The signal is the tool log: a failed dispatch opens a review stretch, and the
 * next SUCCESSFUL dispatch closes it. That pairing is what keeps the switch from
 * toggling on every call — inside one 'fix it' loop the level stays deep from the
 * failure until the fix actually works, instead of flapping between levels as
 * each command lands.
 *
 * A turn boundary reopens nothing: the stretch is a property of the log, so a
 * resume or a compaction folds the same state back. Only the tool events matter,
 * which is why a session that never fails never enters the stretch at all.
 */
export function isReviewRequest(events) {
  const list = Array.isArray(events) ? events : []
  // Pair every result with its call first, so a failure can be attributed to the
  // call that produced it rather than to positional order.
  const failed = new Set()
  for (const event of list) {
    if (event?.type !== 'tool/result') continue
    const callId = event.data?.message?.source?.callId ?? event.data?.callId
    if (callId !== undefined && resultIsError(event.data)) failed.add(String(callId))
  }
  let reviewing = false
  for (const event of list) {
    if (event?.type !== 'tool/call') continue
    const callId = event.data?.callId
    if (callId === undefined) continue
    reviewing = failed.has(String(callId))
  }
  return reviewing
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
  const { events, turn, planning, execution, review } = options
  // Planning first: an explicit plan mode outranks a failure-derived stretch,
  // because the user is deliberately deciding the work rather than reacting to it.
  if (isPlanningRequest(events, turn)) return planning
  // A failure opens a review stretch; the fix that clears it returns the session
  // to execution. The review level defaults to the planning one when unset.
  if (isReviewRequest(events)) return review ?? planning
  return execution
}

/**
 * Register the request-waterfall listener that swaps the reasoning budget at a
 * plan-mode boundary — but only when the phase switch is on.
 *
 * The switch defaults to OFF, and off registers no listener at all: the host
 * dispatches the waterfall for every request, so a listener that merely calls
 * `next()` would still be work on the hot path for a feature the operator never
 * asked for. Leaving the event unsubscribed makes the disabled state cost
 * nothing and guarantees the request is byte-for-byte what the deployment would
 * have sent anyway.
 */
export function apply(ctx, config) {
  const auto = config?.autoEffortByPhase === true
  if (!auto) return
  const planning = effortValue(config?.planningEffort, 'planningEffort', DEFAULT_PLANNING_EFFORT)
  const execution = effortValue(config?.executionEffort, 'executionEffort', DEFAULT_EXECUTION_EFFORT)
  const review = effortValue(config?.reviewEffort, 'reviewEffort', DEFAULT_REVIEW_EFFORT)

  ctx.on(REQUEST_EVENT, async (payload, next) => {
    const current = await next()
    try {
      const agent = payload?.agent
      const events = sessionEvents(agent?.session)
      const wanted = effortForPhase({ events, turn: payload?.turn, planning, execution, review })
      // Replace the config only when the phase actually asks for a different
      // level: restating the same value would log a header change for nothing,
      // and the level is request-header state the host treats as cache-relevant.
      if (wanted === undefined || current?.reasoningEffort === wanted) return current
      return { ...current, reasoningEffort: wanted }
    } catch {
      // A listener that cannot decide must not fail the request: the frozen
      // configuration the machine would have used stands.
      return current
    }
  })
}
