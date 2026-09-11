/**
 * tool-catalog — inject this preset's model-visible tool catalog as a durable
 * user message right after the user's own message, the way `dsh-tool-skill`
 * injects the skill catalog.
 *
 * WHY: the preset's system prompt stays on the builtin Minimal preset's
 * one-line persona, so the tool-guidance sections the Standard prompt carries
 * are absent. The model still gets the complete Standard tool catalog on the
 * wire; this message is the index that names what is available, placed at the
 * prompt tail (Layer 3) instead of in the stable prefix.
 *
 * The entries come from the LAST assembled wire catalog for that agent — the
 * `system-prompt/assemble` waterfall value, which is exactly the schema set
 * the request will carry (post-restriction and post-presentation). Assembly
 * runs immediately before the step's `agent/pre-step` dispatch, so the stash
 * is always the current step's catalog; a step with no observed assembly
 * injects nothing rather than guessing.
 *
 * DEDUPE: the message is durable, so publishing it every step would append a
 * copy per step. The rendering is a pure function of the entry list and the
 * published copy is read back from the durable log, so a step republishes only
 * when the rendered text actually differs from the last catalog message still
 * on the session's visible surface (a changed tool set, or a copy a compaction
 * shadowed). Nothing is kept in memory across steps, so resume and reload
 * reconstruct the same decision.
 *
 * SOURCE SHAPE: the message source carries ONLY `{ kind: 'plugin', plugin }`.
 * That is the same shape the instruction hint uses, and it stays inside the
 * durable validator's `plugin` field set (`kind`, `plugin`, `form`, `sections`,
 * `summary`) — an extra field would be rejected the moment the harness applies
 * that whitelist to V3 user messages the way it already does to V3
 * `system/message` events. `plugin` is also the only injected kind the v2->v3
 * migration whitelist and the v3 MessageSourceMap both classify (#1455), and
 * the message text itself is what identifies a stale catalog.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'liangshen-tool-catalog'

/** Prompt assembly must exist before the wire catalog can be observed. */
export const inject = ['systemPrompt']

/** Default cap for one tool's one-line summary in the injected list. */
const DEFAULT_DESCRIPTION_MAX_LENGTH = 200

function integerAtLeast(value, field, minimum, fallback) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name}: ${field} must be an integer >= ${minimum}`)
  }
  return value
}

/**
 * One-line model-facing summary of a tool description: whitespace collapsed,
 * truncated with an ellipsis. The full description stays in the tool schema.
 */
export function catalogDescription(value, maxLength) {
  const normalized = String(value ?? '').replaceAll(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 3)}...`
}

/** Catalog entries for one assembled wire tool set, in wire order. */
export function catalogEntries(tools, maxLength) {
  const entries = []
  for (const tool of Array.isArray(tools) ? tools : []) {
    const toolName = tool?.name
    if (typeof toolName !== 'string' || toolName === '') continue
    entries.push({ name: toolName, description: catalogDescription(tool.description, maxLength) })
  }
  return entries
}

/**
 * Model-facing catalog text. Deliberately one stable rendering for both the
 * first publication and a replacement: the text is then the complete record
 * of what was published, so a republish decision needs no field beyond it.
 */
export function renderCatalogText(entries) {
  const available = entries.length === 0
    ? ['No tools are currently available in this session.']
    : [
        '<available_tools>',
        ...entries.map(entry => `- \`${entry.name}\`: ${entry.description}`),
        '</available_tools>',
      ]
  return [
    '<system-reminder>',
    'The following tools are available in this session:',
    '',
    ...available,
    '',
    "This is the complete current list and replaces any earlier available-tools list in this session. It carries names and one-line summaries only; each tool's full parameter schema travels with its own tool definition.",
    '</system-reminder>',
  ].join('\n')
}

