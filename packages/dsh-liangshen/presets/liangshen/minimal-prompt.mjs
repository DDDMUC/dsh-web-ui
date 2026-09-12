/**
 * minimal-prompt — keep this preset's system prompt on the builtin Minimal
 * preset's one-line persona (plus the session's workspace directory) while the
 * tool surface is staged behind the anchor turn and handed to PTC presentation
 * after it.
 *
 * The assembled prompt is filtered down to the persona section, so the harness
 * identity, web-surface, tool-guidance, file-reference, and structured-output
 * sections never reach the model: the one-line surface is what anchors the
 * trajectory, and the model's capability facts arrive as the `tool-catalog`
 * pre-step message instead of system-prompt prose. Under PTC presentation that
 * filter also drops the harness's generated `tools:sdk` and `tools:ptc-only`
 * sections — the only two places the SDK bindings and the "only `run_code` may
 * be called directly" rule would otherwise appear — which is why the injected
 * catalog carries both (the SDK entries as argument signatures, the rule as its
 * closing sentence).
 *
 * WORKSPACE LINE: the bare persona says nothing about where the session
 * operates, so the selected workspace directory is appended to the persona at
 * assembly time (`Your working directory is <cwd>.`), read from the session
 * header. This is the only orientation fact the persona block carries.
 *
 * WORKSPACE INSTRUCTIONS (default `instructionSource: 'system-prompt'`): the
 * AGENTS.md-style instruction files the harness would inject as user-role
 * context are instead read at assembly time and become part of the system
 * prompt itself, as one `workspace-instructions` section appended after the
 * persona block and plan mode's policy. Discovery mirrors the harness's
 * baseline chain — `$DSH_HOME/AGENTS.md`, then `AGENTS.md` / `CLAUDE.md` and
 * their `.local` overlays from the project root (the nearest ancestor holding
 * a `.git` marker) down to the session cwd, broadest first, with the harness's
 * per-directory duplicate suppression and byte budget — so the content rides
 * the prompt on every request: it survives compaction, needs no durable
 * message, and picks up file edits on the next assembly. The section is
 * appended after the stable prefix, so the anchor's KV-cache prefix stays
 * intact. Because the harness's prompt renderer interpolates every section
 * strictly, the section text is only a `{{workspace_instructions}}` reference
 * and the rendered content travels as that assembly variable's value —
 * variable values are inserted verbatim and never re-scanned, so instruction
 * files may contain `{{...}}` examples without breaking every request. The
 * harness's own agent-instructions injections are dropped entirely in this
 * mode (the baseline would otherwise duplicate the prompt's content); the
 * harness's DYNAMIC reconciliation — nested instruction files surfaced when a
 * read/write/edit tool touches their directory — is not reproduced: those
 * injections are dropped too, and this mode's file tools (`str_replace_editor`,
 * PTC programs) rarely carry the `read` / `write` / `edit` names that trigger
 * it anyway. `instructionSource: 'hint'` restores the previous behavior: the
 * first injection becomes a single non-imperative pointer to the reference
 * files (issue #388, upstream dsh-anchored-standard #49, E1/E1.5/E2) and every
 * later injection is dropped; the model reaches the knowledge through read /
 * skill_load.
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
 * supported range. The same degradation guards the instruction reader: an
 * assembly-time read failure contributes no section (warned once) instead of
 * failing the request.
 */

import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

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
 * The section this plugin appends to the prompt with the workspace
 * instructions, and the assembly variable whose value carries the rendered
 * text. The section text is only the variable reference: the harness's
 * renderer interpolates section text strictly (an unknown `{{name}}` throws),
 * while a variable's value is inserted verbatim and never re-scanned.
 */
export const WORKSPACE_INSTRUCTIONS_SECTION_NAME = 'workspace-instructions'
export const WORKSPACE_INSTRUCTIONS_VARIABLE = 'workspace_instructions'

/** Accepted `instructionSource` values, default first. */
export const INSTRUCTION_SOURCES = ['system-prompt', 'hint']

/**
 * Instruction file candidates per directory, in the harness's order: the
 * shared names first, then the personal `.local` overlays.
 */
const INSTRUCTION_FILE_CANDIDATES = ['AGENTS.md', 'CLAUDE.md']
const LOCAL_INSTRUCTION_FILE_CANDIDATES = ['AGENTS.local.md', 'CLAUDE.local.md']

