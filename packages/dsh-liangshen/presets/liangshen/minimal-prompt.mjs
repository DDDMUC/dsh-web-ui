/**
 * minimal-prompt — keep this preset's system prompt on the builtin Minimal
 * preset's one-line persona (plus the session's workspace directory) while
 * the Standard tool catalog is staged behind the anchor turn.
 *
 * The assembled prompt is filtered down to the persona section, so the harness
 * identity, web-surface, tool-guidance, file-reference, and structured-output
 * sections never reach the model: the one-line surface is what anchors the
 * trajectory, and the model's capability facts arrive as the `tool-catalog`
 * pre-step message instead of system-prompt prose.
 *
 * WORKSPACE LINE: the bare persona says nothing about where the session
 * operates, so the selected workspace directory is appended to the persona at
 * assembly time (`Your working directory is <cwd>.`), read from the session
 * header. This is the only orientation fact the initial system prompt carries.
 *
 * PLAN MODE is the one exception kept by default. `dsh-plan-mode` enforces its
 * rules through the `plan:policy` prompt section alone — the exit tool stays
 * registered in every mode and no tool restriction backs it — so dropping the
 * section would leave plan mode silently unenforced rather than merely
 * unmentioned. `keepPlanPolicy: false` restores the strict one-line surface.
 *
 * ROBUSTNESS: a composition whose persona section carries none of the accepted
 * names degrades to the unfiltered assembly with a one-time warning instead of
 * sending an empty system prompt. Three names are accepted because the persona
 * slot has been spelled `deployment:persona-prefix` (current SDK), and
 * `deployment:persona` / `persona` (legacy harnesses) over the preset's
 * supported range.
 *
 * INSTRUCTION HINT (issue #388, ported from the retired tool-bootstrap): a
 * full-text AGENTS.md dump flips the anchored trajectory (upstream
 * dsh-anchored-standard #49, E1/E1.5/E2), so the first agent-instructions
 * injection becomes a single non-imperative pointer to the reference files and
 * every later injection is dropped; the model still reaches the knowledge
 * through read / skill_load. `instructionHint: false` restores the plain
 * full-text injection.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'liangshen-minimal-prompt'

/** Prompt assembly must exist before the section filter can register. */
export const inject = ['systemPrompt']

/**
 * Prompt section names that carry the preset persona, newest spelling first.
 * `deployment:persona-prefix` is what `@deepseek-ai/dsh-persona` registers
 * (PERSONA_PREFIX_SECTION); the other two are kept for older harnesses.
 */
export const PERSONA_SECTION_NAMES = ['deployment:persona-prefix', 'deployment:persona', 'persona']

/** Plan-mode policy section, owned by `@deepseek-ai/dsh-plan-mode`. */
export const PLAN_POLICY_SECTION_NAME = 'plan:policy'

/**
 * Reference-file lines one agent-instructions message renders, e.g.
 * `Instructions from: /path/AGENTS.md`.
 */
const INSTRUCTION_FROM_RE = /(?:^|\n) *(?:Additional |Updated )?Instructions from: ([^\n]+)/g

