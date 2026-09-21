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

/**
 * How many consecutive runaway-reasoning zero-output steps trip the per-step
 * ladder. ONE is deliberate: a single step whose reasoning alone blows past
 * the character floor with no output is already the runaway-generation shape
 * (#5976's first symptom), and waiting for a second one just lets the episode
 * burn another 384K-scale generation. The slow-burn ladder below carries the
 * burden of proof for smaller steps, so this ladder staying hair-trigger does
 * not raise the false-positive rate — a step has to be individually enormous
 * AND output-free to count.
 */
export const DEFAULT_STALL_STEPS = 1

/**
 * Minimum reasoning characters per step for that step to count as "long".
 *
 * Calibrated against DeepSeek-V4.1's official MAX OUTPUT of 384K: a step the
 * breaker should care about is not a couple of paragraphs of ordinary thought
 * (2K chars fires on normal answers) but a runaway generation. 8K chars is
 * roughly 2-4K thinking tokens — far beyond any healthy single step, yet far
 * below the 384K ceiling a true #5976-style degeneration runs to, so the floor
 * catches the episode early in its first step instead of never matching at
 * all. Steps between 2K and 8K with no output still reset the streak via the
 * step-count branch below, which is the real guard against slow burn.
 */
export const DEFAULT_STALL_REASONING_CHARS = 8000

/** How many identical-argument failures in a row constitute an echo loop. */
export const DEFAULT_ECHO_FAILURES = 3

/**
 * Steps with at least this much reasoning count toward the global (slow-burn)
 * stall ladder. Deliberately low: the ladder exists to catch the loop of many
 * individually-plausible-but-output-free steps, so any step that really thought
 * counts; a step that barely reasoned (a tool ack, an empty turn) must not.
 */
export const GLOBAL_MIN_REASONING_CHARS = 200

/** How many consecutive output-free reasoning steps trip the slow-burn ladder. */
export const DEFAULT_GLOBAL_STALL_CAP = 4

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
  const globalCap = options?.globalStallCap ?? DEFAULT_GLOBAL_STALL_CAP

  // Stall, two independent ladders walked in parallel:
  //  1. PER-STEP: one step whose reasoning alone blows past the character floor
  //     with no output — the runaway-generation shape (#5976's first symptom).
  //  2. GLOBAL: N consecutive steps with NO output at all, regardless of each
  //     step's size — the slow-burn closed loop. This ladder is bounded by a
  //     hard global cap so a legitimately long investigation (many small
  //     read-only steps) cannot trip it by accumulation alone: the streak only
  //     counts while the steps are also individually reasoning-heavy.
  let stallStreak = 0
  let globalStreak = 0
  // pending holds, for the current step, whether we saw reasoning and whether
  // we saw any output (tool call or visible text).
  let pendingReasoning = 0
  let pendingOutput = false

  const closeStep = () => {
    // Per-step ladder: one bloated zero-output step is enough to advance it.
    if (pendingReasoning >= stallChars && !pendingOutput) {
      stallStreak += 1
    } else if (pendingOutput || pendingReasoning > 0) {
      stallStreak = 0
    }
    // Global ladder: any output resets; an output-free step advances it only
    // while the step also carried real reasoning (a bare tool-ack or an empty
    // thought must not count toward a stall).
    if (pendingOutput) {
      globalStreak = 0
    } else if (pendingReasoning >= GLOBAL_MIN_REASONING_CHARS) {
      globalStreak = Math.min(globalStreak + 1, globalCap)
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
    return { signal: 'stall', detail: `${stallStreak} consecutive runaway-reasoning steps (${stallChars}+ chars each)` }
  }
  if (globalStreak >= globalCap) {
    return { signal: 'stall', detail: `${globalStreak} consecutive output-free reasoning steps (slow burn)` }
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
  const stallSteps = integerAtLeast(config?.stallSteps, 'stallSteps', 1, DEFAULT_STALL_STEPS)
  const stallReasoningChars = integerAtLeast(config?.stallReasoningChars, 'stallReasoningChars', 200, DEFAULT_STALL_REASONING_CHARS)
  const echoFailures = integerAtLeast(config?.echoFailures, 'echoFailures', 2, DEFAULT_ECHO_FAILURES)
  const globalStallCap = integerAtLeast(config?.globalStallCap, 'globalStallCap', 2, DEFAULT_GLOBAL_STALL_CAP)
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

    const verdict = foldGuardSignal(sessionEvents(agent.session), { stallSteps, stallReasoningChars, echoFailures, globalStallCap })

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
