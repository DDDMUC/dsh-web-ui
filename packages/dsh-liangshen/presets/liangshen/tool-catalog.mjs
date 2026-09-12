/**
 * tool-catalog — this preset's staged model-visible tool surface: the anchor
 * turn's wire, the PTC handoff at the turn boundary, and the durable catalog
 * message that names the surface.
 *
 * WHY: the preset's system prompt stays on the builtin Minimal preset's
 * one-line persona, so the tool-guidance sections the Standard prompt carries
 * are absent, and `minimal-prompt` narrows every assembly down to the persona
 * section — including the harness's own `tools:sdk` and `tools:ptc-only`
 * sections. The capability facts therefore travel as a user message at the
 * prompt tail (Layer 3), the way `dsh-tool-skill` injects the skill catalog,
 * and that message is the model's only source for the SDK bindings, for the
 * rule that only `run_code` may be called directly, and for the program contract
 * the harness states in those same filtered sections: one program per intent,
 * overlapping independent reads under `Promise.all`, `ToolCallError` handling,
 * and curated program output.
 *
 * ANCHOR TURN: the assembled wire tool list is narrowed to `anchorTools`
 * before the request carries it, and the session still presents tools natively.
 * The shipped preset anchors on `bash` alone — the builtin Minimal surface —
 * so the first request carries the shell schema and nothing else.
 *
 * PTC HANDOFF: from the session's second turn on, this plugin declares PTC
 * presentation for that agent alone (`agent.ctx.tools.presentAs('ptc')`), so
 * the wire carries the single reserved `run_code` transport and every other
 * tool is reached from inside the program through the generated SDK. The
 * harness collects the tool providers BEFORE it runs the `system-prompt/
 * assemble` waterfall, so a declaration made inside that waterfall cannot
 * affect the assembly it is made in: the plugin declares on the boundary
 * session events instead — the anchor turn's `turn/end` and the second turn's
 * `turn/start` — which are emitted before the promoted turn's first assembly
 * reads the wire, and the assembly listener re-asserts the declaration for a
 * session whose boundary was crossed while this plugin was not observing
 * events (a host restart mid-turn). There the collapse lands one assembly
 * later, and the catalog text does not depend on it. Reading the boundary from
 * the durable log (not memory) keeps it stable across resume, reload, and
 * compaction. The switch needs a mounted code runtime, and the SDK section it
 * registers is evaluated during every assembly: without a runtime the plugin
 * stays native instead of failing the session, and a failed switch degrades
 * the same way with a one-time warning.
 *
 * CATALOG CONTENT: the entries are the PTC surface — the registry's visible
 * tools minus `run_code`, each named with its compact argument signature and a
 * one-line description — read from the registry (`ctx.tools.sdkSchemas`) so the
 * list does not depend on which surface the current request happens to carry.
 * The first turn therefore already names every tool the promoted turn reaches,
 * the way the skill catalog names skills the model loads on demand. When the
 * registry or its SDK projection is unavailable the entries fall back to the
 * assembled wire schemas, so the mode still publishes a truthful list.
 *
 * DEDUPE: the message is durable, so publishing it every step would append a
 * copy per step. The rendering is a pure function of the entry list and the
 * presentation plan, and the published copy is read back from the durable log,
 * so a step republishes only when the rendered text actually differs from the
 * last catalog message still on the session's visible surface (a changed tool
 * set, or a copy a compaction shadowed). Nothing is kept in memory across
 * steps, so resume and reload reconstruct the same decision.
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

/**
 * Nesting depth beyond which an inline signature degrades to `JsonValue`. The
 * rendering stays one line per tool, so deeply nested argument objects are
 * summarized rather than expanded into a wall of text.
 */
const MAX_SIGNATURE_DEPTH = 4

/** Types the compact signature renders exactly; everything else degrades. */
const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])

function integerAtLeast(value, field, minimum, fallback) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name}: ${field} must be an integer >= ${minimum}`)
  }
  return value
}

function optionalBoolean(value, field, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name}: ${field} must be a boolean`)
  }
  return value
}

/** Parse the `anchorTools` config: absent means staging off, entries must be non-empty names. */
function anchorToolNames(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new TypeError(`${name}: anchorTools must be an array of tool names`)
  }
  return value.map((entry) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new TypeError(`${name}: anchorTools entries must be non-empty tool names`)
    }
    return entry
  })
}

