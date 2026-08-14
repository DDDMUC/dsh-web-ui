/**
 * Keep the first model request on a minimal-shaped input surface, then expose
 * the full preset catalog after the model has produced its first durable tool
 * call.
 *
 * Phase 1 (no persisted `tool/call` yet):
 * - tool catalog: one platform shell plus `commonTools`
 * - runtime contexts: emptied (no sandbox/approval snapshot)
 * - pre-step messages: only direct user messages pass (`messageSources`)
 *
 * Phase 2 (after the first persisted `tool/call`): everything passes through.
 *
 * Source: https://github.com/xiaobright/dsh-anchored-standard (MIT), extended
 * with the phase-1 context/message quarantine.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'anchored-tool-bootstrap'

/** Prompt assembly must exist before this request filter can register. */
export const inject = ['systemPrompt']

/** Message-source kinds the model may see during phase 1. */
const DEFAULT_MESSAGE_SOURCES = ['user']

function stringList(value, field, fallback) {
  if (value === undefined) return [...fallback]
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${name}: ${field} must be a non-empty array of non-empty strings`)
  }
  return [...new Set(value)]
}

/**
 * Phase-2 promotion state per session. Sessions append events only, so the
 * scan resumes from the first event it has not inspected yet.
 */
const promotionBySession = new WeakMap()

function hasPromoted(agent) {
  const session = agent?.session
  if (session === undefined) return false
  let state = promotionBySession.get(session)
  if (state === undefined) {
    state = { next: 0, promoted: false }
    promotionBySession.set(session, state)
  }
  if (!state.promoted) {
    const events = session.events
    for (; state.next < events.length; state.next += 1) {
      if (events[state.next]?.type === 'tool/call') {
        state.promoted = true
        state.next = events.length
        break
      }
    }
  }
  return state.promoted
}

/** Whether one pre-step message is direct user input rather than an injection. */
function isAllowedMessage(message, allowedSources) {
  const kind = message.source?.kind
  return kind === undefined || allowedSources.has(kind)
}

/** Register the per-session bootstrap quarantine. */
export function apply(ctx, config) {
  const commonTools = stringList(config.commonTools, 'commonTools')
  const shellTools = stringList(config.shellTools, 'shellTools')
  const messageSources = new Set(stringList(config.messageSources, 'messageSources', DEFAULT_MESSAGE_SOURCES))

  // `prepend: true` puts both filters at the outermost position of their
  // waterfall, so `await next()` always observes the complete downstream
  // result (including messages appended by listener order, not row order)
  // before the quarantine strips it.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context.agent
    if (agent === undefined || hasPromoted(agent)) return assembled

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
    }
  }, { prepend: true })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    const agent = payload.agent
    if (agent === undefined || hasPromoted(agent) || decision.kind !== 'enter') return decision
    return {
      ...decision,
      messages: decision.messages.filter(message => isAllowedMessage(message, messageSources)),
    }
  }, { prepend: true })
}
