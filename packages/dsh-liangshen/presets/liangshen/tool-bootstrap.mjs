/**
 * Keep the first model request on a minimal-shaped input surface, then expose
 * the full preset catalog once the session is safely anchored.
 *
 * Phase 1 (no persisted `tool/call` yet):
 * - tool catalog: one platform shell plus `commonTools`
 * - prompt sections: only the `persona` section (all other sections,
 *   including plan-mode's `plan:policy`, return after promotion)
 * - runtime contexts: emptied (no sandbox/approval snapshot)
 * - pre-step messages: only explicit user messages pass
 *
 * Promotion opens the full tool catalog and restores runtime contexts and all
 * prompt sections. With `anchorGate` the promotion after the first tool call
 * also requires one minimal-like reasoning block or the `maxBootstrapSteps`
 * fallback. `promoteAfterFirstResponse` promotes a tool-less first response
 * once it has responded, and also releases an anchor-gated session when its
 * first turn ends (`turn/end`); that release happens during prompt assembly,
 * so the new user turn already sees the full catalog. `deferredSources` and
 * `deferredGraceSteps` delay selected injected message kinds (workspace
 * instructions, skill catalog) for a few steps after promotion.
 *
 * Source: https://github.com/xiaobright/dsh-anchored-standard (MIT), extended
 * with the phase-1 quarantine and the stabilization controls above.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'anchored-tool-bootstrap'

/** Prompt assembly must exist before this request filter can register. */
export const inject = ['systemPrompt']

/** Message-source kinds the model may see during phase 1. */
const DEFAULT_MESSAGE_SOURCES = ['user']

/** Message-source kinds delayed after promotion. */
const DEFAULT_DEFERRED_SOURCES = []

function stringList(value, field, fallback) {
  if (value === undefined) return [...fallback]
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${name}: ${field} must be a non-empty array of non-empty strings`)
  }
  return [...new Set(value)]
}

function stringListOrEmpty(value, field) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${name}: ${field} must be an array of non-empty strings`)
  }
  return [...new Set(value)]
}

