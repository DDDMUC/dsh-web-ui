/**
 * guard — the LiangShen preset's runtime degeneration circuit breaker.
 *
 * Why this exists: DSH discussion #5976 documents a model-side generation
 * degeneration on DeepSeek-V4.1-Flash under very long context and max
 * reasoning effort — the agent emits turn after turn of zero-output
 * self-urging reasoning with no tool call, no automatic fuse, and the run
 * has to be killed by hand. The persona's reflection-fuse discipline cannot
 * stop it, because in that state the discipline text itself has fallen out of
 * the effective context. The only thing that works is an OUTSIDE force, and
 * the report's own conclusion is that this guard-layer gap can be filled by a
 * plugin without touching the DSH core. This plugin is that outside force.
 *
 * Two signals, both folded from the durable session event stream (never from
 * process memory, so resume and compaction rebuild the same verdict):
 *
 * - STALL: N consecutive assistant steps that carry reasoning but neither a
 *   tool call nor any visible reply text — the #5976 shape. Reading the
 *   reasoning TEXT is unnecessary (and impossible on routes that redact it);
 *   the block's character count is the objective "long thinking" measure.
 * - ECHO: the same tool called with the same arguments failing M times in a
 *   row with no success in between — the closed loop of repeating one broken
 *   call.
 *
 * On either signal the breaker FIRES once per episode:
 *  1. a circuit-breaker user message is injected at the next pre-step (the
 *     one channel guaranteed to reach the model, as durable as the working-
 *     context projection), telling the model the loop was interrupted and to
 *     close out or pick a materially different action;
 *  2. a temporary reasoning-effort step-down rides the `agent/request`
 *     waterfall for the next FEW requests (current level one notch down:
 *     max -> high -> low; anything else is left alone). Lowering the budget
 *     is the community-observed recovery move (r/DeepSeek 1whgo3e) and the
 *     official effort-cost curve puts the sweet spot below max. This is the
 *     ONLY moment this plugin rewrites a request: with no signal it never
 *     touches one, so prefix-cache stability and the user's explicit model-
 *     selector effort stay untouched — the constraint recorded in the Agent
 *     Note that removed the old phase-based switching.
 *
 * Recovery: a step with a tool call or a visible reply re-arms the breaker
 * and, once the step-down window has run its requests, the route's own effort
 * resumes unchanged. Thresholds are deliberately conservative — a false
 * interruption of real long thinking hurts more than a missed episode.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'liangshen-guard'

/** How many consecutive zero-output reasoning steps constitute a stall. */
export const DEFAULT_STALL_STEPS = 3

/** Minimum reasoning characters per step for that step to count as "long". */
export const DEFAULT_STALL_REASONING_CHARS = 2000

/** How many identical-argument failures in a row constitute an echo loop. */
export const DEFAULT_ECHO_FAILURES = 3

/** Requests the temporary effort step-down stays on for after firing. */
export const DEFAULT_STEP_DOWN_REQUESTS = 3

/** Steps the breaker stays quiet after firing once (no message spam). */
export const DEFAULT_REFIRE_COOLDOWN_STEPS = 5

/** The effort ladder a step-down walks along. Anything else is left alone. */
const EFFORT_LADDER = ['max', 'high', 'low']