/** Build the durable catalog message for one entry list. */
export function createCatalogMessage(entries) {
  return {
    // Session persistence validates every replayed user/message for a
    // non-empty string id; a plugin-built message without one corrupts the
    // durable journal (SessionPersistenceCorruptionError on load).
    id: globalThis.crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: renderCatalogText(entries) }],
    source: { kind: 'plugin', plugin: name },
  }
}

/** The text one message contributes, joined across its text blocks. */
function textOf(message) {
  const blocks = Array.isArray(message?.content) ? message.content : []
  return blocks
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

/** Whether one message is this plugin's catalog. */
function isCatalogMessage(message) {
  const source = message?.source
  return source?.kind === 'plugin' && source?.plugin === name
}

/**
 * Session events, tolerating both the current `snapshotEvents()` accessor and
 * the older mutable `events` array (SDK 0.1.2-alpha.4 renamed it).
 */
function sessionEvents(session) {
  if (Array.isArray(session?.events)) return session.events
  if (typeof session?.snapshotEvents === 'function') return session.snapshotEvents()
  return []
}

/** Visible surface positions, or undefined when the session exposes none. */
function visibleSeqSet(session) {
  const nodes = session?.surface?.nodes
  return Array.isArray(nodes) ? new Set(nodes) : undefined
}

/**
 * Published catalog state read back from the durable log: the text of the most
 * recent catalog message still on the visible surface, plus whether any catalog
 * was ever published. A resumed, forked, or externally written seed may hold an
 * unusable record, so one is skipped rather than throwing inside the step
 * listener (which would fail every later turn).
 */
function catalogHistory(agent) {
  const session = agent?.session
  const events = sessionEvents(session)
  const visible = visibleSeqSet(session)
  let published = false
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'user/message' || !isCatalogMessage(event.data)) continue
    published = true
    if (visible === undefined || typeof event.seq !== 'number' || visible.has(event.seq)) {
      return { published, text: textOf(event.data) }
    }
  }
  return { published }
}

/** This plugin's catalog message inside one step's admitted batch, if any. */
function catalogMessage(messages) {
  for (const message of messages) {
    if (isCatalogMessage(message)) return { message, text: textOf(message) }
  }
  return undefined
}

/** Drop one message from a step's admitted batch. */
function withoutMessage(decision, id) {
  return { ...decision, messages: decision.messages.filter(message => message.id !== id) }
}

/** Register the wire-catalog observer and the per-step catalog injection. */
export function apply(ctx, config) {
  const descriptionMaxLength = integerAtLeast(
    config?.descriptionMaxLength,
    'descriptionMaxLength',
    1,
    DEFAULT_DESCRIPTION_MAX_LENGTH,
  )

  // The last wire catalog each live agent assembled. `prepend: true` makes
  // this listener outermost, so `await next()` yields the final assembly.
  const wireCatalogByAgent = new WeakMap()

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context?.agent
    if (agent !== undefined) {
      wireCatalogByAgent.set(agent, catalogEntries(assembled.tools, descriptionMaxLength))
    }
    return assembled
  }, { prepend: true })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const agent = payload?.agent
    const entries = agent === undefined ? undefined : wireCatalogByAgent.get(agent)
    if (entries === undefined) return decision

    const candidate = renderCatalogText(entries)
    const history = catalogHistory(agent)
    const existing = catalogMessage(decision.messages)
    if (history.text === candidate) {
      return existing === undefined ? decision : withoutMessage(decision, existing.message.id)
    }
    if (existing !== undefined && existing.text === candidate) return decision
    if (!history.published && entries.length === 0) {
      return existing === undefined ? decision : withoutMessage(decision, existing.message.id)
    }
    const catalog = createCatalogMessage(entries)
    if (existing === undefined) {
      return { ...decision, messages: [...decision.messages, catalog] }
    }
    return {
      ...decision,
      messages: decision.messages.map(message => (message.id === existing.message.id ? catalog : message)),
    }
  }, { prepend: true })
}
