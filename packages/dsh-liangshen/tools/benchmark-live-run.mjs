/**
 * One bounded live benchmark run: a real DeepSeek session driven through the
 * profile's own composition, with the evaluated preset supplied from an
 * ISOLATED preset root.
 *
 * Isolation rules this script follows:
 * - The harness home stays the real one, so credentials, settings, and the model
 *   route resolve exactly as they do for a user session. Nothing is copied or read
 *   by this script.
 * - The evaluated preset is written to a temporary root and selected through the
 *   roster's own \`roots\` config, so the shipped/user roots cannot shadow it and no
 *   installed preset is edited.
 * - Session persistence is redirected into the run directory, so real session
 *   history is never appended to.
 *
 * Usage:
 *   node tools/benchmark-live-run.mjs --variant current-four [--timeout 300000]
 */

import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')
const PRESET_SOURCE = join(PACKAGE_ROOT, 'presets', 'liangshen')
const DRIVER = join(HERE, 'benchmark-driver.mjs').replace(/\\/g, '/')

/** Fixed route every variant runs on, so the comparison isolates the preset. */
export const FIXED_ROUTE = { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' }

/** The two turns every case uses: an anchored exploration, then a promoted mutation. */
export const DEFAULT_TURNS = [
  'List the files in the current directory with the shell, then reply DONE and stop.',
  'Create a file named hello.txt whose only content is OK, then reply DONE and stop.',
]

/**
 * Variant definitions: what changes in the evaluated preset copy.
 * Each entry maps a variant id to the anchor surface its preset copy declares.
 */
export const LIVE_VARIANTS = {
  'current-four': { anchors: null, ptc: true, note: 'shipped default: four anchor tools, PTC after the boundary' },
  'bash-anchor': { anchors: ['bash'], ptc: true, note: 'single-shell anchor, PTC after the boundary' },
  'native-promotion': { anchors: ['bash'], ptc: false, note: 'single-shell anchor, native roster after the boundary' },
}

/** Build the exact cmd.exe argument vector for a trusted .cmd shim. */
function windowsCmdShimArgs(binary, args) {
  const unsafe = /[&|<>"'\`%!\n\r\0]/
  if (/["%\n\r\0]/.test(binary) || args.some((arg) => unsafe.test(arg))) {
    throw new Error('benchmark: unsafe Windows command argument')
  }
  const commandLine = '""' + binary + '" ' + args.map((arg) => '"' + arg + '"').join(' ') + '"'
  return ['/d', '/s', '/c', commandLine]
}

/** Spawn one process, capturing output, with a hard timeout. */
function spawnCaptured(command, args, options, timeoutMs) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolveResult({ code: null, stdout, stderr: stderr + String(error), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveResult({ code, stdout, stderr, timedOut })
    })
  })
}

/** Copy the preset and apply the variant's configuration change. */
export function materializePreset(root, variantId, variant) {
  const target = join(root, variantId)
  cpSync(PRESET_SOURCE, target, { recursive: true })
  const composition = join(target, 'agent.cordis.yml')
  if (variant.anchors !== null) {
    const text = readFileSync(composition, 'utf8')
    // Anchor on the config line: the composition also NAMES `anchorTools: [bash]`
    // inside its prose, and rewriting a comment would leave the real surface alone.
    const replaced = text.replace(/^(\s*)anchorTools: \[[^\]]*\]/m, `$1anchorTools: [${variant.anchors.join(', ')}]`)
    if (replaced === text) throw new Error('benchmark: the preset composition carries no anchorTools line to vary')
    writeFileSync(composition, replaced)
  }
  if (variant.ptc === false) {
    const text = readFileSync(composition, 'utf8')
    const replaced = text.replace(/ptcPresentation: true/, 'ptcPresentation: false')
    if (replaced === text) throw new Error('benchmark: the preset composition carries no ptcPresentation line to vary')
    writeFileSync(composition, replaced)
  }
  return target
}

/** Every session log under one root, newest last. */
function sessionLogs(root) {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.jsonl')) found.push(full)
    }
  }
  if (existsSync(root)) walk(root)
  return found.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
}

/**
 * Read one session log into the evidence the comparison actually needs.
 *
 * The durable shapes this reads are the ones the harness writes:
 * \`request/header\` carries \`data.header.{config,tools}\` (the real route and the
 * exact wire surface of that request), and \`system/message\` carries
 * \`data.message.content[].text\` (the assembled system prompt of that turn).
 */
export function summarizeSession(logPath) {
  const lines = readFileSync(logPath, 'utf8').split('\n').filter((line) => line.trim() !== '')
  const events = lines.map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)

  const requests = events.filter((event) => event.type === 'request/header').map((event) => {
    const header = event.data?.header ?? {}
    const config = header.config ?? {}
    return {
      seq: event.seq,
      provider: config.provider,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      tools: Array.isArray(header.tools) ? header.tools.map((tool) => tool?.name).filter(Boolean) : [],
    }
  })

  const prompts = events.filter((event) => event.type === 'system/message').map((event) => {
    const blocks = Array.isArray(event.data?.message?.content) ? event.data.message.content : []
    const text = blocks.filter((block) => block?.type === 'text').map((block) => block.text).join('\n')
    return {
      turn: event.data?.turn,
      step: event.data?.step,
      chars: text.length,
      carriesPersona: text.includes('You are a helpful software engineer assistant.'),
      carriesWorkspaceLine: text.includes('Your working directory is '),
      carriesWorkspaceInstructions: text.includes('Instructions from:'),
      carriesSdkSection: text.includes('declare const tools') || text.includes('ToolArgsMap'),
      carriesPtcRule: text.includes('run_code'),
    }
  })

  return {
    requests,
    prompts,
    ptcDispatches: events.filter((event) => event.type === 'tool/ptc-dispatch').length,
    toolCalls: events.filter((event) => event.type === 'tool/call').length,
  }
}