/** Validate a positive-integer config value, or fall back when absent. */
function integerAtLeast(value, field, minimum, fallback) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name}: ${field} must be an integer >= ${minimum}`)
  }
  return value
}

/** Session events, tolerating both snapshotEvents() and events array. */
function sessionEvents(session) {
  if (Array.isArray(session?.events)) return session.events
  if (typeof session?.snapshotEvents === 'function') return session.snapshotEvents()
  return []
}

/** Reasoning characters one assistant/message event carries. */
function reasoningCharsOf(event) {
  let chars = 0
  for (const block of event?.data?.message?.content ?? []) {
    if (block?.type === 'reasoning') chars += String(block.text ?? '').length
  }
  return chars
}

/** Visible reply blocks (non-empty text) one assistant/message event carries. */
function visibleRepliesOf(event) {
  let count = 0
  for (const block of event?.data?.message?.content ?? []) {
    if (block?.type === 'text' && String(block.text ?? '').trim().length > 0) count += 1
  }
  return count
}

/** Stable signature for one tool call: name plus canonicalized arguments. */
function callSignature(event) {
  const tool = event?.data?.name
  if (typeof tool !== 'string') return undefined
  let args = event.data?.arguments
  if (typeof args === 'string') {
    try { args = JSON.parse(args) } catch { /* keep raw string */ }
  }
  let canonical
  try { canonical = JSON.stringify(args ?? null) } catch { canonical = String(args) }
  return `${tool}${canonical}`
}

/** The tool/result matching one callId carried an error. */
function isErrorResult(event) {
  if (event?.type !== 'tool/result') return false
  const data = event.data
  if (data?.error !== undefined && data.error !== null) return true
  const message = data?.message
  if (message?.isError === true) return true
  return false
}

/**
 * Fold the breaker verdict from the event stream.
 *
 * The fold tracks, walking newest-last:
 * - a running count of consecutive zero-output long-reasoning steps
 *   (assistant/message events with reasoning chars above the threshold and
 *   neither a following tool/call nor visible text before the next step/
 *   turn boundary);
 * - the latest tool call's signature and its consecutive-failure count,
 *   reset by any success or any differently-shaped call.
 *
 * Returns `{ signal: 'stall' | 'echo' | undefined, detail }` for the TAIL of
 * the stream: the breaker only cares whether the session is degenerate NOW.
 */
export function foldGuardSignal(events, options) {
  const stallSteps = options?.stallSteps ?? DEFAULT_STALL_STEPS
  const stallChars = options?.stallReasoningChars ?? DEFAULT_STALL_REASONING_CHARS
  const echoFailures = options?.echoFailures ?? DEFAULT_ECHO_FAILURES

  // Stall: count consecutive trailing steps that reason long and produce
  // nothing. We walk the stream forward and keep the current streak.
  let stallStreak = 0
  // pending holds, for the current step, whether we saw reasoning and whether
  // we saw any output (tool call or visible text).
  let pendingReasoning = 0
  let pendingOutput = false

  const closeStep = () => {
    if (pendingReasoning >= stallChars && !pendingOutput) {
      stallStreak += 1
    } else if (pendingOutput || pendingReasoning > 0) {
      // Any output — or a short-thought step — breaks the stall streak.
      stallStreak = 0
    }
    pendingReasoning = 0
    pendingOutput = false
  }

  // Echo: latest call signature and its consecutive failure count.
  let lastSignature
  let lastCallId
  let failStreak = 0

  for (const event of Array.isArray(events) ? events : []) {
    switch (event?.type) {
      case 'step/start':
      case 'turn/start':
        closeStep()
        break
      case 'assistant/message': {
        const reasoning = reasoningCharsOf(event)
        if (reasoning > 0) pendingReasoning += reasoning
        if (visibleRepliesOf(event) > 0) pendingOutput = true
        break
      }
      case 'tool/call': {
        pendingOutput = true
        const signature = callSignature(event)
        if (signature !== lastSignature) {
          lastSignature = signature
          failStreak = 0
        }
        lastCallId = event.data?.callId
        break
      }
      case 'tool/result': {
        const callId = event.data?.callId ?? event.data?.message?.source?.callId
        if (callId !== undefined && lastCallId !== undefined && callId !== lastCallId) break
        if (isErrorResult(event)) {
          if (lastSignature !== undefined) failStreak += 1
        } else {
          failStreak = 0
          lastSignature = undefined
          lastCallId = undefined
        }
        break
      }
      default:
        break
    }
  }
  closeStep()

  if (stallStreak >= stallSteps) {
    return { signal: 'stall', detail: `${stallStreak} consecutive zero-output long-reasoning steps` }
  }
  if (failStreak >= echoFailures) {
    return { signal: 'echo', detail: `${failStreak} consecutive identical-argument tool failures` }
  }
  return { signal: undefined, detail: '' }
}

/** One notch down the effort ladder, or undefined when the level is unknown. */
export function stepDownEffort(effort) {
  const index = EFFORT_LADDER.indexOf(effort)
  if (index < 0 || index === EFFORT_LADDER.length - 1) return undefined
  return EFFORT_LADDER[index + 1]
}

/** The breaker message injected at pre-step. */
export function renderGuardMessage(verdict) {
  const what = verdict.signal === 'stall'
    ? 'repeated long reasoning with no tool call and no reply'
    : 'the same tool call failing repeatedly with identical arguments'
  return [
    `[Circuit Breaker] The runtime interrupted a degeneration loop: ${what}.`,
    'Stop re-deriving in thought. Do exactly ONE of these now:',
    '1. give the user the best final answer you already have, or',
    '2. take ONE materially different concrete action (a different tool, different arguments, or a smaller sub-step) and verify its result.',
    'Do not repeat the interrupted pattern.',
  ].join(' ')
}

/** Register the signal fold, the pre-step injection, and the effort step-down. */
export function apply(ctx, config) {
  const enabled = config?.enabled !== false
  if (!enabled) return
  const stallSteps = integerAtLeast(config?.stallSteps, 'stallSteps', 2, DEFAULT_STALL_STEPS)
  const stallReasoningChars = integerAtLeast(config?.stallReasoningChars, 'stallReasoningChars', 200, DEFAULT_STALL_REASONING_CHARS)
  const echoFailures = integerAtLeast(config?.echoFailures, 'echoFailures', 2, DEFAULT_ECHO_FAILURES)
  const stepDownRequests = integerAtLeast(config?.stepDownRequests, 'stepDownRequests', 1, DEFAULT_STEP_DOWN_REQUESTS)
  const refireCooldown = integerAtLeast(config?.refireCooldownSteps, 'refireCooldownSteps', 1, DEFAULT_REFIRE_COOLDOWN_STEPS)

  // Per-agent breaker state. This is RUNTIME state (armed / fired cooldown /
  // remaining step-down requests); the SIGNAL itself always re-derives from
  // the durable event stream, so a resume never inherits a stale verdict.
  const stateByAgent = new WeakMap()
  const stateOf = (agent) => {
    let state = stateByAgent.get(agent)
    if (state === undefined) {
      state = { cooldown: 0, firedVerdict: undefined, stepDownLeft: 0 }
      stateByAgent.set(agent, state)
    }
    return state
  }

  ctx.on('agent/disposed', ({ agent }) => { stateByAgent.delete(agent) })

  // Fold the signal once per step boundary and remember the verdict; the
  // pre-step hook below injects the message. step/start is not emitted as a
  // ctx event on every host, so the fold runs inside pre-step instead — the
  // one hook guaranteed before each model request.
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const agent = payload?.agent
    if (agent === undefined) return decision
    const state = stateOf(agent)

    const verdict = foldGuardSignal(sessionEvents(agent.session), { stallSteps, stallReasoningChars, echoFailures })

    if (verdict.signal !== undefined && state.cooldown === 0) {
      // Fire: inject the breaker message and arm the effort step-down.
      state.cooldown = refireCooldown
      state.stepDownLeft = stepDownRequests
      state.firedVerdict = verdict
      const message = {
        id: globalThis.crypto.randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: renderGuardMessage(verdict) }],
        source: { kind: 'plugin', plugin: name },
      }
      try { ctx.logger?.warn?.(`${name}: circuit breaker fired (${verdict.detail})`) } catch {}
      return { ...decision, messages: [...decision.messages, message] }
    }

    if (state.cooldown > 0) state.cooldown -= 1
    return decision
  })

  // The temporary effort step-down, riding the request waterfall only while a
  // fired episode has requests left in its window. With no fired episode this
  // listener is a pass-through — it never rewrites a request.
  ctx.on('agent/request', async (payload, next) => {
    const resolved = await next()
    const agent = payload?.agent
    if (agent === undefined) return resolved
    const state = stateByAgent.get(agent)
    if (state === undefined || state.stepDownLeft === 0) return resolved
    state.stepDownLeft -= 1
    const lowered = stepDownEffort(resolved?.reasoningEffort)
    if (lowered === undefined) return resolved
    return { ...resolved, reasoningEffort: lowered }
  })
}