/** Directory marker that ends the project-root walk (the harness's default). */
const PROJECT_ROOT_MARKER = '.git'

/** The single user-global instruction file under the harness home. */
const USER_GLOBAL_FILE = 'AGENTS.md'
const DSH_HOME_ENV = 'DSH_HOME'
const DSH_HOME_DIR_NAME = '.dsh'

/** Files larger than this are skipped, as the harness's source cap does. */
const MAX_SOURCE_BYTES = 1048576

/** Default byte budget for the rendered workspace-instructions section. */
const DEFAULT_INSTRUCTION_MAX_BYTES = 65536

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

function optionalSource(value, field, fallback) {
  if (value === undefined) return fallback
  if (!INSTRUCTION_SOURCES.includes(value)) {
    throw new TypeError(`${name}: ${field} must be one of ${JSON.stringify(INSTRUCTION_SOURCES)}`)
  }
  return value
}

function optionalByteSize(value, field, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name}: ${field} must be a positive finite number`)
  }
  return value
}

/** Expand a leading `~` the way the harness's home paths do. */
function expandHomePath(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/** The harness home: `$DSH_HOME` when set, else `<home>/.dsh`. */
export function resolveDshHome(env = process.env) {
  const fromEnv = env[DSH_HOME_ENV]
  const raw = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), DSH_HOME_DIR_NAME)
  return resolve(expandHomePath(raw))
}

/** Model-facing display path of the harness home (`~/.dsh` or `$DSH_HOME`). */
function dshHomeDisplay(home) {
  return home === resolve(join(homedir(), DSH_HOME_DIR_NAME)) ? `~/${DSH_HOME_DIR_NAME}` : `$${DSH_HOME_ENV}`
}

async function statFile(path) {
  try {
    return await stat(path)
  } catch {
    return undefined
  }
}

/**
 * Discover the baseline instruction files for one session cwd, mirroring the
 * harness's baseline chain: the user-global file first, then every directory
 * from the project root (the nearest ancestor holding a `.git` marker, or the
 * cwd itself when none exists) down to the cwd, broadest to most specific.
 */
export async function discoverInstructionFiles(cwd, env = process.env) {
  const home = resolveDshHome(env)
  const start = resolve(cwd)
  const files = []
  const seen = new Set()
  const add = (absolutePath, displayPath) => {
    if (seen.has(absolutePath)) return
    seen.add(absolutePath)
    files.push({ absolutePath, displayPath })
  }

  const userGlobal = join(home, USER_GLOBAL_FILE)
  if ((await statFile(userGlobal))?.isFile()) {
    add(userGlobal, `${dshHomeDisplay(home)}/${USER_GLOBAL_FILE}`)
  }

  let root = start
  for (;;) {
    if (await statFile(join(root, PROJECT_ROOT_MARKER))) break
    const parent = dirname(root)
    if (parent === root) {
      root = start
      break
    }
    root = parent
  }
  const chain = []
  for (let dir = start; ; dir = dirname(dir)) {
    chain.push(dir)
    if (dir === root) break
  }
  chain.reverse()
  for (const dir of chain) {
    for (const candidates of [INSTRUCTION_FILE_CANDIDATES, LOCAL_INSTRUCTION_FILE_CANDIDATES]) {
      for (const candidate of candidates) {
        const path = join(dir, candidate)
        if ((await statFile(path))?.isFile()) add(path, relative(root, path))
      }
    }
  }
  return files
}

/** Read one instruction file, or undefined when unreadable or over the cap. */
async function readInstructionFile(path, size) {
  if (size > MAX_SOURCE_BYTES) return undefined
  try {
    const content = await readFile(path, 'utf8')
    if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_BYTES) return undefined
    return content
  } catch {
    return undefined
  }
}

/**
 * Load the discovered files' content and apply the harness's per-directory
 * duplicate suppression: within one directory the first candidate whose
 * trimmed content differs is kept, so an `AGENTS.md` and an identical
 * `CLAUDE.md` sibling collapse to one block.
 */
export async function loadInstructionFiles(cwd, env = process.env) {
  const discovered = await discoverInstructionFiles(cwd, env)
  const loaded = []
  const digestsByDir = new Map()
  for (const file of discovered) {
    const info = await statFile(file.absolutePath)
    if (!info?.isFile()) continue
    const content = await readInstructionFile(file.absolutePath, info.size)
    if (content === undefined) continue
    const dir = dirname(file.displayPath)
    let digests = digestsByDir.get(dir)
    if (digests === undefined) {
      digests = new Set()
      digestsByDir.set(dir, digests)
    }
    const digest = content.trim()
    if (digests.has(digest)) continue
    digests.add(digest)
    loaded.push({ ...file, content })
  }
  return loaded
}

/** UTF-8-safe truncation at a byte boundary, as the harness renders budgets. */
function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length <= maxBytes) return value
  let end = Math.max(0, Math.trunc(maxBytes))
  while (end > 0 && (bytes.readUInt8(end) & 0xc0) === 0x80) end -= 1
  return bytes.subarray(0, end).toString('utf8')
}

const INSTRUCTION_INTRO = 'The following workspace instructions are loaded from AGENTS.md-style files in the user\'s environment and workspace. '
  + 'They are standing guidance about the environment and workspace conventions, not per-task instructions: '
  + 'more specific files take precedence over broader ones, and a direct user instruction for the current task takes precedence over all of them.'

function instructionBudgetMarker(maxBytes, omitted, truncated) {
  const parts = []
  if (omitted.length > 0) parts.push(`omitted ${omitted.join(', ')}`)
  if (truncated !== undefined) {
    parts.push(`truncated ${truncated.displayPath} from ${truncated.originalBytes} to ${truncated.includedBytes} bytes`)
  }
  return `Workspace instruction budget ${maxBytes} bytes: ${parts.join('; ')}.`
}

function joinInstructionText(intro, marker, blocks) {
  return [intro, marker, ...blocks].filter(block => block.length > 0).join('\n\n')
}

/**
 * Render the loaded instruction files into one prompt text under a byte
 * budget, with the harness's precedence: when the whole chain does not fit,
 * the broadest files are omitted first and the most specific file is truncated
 * last, so the nearest instructions always survive. Returns undefined when the
 * budget is degenerate or nothing fits.
 */
export function renderInstructionSection(files, maxBytes) {
  if (maxBytes <= 0 || !Number.isFinite(maxBytes) || files.length === 0) return undefined
  const blocks = files.map(file => `Instructions from: ${file.displayPath}\n\n${file.content}`)
  const full = joinInstructionText(INSTRUCTION_INTRO, '', blocks)
  if (Buffer.byteLength(full, 'utf8') <= maxBytes) return full
  for (let start = 1; start < blocks.length; start += 1) {
    const omitted = files.slice(0, start).map(file => file.displayPath)
    const suffix = joinInstructionText(INSTRUCTION_INTRO, instructionBudgetMarker(maxBytes, omitted, undefined), blocks.slice(start))
    if (Buffer.byteLength(suffix, 'utf8') <= maxBytes) return suffix
  }
  // Even the most specific file does not fit whole: truncate its content to
  // the largest byte length the frame accepts.
  const last = files.at(-1)
  const omitted = files.slice(0, -1).map(file => file.displayPath)
  const originalBytes = Buffer.byteLength(last.content, 'utf8')
  const overheadBytes = Buffer.byteLength(joinInstructionText(INSTRUCTION_INTRO, instructionBudgetMarker(maxBytes, omitted, { displayPath: last.displayPath, originalBytes, includedBytes: 0 }), [`Instructions from: ${last.displayPath}\n\n`]), 'utf8')
  if (overheadBytes >= maxBytes) return undefined
  let low = 0
  let high = originalBytes
  let best = ''
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidate = truncateUtf8(last.content, mid)
    const truncated = { displayPath: last.displayPath, originalBytes, includedBytes: Buffer.byteLength(candidate, 'utf8') }
    const text = joinInstructionText(INSTRUCTION_INTRO, instructionBudgetMarker(maxBytes, omitted, truncated), [`Instructions from: ${last.displayPath}\n\n${candidate}`])
    if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
      best = text
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best.length > 0 ? best : undefined
}

/**
 * Read and render the workspace-instruction prompt text for one session, or
 * undefined when the session reports no cwd, no instruction file exists, or
 * the budget leaves nothing to send.
 */
export async function loadInstructionText(cwd, maxBytes = DEFAULT_INSTRUCTION_MAX_BYTES, env = process.env) {
  if (typeof cwd !== 'string' || cwd.length === 0) return undefined
  const files = await loadInstructionFiles(cwd, env)
  return renderInstructionSection(files, maxBytes)
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
 * Hint mode: swap full-text agent-instructions injections for the one-time
 * hint. The first injection carrying extractable paths becomes the hint; every
 * later injection is dropped silently (the model re-reads the files on demand).
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

/** System-prompt mode: drop every agent-instructions injection. */
export function dropInstructionMessages(messages) {
  return messages.filter(message => message?.source?.kind !== 'agent-instructions')
}

/**
 * Workspace line the persona gains. The one-line persona carries no
 * orientation facts, so the session's selected workspace directory is appended
 * to the persona section at assembly time. The literal cwd comes from the
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

/** Register the section filter and the workspace-instruction source. */
export function apply(ctx, config) {
  const keepPlanPolicy = optionalBoolean(config?.keepPlanPolicy, 'keepPlanPolicy', true)
  const instructionSource = optionalSource(config?.instructionSource, 'instructionSource', 'system-prompt')
  const instructionMaxBytes = optionalByteSize(config?.instructionMaxBytes, 'instructionMaxBytes', DEFAULT_INSTRUCTION_MAX_BYTES)
  const keep = new Set([
    ...PERSONA_SECTION_NAMES,
    ...(keepPlanPolicy ? [PLAN_POLICY_SECTION_NAME] : []),
  ])

  // Per-session hint state (hint mode only). A compaction rewrites the
  // model-visible surface, so the next agent-instructions injection is a
  // fresh first injection and may be hinted again.
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
  const warnOnce = (message) => {
    if (warned) return
    warned = true
    try {
      ctx.logger?.warn?.(message)
    } catch {
      // Logger unavailable — the guard exists only to avoid spamming.
    }
  }

  // `prepend: true` puts the filter at the outermost position of the
  // waterfall, so `await next()` always observes the complete downstream
  // section list (including sections other listeners added) before it is
  // narrowed to the persona and extended with the workspace instructions.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    // Downstream errors propagate untouched; only this filter's own logic is
    // guarded (a filter bug must never brick every request of a session).
    const assembled = await next()
    if (!Array.isArray(assembled.sections)) return assembled
    const sections = assembled.sections.filter(section => keep.has(section?.name))
    if (sections.length === 0) {
      // A persona-less assembly must not become an empty system prompt: keep
      // the assembled prompt and say so once.
      warnOnce(`${name}: no section matched ${JSON.stringify([...keep])} — `
        + 'keeping the assembled prompt instead of sending an empty one')
      return assembled
    }
    const narrowed = withWorkspaceLine(sections, context?.agent)
    if (instructionSource !== 'system-prompt') return { ...assembled, sections: narrowed }
    let text
    try {
      text = await loadInstructionText(context?.agent?.session?.header?.cwd, instructionMaxBytes)
    } catch (error) {
      warnOnce(`${name}: reading the workspace instructions failed — sending the prompt without them (${error instanceof Error ? error.message : String(error)})`)
      return { ...assembled, sections: narrowed }
    }
    if (text === undefined) return { ...assembled, sections: narrowed }
    // The rendered content travels as an assembly variable: the harness's
    // renderer interpolates section text strictly, and instruction files may
    // legitimately contain `{{...}}` examples. Variable values are inserted
    // verbatim and never re-scanned.
    return {
      ...assembled,
      sections: [...narrowed, { name: WORKSPACE_INSTRUCTIONS_SECTION_NAME, text: `{{${WORKSPACE_INSTRUCTIONS_VARIABLE}}}` }],
      variables: { ...assembled.variables, [WORKSPACE_INSTRUCTIONS_VARIABLE]: text },
    }
  }, { prepend: true })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    if (instructionSource === 'system-prompt') {
      return decision.messages.some(message => message?.source?.kind === 'agent-instructions')
        ? { ...decision, messages: dropInstructionMessages(decision.messages) }
        : decision
    }
    const session = payload?.agent?.session
    if (session === undefined) return decision
    return { ...decision, messages: instructionHintMessages(decision.messages, stateFor(session)) }
  }, { prepend: true })

  ctx.on('session/event', (session, event) => {
    if (event?.type === 'compaction/end') hintedBySession.delete(session)
  })
}