function integerAtLeast(value, field, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name}: ${field} must be an integer >= ${minimum}`)
  }
  return value
}

function countWord(text, regex) {
  return [...text.matchAll(regex)].length
}

/**
 * Conservative lexical classifier for one reasoning block, matching the
 * modeltest trigger probe: `We need` / `Let me` first lines and whole-block
 * `we` / `let me` counts. It describes the trajectory surface, not capability.
 */
export function classifyReasoning(text) {
  const trimmed = String(text ?? '').trim()
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? ''
  const we = countWord(trimmed, /\bwe\b/gi)
  const letMe = countWord(trimmed, /\blet me\b/gi)
  let score = 0
  if (/^we need\b/i.test(firstLine)) score += 3
  if (/^let me\b/i.test(firstLine)) score -= 3
  if (we > 0 && letMe === 0) score += 2
  if (letMe > 0) score -= 2
  if (/^(good|great|excellent)\.?$/i.test(firstLine.trim())) score += 1
  return {
    label: score >= 4 ? 'minimal-like' : score <= -4 ? 'standard-like' : 'ambiguous',
    score,
    metrics: { we, letMe },
  }
}

/**
 * Whether the FIRST reasoning block of an assistant message classifies as
 * minimal-like. Later blocks do not override an earlier standard-like first
 * block.
 */
export function hasAnchoredReasoning(content) {
  if (!Array.isArray(content)) return false
  const first = content.find(block => block?.type === 'reasoning')
  return first !== undefined && classifyReasoning(first.text).label === 'minimal-like'
}

/**
 * Whether one pre-step message is an explicit user message. Only `kind:
 * 'user'` passes; injected kinds and source-less seed messages never pass.
 */
function isAllowedMessage(message, allowedSources) {
  const kind = message.source?.kind
  return kind === 'user' && allowedSources.has(kind)
}

/** Whether one pre-step message belongs to a deferred injection kind. */
function isDeferredMessage(message, deferredSources) {
  const kind = message.source?.kind
  return kind !== undefined && deferredSources.has(kind)
}

/**
 * Phase-2 promotion state per session. Sessions append events only, so the
 * scan resumes from the first event it has not inspected yet.
 */
const promotionBySession = new WeakMap()

function stateFor(session) {
  let state = promotionBySession.get(session)
  if (state === undefined) {
    state = {
      next: 0,
      promoted: false,
      toolCalled: false,
      responded: false,
      anchored: false,
      turnEnded: false,
      steps: 0,
      deferredSteps: 0,
    }
    promotionBySession.set(session, state)
  }
  return state
}

/**
 * a) first tool call, no anchor gate — promote immediately;
 * b) first tool call, anchored or `maxBootstrapSteps` fallback — promote;
 * c) first tool call, still gated, but the first turn ended and
 *    `promoteAfterFirstResponse` is set — release on the new user turn (the
 *    release happens during prompt assembly, so that turn already gets the
 *    full catalog);
 * d) tool-less first response with `promoteAfterFirstResponse` — promote.
 */
function decidePromotion(state, config) {
  if (state.toolCalled && config.anchorGate !== true) return true
  if (state.toolCalled && config.anchorGate === true && (state.anchored || state.steps >= config.maxBootstrapSteps)) return true
  if (state.toolCalled && config.anchorGate === true && config.promoteAfterFirstResponse === true && state.turnEnded) return true
  if (!state.toolCalled && state.responded && config.promoteAfterFirstResponse === true) return true
  return false
}

/** Scan newly appended session events and update promotion state. */
function refresh(agent, config) {
  const session = agent?.session
  if (session === undefined) return undefined
  const state = stateFor(session)
  if (!state.promoted) {
    const events = session.events
    for (; state.next < events.length; state.next += 1) {
      const event = events[state.next]
      if (event === undefined) continue
      if (event.type === 'tool/call') {
        state.toolCalled = true
      } else if (event.type === 'step/start') {
        state.steps += 1
      } else if (event.type === 'turn/end') {
        state.turnEnded = true
      } else if (event.type === 'assistant/message') {
        state.responded = true
        if (!state.anchored) state.anchored = hasAnchoredReasoning(event.data?.message?.content)
      }
    }
    if (decidePromotion(state, config)) state.promoted = true
  }
  return state
}

/** Register the per-session bootstrap quarantine and promotion policy. */
export function apply(ctx, config) {
  const commonTools = stringList(config.commonTools, 'commonTools')
  const shellTools = stringList(config.shellTools, 'shellTools')
  const messageSources = new Set(stringList(config.messageSources, 'messageSources', DEFAULT_MESSAGE_SOURCES))
  const deferredSources = new Set(stringListOrEmpty(config.deferredSources, 'deferredSources'))
  const policy = {
    anchorGate: config.anchorGate === true,
    promoteAfterFirstResponse: config.promoteAfterFirstResponse === true,
    maxBootstrapSteps: integerAtLeast(config.maxBootstrapSteps ?? 4, 'maxBootstrapSteps', 1),
    deferredGraceSteps: integerAtLeast(config.deferredGraceSteps ?? 0, 'deferredGraceSteps', 0),
  }

  // `prepend: true` puts both filters at the outermost position of their
  // waterfall, so `await next()` always observes the complete downstream
  // result (including messages appended by listener order, not row order)
  // before the quarantine strips it.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context.agent
    if (agent === undefined) return assembled
    const state = refresh(agent, policy)
    if (state.promoted) return assembled

    const available = new Set(assembled.tools.map(tool => tool.name))
    const selectedShells = shellTools.filter(toolName => available.has(toolName))
    const missingCommon = commonTools.filter(toolName => !available.has(toolName))
    if (selectedShells.length !== 1 || missingCommon.length > 0) {
      throw new Error(
        `${name}: expected exactly one bootstrap shell and every common tool; `
        + `shells=${JSON.stringify(selectedShells)}, missing=${JSON.stringify(missingCommon)}`,
      )
    }

    const bootstrap = new Set([...selectedShells, ...commonTools])
    return {
      ...assembled,
      tools: assembled.tools.filter(tool => bootstrap.has(tool.name)),
      contexts: [],
      ...(Array.isArray(assembled.sections)
        ? { sections: assembled.sections.filter(section => section?.name === 'persona') }
        : {}),
    }
  }, { prepend: true })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    const agent = payload.agent
    if (agent === undefined || decision.kind !== 'enter') return decision
    const state = refresh(agent, policy)
    if (state === undefined) return decision

    if (!state.promoted) {
      return {
        ...decision,
        messages: decision.messages.filter(message => isAllowedMessage(message, messageSources)),
      }
    }
    if (state.deferredSteps < policy.deferredGraceSteps) {
      state.deferredSteps += 1
      return {
        ...decision,
        messages: decision.messages.filter(message => !isDeferredMessage(message, deferredSources)),
      }
    }
    return decision
  }, { prepend: true })
}