/**
 * Whether the session is still in its anchor turn: fewer than two `turn/start`
 * events and no `turn/end` yet, so the anchor covers the whole first turn even
 * when it takes several steps. The count is read from the log on every
 * decision, so resume, reload, and compaction cannot lose or revive the
 * boundary, and a first turn that ends without a reply still promotes at the
 * next one.
 */
export function inAnchorTurn(events) {
  let turns = 0
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === 'turn/end') return false
    if (event?.type !== 'turn/start') continue
    turns += 1
    if (turns >= 2) return false
  }
  return true
}

/** Narrow one assembled wire tool list to the anchor names, preserving wire order. */
export function anchorToolsOf(tools, names) {
  const wire = Array.isArray(tools) ? tools : []
  if (names.length === 0) return wire
  const keep = new Set(names)
  return wire.filter(tool => keep.has(tool?.name))
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

/** One scalar literal as TypeScript-ish text; non-JSON scalars degrade to the broad type. */
function renderLiteral(value) {
  const json = JSON.stringify(value)
  return json === undefined ? 'JsonValue' : json
}

/**
 * One JSON-Schema node as compact TypeScript-ish text: scalars, `const`/`enum`
 * literals, unions (`oneOf` / `anyOf` / array-typed `type`), arrays, and inline
 * object literals. Unsupported or malformed nodes degrade to `JsonValue`, so a
 * hostile schema can only cost precision, never throw during assembly.
 */
export function renderJsonSchemaType(schema, depth = 0) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return 'JsonValue'
  const union = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : undefined
  if (union !== undefined && union.length > 0) {
    const parts = union.map(node => renderJsonSchemaType(node, depth))
    return [...new Set(parts)].join(' | ')
  }
  if (Object.hasOwn(schema, 'const')) return renderLiteral(schema.const)
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum.map(renderLiteral).join(' | ')
  if (Array.isArray(schema.type)) {
    const parts = schema.type.map(type => (typeof type === 'string' ? type : 'JsonValue'))
    return [...new Set(parts)].join(' | ')
  }
  if (SCALAR_TYPES.has(schema.type)) return schema.type === 'integer' ? 'number' : schema.type
  if (schema.type === 'array') {
    const items = schema.items === undefined ? 'JsonValue' : renderJsonSchemaType(schema.items, depth + 1)
    return items.includes('|') ? `(${items})[]` : `${items}[]`
  }
  if (schema.type === 'object' || schema.properties !== undefined) {
    if (depth >= MAX_SIGNATURE_DEPTH) return 'JsonValue'
    const properties = schema.properties !== undefined && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? Object.entries(schema.properties)
      : []
    if (properties.length === 0) return 'Record<string, JsonValue>'
    const required = new Set(Array.isArray(schema.required) ? schema.required : [])
    const fields = properties.map(([field, child]) => (
      `${field}${required.has(field) ? '' : '?'}: ${renderJsonSchemaType(child, depth + 1)}`
    ))
    return `{ ${fields.join(', ')} }`
  }
  return 'JsonValue'
}

/**
 * The parenthesized argument signature of one tool, e.g.
 * `({ command: string, timeoutMs?: number })`. Empty when the parameter schema
 * carries nothing to say (a typeless schema): the entry then renders as a bare
 * name rather than as an argument list the model would have to unlearn.
 */
export function renderSignature(parameters) {
  if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) return ''
  const type = renderJsonSchemaType(parameters)
  return type === 'JsonValue' ? '' : `(${type})`
}

/**
 * Catalog entries for one tool surface, sorted by name so an unchanged surface
 * renders byte-identical text across assemblies. Nameless definitions are
 * skipped.
 */