/** Run one live session for one variant, returning the transcript report. */
export async function runLiveVariant(options) {
  const variantId = options.variant
  const variant = LIVE_VARIANTS[variantId]
  if (variant === undefined) throw new Error(`benchmark: unknown variant "${variantId}"`)

  const runDir = mkdtempSync(join(tmpdir(), `dsh-bench-${variantId}-`))
  try {
    const presetRoot = join(runDir, 'presets')
    mkdirSync(presetRoot, { recursive: true })
    materializePreset(presetRoot, variantId, variant)

    const workspace = join(runDir, 'workspace')
    mkdirSync(workspace, { recursive: true })

    const patch = [
      '- id: headless-startup',
      '  disabled: true',
      '',
      '- id: headless-runner',
      '  disabled: true',
      '',
      '- id: session-persistence-jsonl',
      '  config:',
      `    root: ${JSON.stringify(join(runDir, 'sessions').replace(/\\/g, '/'))}`,
      '    compression: none',
      '',
      '- id: agent-default-model',
      '  config:',
      `    provider: ${FIXED_ROUTE.provider}`,
      `    model: ${FIXED_ROUTE.model}`,
      `    reasoningEffort: ${FIXED_ROUTE.reasoningEffort}`,
      '',
      '- insert:',
      '    - id: agent-presets',
      "      name: '@deepseek-ai/dsh-agent-presets'",
      '      config:',
      `        default: ${variantId}`,
      '        includeShippedRoot: false',
      '        includeUserRoot: false',
      '        roots:',
      `          - path: ${JSON.stringify(presetRoot.replace(/\\/g, '/'))}`,
      "            trust: 'user'",
      '',
      '- insert:',
      '    - id: benchmark-driver',
      `      name: ${JSON.stringify(DRIVER)}`,
      '      config:',
      `        preset: ${JSON.stringify(variantId)}`,
      '        turns:',
      ...(options.turns ?? DEFAULT_TURNS).map((turn) => `          - ${JSON.stringify(turn)}`),
      '',
    ].join('\n')

    const patchPath = join(runDir, 'variant.patch.yml')
    writeFileSync(patchPath, patch, 'utf8')

    const args = ['--profile', 'headless', '--patch', patchPath, 'run the configured turns']
    const spec = process.platform === 'win32'
      ? { command: 'cmd.exe', args: windowsCmdShimArgs('dsh', args), windowsVerbatimArguments: true }
      : { command: 'dsh', args }
    const started = Date.now()
    const child = await spawnCaptured(
      spec.command,
      spec.args,
      {
        cwd: workspace,
        env: { ...process.env },
        ...(spec.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
      },
      options.timeoutMs ?? 300000,
    )

    const outcomePath = join(workspace, 'benchmark-driver-outcome.json')
    const outcome = existsSync(outcomePath) ? JSON.parse(readFileSync(outcomePath, 'utf8')) : undefined
    const logs = sessionLogs(join(runDir, 'sessions'))
    const evidence = logs.length > 0 ? summarizeSession(logs.at(-1)) : { requests: [], prompts: [], ptcDispatches: 0, toolCalls: 0 }

    return {
      variant: variantId,
      note: variant.note,
      runDir: options.keep === true ? runDir : undefined,
      exitCode: child.code,
      timedOut: child.timedOut,
      durationMs: Date.now() - started,
      outcome,
      stderrTail: child.stderr.split('\n').filter((line) => line.trim() !== '').slice(-12).join('\n'),
      ...evidence,
      workspaceFiles: existsSync(workspace) ? readdirSync(workspace) : [],
    }
  } finally {
    if (options.keep !== true) rmSync(runDir, { recursive: true, force: true })
  }
}

const isMain = process.argv[1] !== undefined
  && (await import('node:url')).pathToFileURL(process.argv[1]).href === import.meta.url

if (isMain) {
  const args = process.argv.slice(2)
  const read = (flag, fallback) => {
    const index = args.indexOf(flag)
    return index === -1 ? fallback : args[index + 1]
  }
  const variant = read('--variant', 'current-four')
  const report = await runLiveVariant({
    variant,
    timeoutMs: Number(read('--timeout', '300000')),
    keep: args.includes('--keep'),
  })

  const outDir = read('--out', '.benchmark-results')
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, `live-${variant}.json`)
  writeFileSync(outFile, JSON.stringify(report, null, 2))

  const route = report.requests[0]
  console.log(`variant ${report.variant}: ${report.note}`)
  console.log(`  exit ${report.exitCode} in ${report.durationMs}ms   route ${route?.provider ?? '?'}/${route?.model ?? '?'}/${route?.reasoningEffort ?? '?'}`)
  for (const request of report.requests) {
    console.log(`  request seq ${request.seq}: ${request.tools.length} tool(s) [${request.tools.join(', ')}]`)
  }
  for (const prompt of report.prompts) {
    console.log(`  prompt turn ${prompt.turn}.${prompt.step}: ${prompt.chars} chars  persona=${prompt.carriesPersona} cwdLine=${prompt.carriesWorkspaceLine} instructions=${prompt.carriesWorkspaceInstructions} sdk=${prompt.carriesSdkSection} ptcRule=${prompt.carriesPtcRule}`)
  }
  console.log(`  tool calls ${report.toolCalls}, ptc dispatches ${report.ptcDispatches}, workspace ${JSON.stringify(report.workspaceFiles)}`)
  console.log(`  report ${outFile}`)
}