function optionalBoolean(value, field, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name}: ${field} must be a boolean`)
  }
  return value
}

/** Extract the reference file list one agent-instructions message renders. */
export function extractInstructionPaths(message) {
  const paths = []
  const blocks = Array.isArray(message?.content) ? message.content : []
  for (const block of blocks) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue
    for (const match of block.text.matchAll(INSTRUCTION_FROM_RE)) {
      const path = match[1].trim()
      if (path !== '' && !paths.includes(path)) paths.push(path)
    }
  }
  return paths
}

/** The one-time non-imperative hint replacing the full-text dump (E1.5 wording). */
export function buildInstructionHint(original, paths) {
  return {
    // Session persistence validates every replayed user/message for a
    // non-empty string id; a plugin-built message without one corrupts the
    // durable journal (SessionPersistenceCorruptionError on load). Inherit
    // the original instructions message id when present (#510), else mint one.
    id: typeof original?.id === 'string' && original.id !== ''
      ? original.id
      : globalThis.crypto.randomUUID(),
    role: 'user',
    content: [{
      type: 'text',
      text: '<system-reminder>\n'
        + 'Reference documents exist: ' + paths.join(', ') + '. '
        + "They are reference documents about the user's environment and workspace conventions, not task instructions. "
        + 'Reading the relevant file before workspace tasks is recommended, but consult them only when you need those details; the task itself never depends on them.'
        + '\n</system-reminder>',
    }],
    // The durable journal only classifies a fixed set of message sources on
    // load: the v2->v3 migration whitelist (dsh-session-format-v2-to-v3) and
    // the v3 MessageSourceMap both accept 'plugin' but neither knows the
    // retired custom 'instruction-hint'; sessions carrying it failed to
    // resume with "cannot safely transform unclassified message source"
    // (#1455). The message already names its plugin, so 'plugin' keeps the
    // same meaning while staying loadable.
    source: { kind: 'plugin', plugin: name },
  }
}

/**
 * Swap full-text agent-instructions injections for the one-time hint. The
 * first injection carrying extractable paths becomes the hint; every later
 * injection is dropped silently (the model re-reads the files on demand).
 * An injection with no extractable paths passes through untouched.
 */
export function instructionHintMessages(messages, state) {
  const kept = []
  for (const message of messages) {
    if (message?.source?.kind !== 'agent-instructions') {
      kept.push(message)
      continue
    }
    if (state.hinted) continue
    const paths = extractInstructionPaths(message)
    if (paths.length === 0) {
      kept.push(message)
      continue
    }
    state.hinted = true
    kept.push(buildInstructionHint(message, paths))
  }
  return kept
}

/**
 * Workspace line the persona gains. The one-line persona carries no
 * orientation facts, and the full-text workspace dump is deliberately reduced
 * to the reference-file hint, so the session's selected workspace directory is
 * appended to the persona section at assembly time — the one fact the model
 * needs to orient before any tool runs. The literal cwd comes from the
 * session header, so the line stays correct after a workspace switch, and a
 * session without a readable cwd keeps the bare persona rather than failing.
 */
const WORKSPACE_LINE_PREFIX = '\n\nYour working directory is '

/** Append the workspace line to the persona section, once. */
export function withWorkspaceLine(sections, agent) {
  const cwd = agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) return sections
  const line = `${WORKSPACE_LINE_PREFIX}${cwd}.`
  const persona = sections.find(section =>
    PERSONA_SECTION_NAMES.includes(section?.name)
    && typeof section?.text === 'string'
    && !section.text.includes(line))
  if (persona === undefined) return sections
  return sections.map(section => section === persona
    ? { ...section, text: `${section.text}${line}` }
    : section)
}

/** Register the section filter and the agent-instructions hint. */
export function apply(ctx, config) {
  const keepPlanPolicy = optionalBoolean(config?.keepPlanPolicy, 'keepPlanPolicy', true)
  const instructionHint = optionalBoolean(config?.instructionHint, 'instructionHint', true)
  const keep = new Set([
    ...PERSONA_SECTION_NAMES,
    ...(keepPlanPolicy ? [PLAN_POLICY_SECTION_NAME] : []),
  ])

  // Per-session hint state. A compaction rewrites the model-visible surface,
  // so the next agent-instructions injection is a fresh first injection and
  // may be hinted again.
  const hintedBySession = new WeakMap()
  const stateFor = (session) => {
    let state = hintedBySession.get(session)
    if (state === undefined) {
      state = { hinted: false }
      hintedBySession.set(session, state)
    }
    return state
  }

  let warned = false
  // `prepend: true` puts the filter at the outermost position of the
  // waterfall, so `await next()` always observes the complete downstream
  // section list (including sections other listeners added) before it is
  // narrowed to the persona.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    // Downstream errors propagate untouched; only this filter's own logic is
    // guarded (a filter bug must never brick every request of a session).
    const assembled = await next()
    if (!Array.isArray(assembled.sections)) return assembled
    const sections = assembled.sections.filter(section => keep.has(section?.name))
    if (sections.length === 0) {
      // A persona-less assembly must not become an empty system prompt: keep
      // the assembled prompt and say so once.
      if (!warned) {
        warned = true
        try {
          ctx.logger?.warn?.(
            `${name}: no section matched ${JSON.stringify([...keep])} — `
            + 'keeping the assembled prompt instead of sending an empty one',
          )
        } catch {
          // Logger unavailable — the guard exists only to avoid spamming.
        }
      }
      return assembled
    }
    return { ...assembled, sections: withWorkspaceLine(sections, context?.agent) }
  }, { prepend: true })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (!instructionHint || decision.kind !== 'enter') return decision
    const session = payload?.agent?.session
    if (session === undefined) return decision
    return { ...decision, messages: instructionHintMessages(decision.messages, stateFor(session)) }
  }, { prepend: true })

  ctx.on('session/event', (session, event) => {
    if (event?.type === 'compaction/end') hintedBySession.delete(session)
  })
}