export function catalogEntries(schemas, maxLength) {
  const entries = []
  for (const schema of Array.isArray(schemas) ? schemas : []) {
    const toolName = schema?.name
    if (typeof toolName !== 'string' || toolName === '') continue
    entries.push({
      name: toolName,
      signature: renderSignature(schema.parameters),
      description: catalogDescription(schema.description, maxLength),
    })
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * The program contract the injected message carries under PTC: the usage
 * instructions the harness renders in its own `tools:sdk` section — which
 * `minimal-prompt` filters out of the system prompt along with the SDK
 * declarations — restated in our own wording so the injected text is identical
 * on both sides of the presentation boundary and the promotion forces no
 * republish. `@deepseek-ai/dsh-tools` owns the contract; its parallel cap
 * (`maxParallelSubCalls`) defaults to 10, which is what makes the overlap rule
 * worth stating.
 */
const PTC_PROGRAM_LINES = [
  'The session presents these tools through `run_code`, which takes `code` — the body of an async TypeScript function (top-level `await` and `return` both work; only erasable syntax runs, no `enum` or namespaces) — and `description`, a short summary of the program. Compose one program per intent instead of one tool call per step:',
  '',
  '- reach a tool as `await tools.<name>({ ... })` — quoted access for exotic names, `tools["my-tool"]({ ... })`;',
  '- overlap independent read-only calls under `Promise.all` (safe calls run concurrently, mutating calls run alone in submission order) and sequence dependent work with `await`;',
  '- a failed call rejects with `ToolCallError`, whose `toolName` and human-readable message identify it — `try/catch` it to continue;',
  '- only what you `return` or `console.log` becomes program output; every other intermediate result stays out of the conversation, so extract just what the next decision needs, and an image a tool returns is attached after the run.',
  '',
  "`run_code` is the only tool that can be called directly once it is on the wire; the session's first turn carries the shell alone.",
]

/**
 * Model-facing catalog text. Deliberately one stable rendering for both the
 * first publication and a replacement: the text is then the complete record of
 * what was published, so a republish decision needs no field beyond it. The PTC
 * sentence is part of that record because the presentation plan is a deployment
 * fact, not a per-step one.
 */
export function renderCatalogText(entries, ptc) {
  const available = entries.length === 0
    ? ['No tools are currently available in this session.']
    : [
        '<available_tools>',
        ...entries.map(entry => `- \`${entry.name}${entry.signature}\`: ${entry.description}`),
        '</available_tools>',
      ]
  const footer = "This is the complete current list and replaces any earlier available-tools list in this session. "
    + "It carries each tool's argument signature and a one-line summary; the full parameter schema travels with its own tool definition."
  return [
    '<system-reminder>',
    'The following tools are available in this session:',
    '',
    ...available,
    '',
    footer,
    ...(ptc ? ['', ...PTC_PROGRAM_LINES] : []),
    '</system-reminder>',
  ].join('\n')
}

/** Build the durable catalog message for one entry list. */
export function createCatalogMessage(entries, ptc) {
  return {
    // Session persistence validates every replayed user/message for a
    // non-empty string id; a plugin-built message without one corrupts the
    // durable journal (SessionPersistenceCorruptionError on load).
    id: globalThis.crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: renderCatalogText(entries, ptc) }],
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

/** Register the surface staging, the PTC handoff, and the per-step catalog injection. */
export function apply(ctx, config) {
  const descriptionMaxLength = integerAtLeast(
    config?.descriptionMaxLength,
    'descriptionMaxLength',
    1,
    DEFAULT_DESCRIPTION_MAX_LENGTH,
  )
  const anchorNames = anchorToolNames(config?.anchorTools)
  const ptcEnabled = optionalBoolean(config?.ptcPresentation, 'ptcPresentation', true)

  // The last observed catalog for each live agent — the registry's SDK surface
  // when it publishes one, else the assembled wire schemas. `prepend: true`
  // makes this listener outermost, so the anchor narrowing covers what
  // `next()` returned.
  const catalogByAgent = new WeakMap()

  // Session to agent, so the boundary events a session emits can reach the
  // per-agent presentation declaration. Filled by every assembly.
  const agentBySession = new WeakMap()

  // Agents whose PTC declaration already ran. Keyed by agent so a resumed or
  // reloaded session re-declares it from the durable turn count, and latched
  // before the call so a failing declaration warns once instead of per step.
  const ptcAgents = new WeakSet()

  // One-time warnings: a broken optional path must degrade, never spam.
  let warned = false
  const warnOnce = (detail) => {
    if (warned) return
    warned = true
    try {
      ctx.logger?.warn?.(`${name}: ${detail} — keeping the native tool surface`)
    } catch {
      // Logger unavailable — the guard exists only to avoid spamming.
    }
  }

  // Read without `inject`: the catalog is the mode's core, so the plugin must
  // keep applying (and publishing a truthful fallback list) even when the
  // registry or the code runtime is absent.
  const registry = () => ctx.get('tools')

  /** Whether this deployment can present PTC at all: opted in and a runtime mounted. */
  const ptcReady = () => ptcEnabled && ctx.get('codeRuntime') !== undefined

  /**
   * Whether this session is still in its anchor turn. An empty `anchorTools`
   * disables staging, so every session reads as promoted.
   */
  const anchoring = (agent) => (
    anchorNames.length > 0 && agent !== undefined && inAnchorTurn(sessionEvents(agent?.session))
  )

  /**
   * Declare PTC presentation for one agent. The declaration is per scope
   * (`agent.ctx`), so it covers this session alone, and it must land BEFORE the
   * promoted turn's first assembly: the harness collects the tool providers
   * before it runs the `system-prompt/assemble` waterfall, so nothing a
   * waterfall listener does can change the assembly it is participating in.
   * The turn-boundary events are therefore the primary trigger; the assembly
   * listener re-asserts it for a session whose boundary was crossed while this
   * plugin was not mounted (a host restart mid-turn), where the collapse then
   * lands one assembly later.
   */
  const presentPtc = (agent) => {
    if (!ptcReady() || agent === undefined || ptcAgents.has(agent)) return
    const tools = agent?.ctx?.tools
    if (tools === undefined || typeof tools.presentAs !== 'function') {
      warnOnce('no scoped tools view to declare PTC presentation')
      return
    }
    ptcAgents.add(agent)
    try {
      tools.presentAs('ptc')
    } catch {
      // A failed declaration must never break the session; the wire stays
      // native and the catalog says so.
      warnOnce('PTC presentation declined')
    }
  }

  /**
   * The registry's PTC surface: every visible tool except the reserved
   * `run_code` transport (which the projection already excludes). Read on every
   * assembly, whatever surface the current request happens to carry, so the
   * anchor turn already names what the promoted turn reaches and the rendered
   * text does not change at the boundary. Undefined when the registry cannot
   * project it, which sends the caller to the assembled wire schemas.
   */
  const sdkSurface = (agent) => {
    const tools = registry()
    if (tools === undefined || typeof tools.sdkSchemas !== 'function') return undefined
    try {
      const schemas = tools.sdkSchemas(agent)
      return Array.isArray(schemas) && schemas.length > 0 ? schemas : undefined
    } catch {
      warnOnce('no SDK tool projection available')
      return undefined
    }
  }

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const agent = context?.agent
    const staged = anchoring(agent)
    if (!staged) presentPtc(agent)
    if (agent !== undefined) {
      if (agent.session !== undefined) agentBySession.set(agent.session, agent)
      const surface = sdkSurface(agent)
      if (surface !== undefined) catalogByAgent.set(agent, catalogEntries(surface, descriptionMaxLength))
    }
    // Downstream errors propagate untouched; only this plugin's own logic is
    // guarded (a staging bug must never brick every request of a session).
    const assembled = await next()
    if (agent !== undefined && catalogByAgent.get(agent) === undefined) {
      catalogByAgent.set(agent, catalogEntries(assembled.tools, descriptionMaxLength))
    }
    if (!staged) return assembled
    return { ...assembled, tools: anchorToolsOf(assembled.tools, anchorNames) }
  }, { prepend: true })

  // The deterministic promotion trigger: the anchor turn's end, and the second
  // turn's start. Both are emitted before the next assembly reads the wire.
  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'turn/start' && event?.type !== 'turn/end') return
    const agent = session === undefined ? undefined : agentBySession.get(session)
    if (agent === undefined || anchoring(agent)) return
    presentPtc(agent)
  })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const agent = payload?.agent
    const entries = agent === undefined ? undefined : catalogByAgent.get(agent)
    if (entries === undefined) return decision

    const ptc = ptcReady()
    const candidate = renderCatalogText(entries, ptc)
    const history = catalogHistory(agent)
    const existing = catalogMessage(decision.messages)
    if (history.text === candidate) {
      return existing === undefined ? decision : withoutMessage(decision, existing.message.id)
    }
    if (existing !== undefined && existing.text === candidate) return decision
    if (!history.published && entries.length === 0) {
      return existing === undefined ? decision : withoutMessage(decision, existing.message.id)
    }
    const catalog = createCatalogMessage(entries, ptc)
    if (existing === undefined) {
      return { ...decision, messages: [...decision.messages, catalog] }
    }
    return {
      ...decision,
      messages: decision.messages.map(message => (message.id === existing.message.id ? catalog : message)),
    }
  }, { prepend: true })
}
