/**
 * The CLI gateway: installs and removals executed by spawning the official
 * `dsh plugin --profile <name> add|remove` CLI — the single writer for the
 * profile — with a bounded job table the HTTP layer polls. Every run captures
 * a layer snapshot before and after so the caller can render exactly what the
 * CLI changed (the conflict ledger). The npm web runtime has no installer
 * service, so this gateway is its write path; on runtimes with official
 * channels the browser half never calls it.
 * @module @linxin666/dsh-client-ui-plugin-manager/host
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { InstalledPluginItem } from '../core/protocol.ts'
import type { ControlChange } from '../core/conflict.ts'
import { diffLayer, overlappingIds, significantChanges, type LayerChange, type LayerSnapshot } from '../core/patch-diff.ts'
import { readPatchText, readProfileManifest, type ProfileFacts } from './profile.ts'
import { parsePatch, bareRowEnabled, bareRowId, setRowEnabled, writePatchAtomic } from './rows.ts'
import { buildPluginRow, claimedEntryIdsOf } from './state.ts'

/** Hard deadline for one CLI add (git clones can take minutes). */
const ADD_TIMEOUT_MS = 6 * 60_000
/** Hard deadline for one CLI remove. */
const REMOVE_TIMEOUT_MS = 2 * 60_000
/** Bounded capture of the CLI output (the tail survives). */
const MAX_OUTPUT_CHARS = 32_000

/** One CLI-backed operation in flight or settled. */
export interface GatewayJob {
  id: string
  action: 'install' | 'remove'
  spec: string
  phase: 'running' | 'done' | 'error'
  /** The installed row on success (install) or the removed row (remove). */
  plugin?: InstalledPluginItem
  /** Layer changes the CLI applied, normalized for the conflict panel. */
  conflicts?: ControlChange[]
  error?: string
}

/** The binary search roots for the dsh CLI. */
export function findDshBinary(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const candidates: string[] = []
  const separator = platform === 'win32' ? ';' : ':'
  for (const dir of (env.PATH ?? '').split(separator)) {
    if (dir === '') continue
    if (platform === 'win32') {
      candidates.push(`${dir}\\dsh.cmd`, `${dir}\\dsh.exe`)
    } else {
      candidates.push(`${dir}/dsh`)
    }
  }
  if (platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/dsh', '/usr/local/bin/dsh')
  }
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate
  }
  return null
}

/** Append bounded CLI output (stdout + stderr interleaved is not preserved; tail wins). */
function capture(chunk: Buffer, buffer: { value: string }): void {
  buffer.value = (buffer.value + chunk.toString()).slice(-MAX_OUTPUT_CHARS)
}

/**
 * The spawn command for the dsh CLI on this platform. Windows runs the
 * npm-generated dsh.cmd wrapper by resolving its node binary and bin.js script
 * and spawning them directly: going through cmd.exe splits unquoted paths with
 * spaces (`'D:\Program' is not recognized`).
 * @param binary - the dsh CLI path found by {@link findDshBinary}.
 * @param platform - process platform (test seam).
 * @param localNodeExists - existence probe (test seam).
 * @returns the executable and the argument prefix to run the dsh bin script.
 */
export function dshSpawnCommand(
  binary: string,
  platform: string = process.platform,
  localNodeExists: (path: string) => boolean = existsSync,
): { command: string; argsPrefix: string[] } {
  if (platform !== 'win32') return { command: binary, argsPrefix: [] }
  const dir = dirname(binary)
  const localNode = join(dir, 'node.exe')
  const binJs = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return { command: localNodeExists(localNode) ? localNode : process.execPath, argsPrefix: [binJs] }
}

/** Spawn the dsh CLI with piped stdio and no shell parsing (see {@link dshSpawnCommand}). */
export function spawnDsh(binary: string, args: string[], env: NodeJS.ProcessEnv) {
  const { command, argsPrefix } = dshSpawnCommand(binary)
  return spawn(command, [...argsPrefix, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** Feature string the official installer channels carry in the boot dump. */
const OFFICIAL_INSTALLER_MARK = 'plugin-installer'

/**
 * Detect whether the official installer channels exist on this runtime by
 * dumping the boot composition once: the npm-published web never contains
 * `plugin-installer` entries, DSHCode and the checkout web do. The browser
 * half reads the verdict from the `/mode` route so its channel probe never
 * has to hit the missing official route (which 405s into the console).
 * @param binary - dsh CLI path.
 * @param profileName - boot profile name.
 * @param env - process environment.
 * @param spawnImpl - spawn seam (test seam).
 * @returns true when the dump names the official installer channels.
 */
export async function detectOfficialChannels(
  binary: string,
  profileName: string,
  env: NodeJS.ProcessEnv = process.env,
  spawnImpl: typeof spawnDsh = spawnDsh,
): Promise<boolean> {
  const output = { value: '' }
  const child = spawnImpl(binary, ['--profile', profileName, '--dump-config'], env)
  child.stdout?.on('data', (chunk: Buffer) => { output.value = (output.value + chunk.toString()).slice(-MAX_OUTPUT_CHARS) })
  child.stderr?.on('data', (chunk: Buffer) => { output.value = (output.value + chunk.toString()).slice(-MAX_OUTPUT_CHARS) })
  const code = await new Promise<number | null>(resolve => { child.on('close', resolve) })
  if (code !== 0) return false
  return output.value.includes(OFFICIAL_INSTALLER_MARK)
}

/** One layer snapshot plus the dependency list of the profile. */
interface CapturedState {
  layer: LayerSnapshot
  dependencies: string[]
}

/** The gateway: serializes CLI operations through one job table. */
export class CliGateway {
  private readonly jobs = new Map<string, GatewayJob>()
  private counter = 0

  /** @param facts - resolved profile locations. */
  constructor(
    private readonly facts: ProfileFacts,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  /** Start an install; the caller polls {@link status}. */
  install(spec: string): { jobId: string } {
    const job: GatewayJob = { id: `job-${++this.counter}`, action: 'install', spec, phase: 'running' }
    this.jobs.set(job.id, job)
    void this.run(job, ['plugin', '--profile', this.facts.profileName, 'add', spec], ADD_TIMEOUT_MS)
    return { jobId: job.id }
  }

  /** Start a removal; the caller polls {@link status}. */
  remove(id: string): { jobId: string } {
    const job: GatewayJob = { id: `job-${++this.counter}`, action: 'remove', spec: id, phase: 'running' }
    this.jobs.set(job.id, job)
    void this.run(job, ['plugin', '--profile', this.facts.profileName, 'remove', id], REMOVE_TIMEOUT_MS)
    return { jobId: job.id }
  }

  /** Read one job's current state (a shallow copy). */
  status(jobId: string): GatewayJob | undefined {
    const job = this.jobs.get(jobId)
    if (job === undefined) return undefined
    return { ...job, conflicts: job.conflicts === undefined ? undefined : [...job.conflicts] }
  }

  /** Capture the layer snapshot and the dependency names (tolerant parse). */
  private async capture(): Promise<CapturedState> {
    const rows = new Map<string, boolean>()
    let patchText = '[]\n'
    try {
      patchText = await readFile(this.facts.patchPath, 'utf8')
    } catch {
      patchText = '[]\n'
    }
    try {
      const { root } = parsePatch(patchText, this.facts.patchPath)
      for (const item of root.items) {
        const id = bareRowId(item)
        if (id !== undefined) rows.set(id, bareRowEnabled(item))
      }
    } catch {
      // A broken patch file must not block an install: the CLI owns the write
      // and the error surfaces through its output.
    }
    let bundles: string[] = []
    let dependencies: string[] = []
    try {
      const manifest = await readProfileManifest(this.facts.packageJsonPath)
      bundles = manifest.bundles
      dependencies = Object.keys(manifest.dependencies)
    } catch {
      bundles = []
      dependencies = []
    }
    return { layer: { rows, bundles }, dependencies }
  }

  /** The plugin row a finished operation produced (installed or removed). */
  private async rowFor(action: 'install' | 'remove', spec: string, before: CapturedState, after: CapturedState): Promise<InstalledPluginItem | undefined> {
    let targetName: string | undefined
    if (action === 'install') {
      targetName = after.dependencies.find(name => !before.dependencies.includes(name))
    } else {
      targetName = before.dependencies.find(name => !after.dependencies.includes(name)) ?? spec
    }
    if (targetName === undefined) return undefined
    const specValue = await readProfileManifest(this.facts.packageJsonPath)
      .then(manifest => manifest.dependencies[targetName as string] ?? spec)
      .catch(() => spec)
    return buildPluginRow(this.facts, targetName, specValue, after.layer.rows)
  }

  /** Run one CLI operation to settlement. */
  private async run(job: GatewayJob, args: string[], timeoutMs: number): Promise<void> {
    const binary = findDshBinary(this.env)
    if (binary === null) {
      job.phase = 'error'
      job.error = 'plugin-manager: dsh CLI not found on PATH'
      return
    }
    const before = await this.capture()
    const output = { value: '' }
    const child = spawnDsh(binary, args, this.env)
    child.stdout?.on('data', (chunk: Buffer) => { capture(chunk, output) })
    child.stderr?.on('data', (chunk: Buffer) => { capture(chunk, output) })
    const timer = setTimeout(() => { child.kill() }, timeoutMs)
    const code = await new Promise<number | null>(resolve => {
      child.on('close', resolve)
    })
    clearTimeout(timer)
    if (code !== 0) {
      job.phase = 'error'
      const tail = output.value.trim()
      job.error = tail === '' ? `plugin-manager: dsh plugin ${job.action} exited with code ${String(code)}` : tail
      return
    }
    const after = await this.capture()
    const conflicts = significantChanges(diffLayer(before.layer, after.layer))
    if (job.action === 'install') {
      const duplicate = await this.detectDuplicateClaims(before, after)
      if (duplicate !== undefined) {
        // A boot-blocking duplicate entry id: disable the new plugin's rows so
        // the next start cannot double-mount, and surface the conflict with
        // its undo and repair affordances.
        await this.disableEntries(duplicate.ids)
        conflicts.push({ id: duplicate.ids[0] ?? duplicate.name, from: 'enabled', to: 'disabled' })
      }
      await this.verifyBoot(job, before, after, conflicts)
    }
    job.conflicts = conflicts.map(change => ({
      id: change.id,
      name: change.id,
      from: change.from,
      to: change.to,
    }))
    job.plugin = await this.rowFor(job.action, job.spec, before, after)
    if (job.phase !== 'error') job.phase = 'done'
  }

  /** The new dependency of an install, when one exists. */
  private newDependency(before: CapturedState, after: CapturedState): string | undefined {
    return after.dependencies.find(name => !before.dependencies.includes(name))
  }

  /** The claimed entry ids of one installed dependency (its own bundle patch, or its name). */
  private claimedEntriesOf(name: string): Promise<string[]> {
    return claimedEntryIdsOf(this.facts, name)
  }

  /** Whether the new install claims an entry id another plugin already holds. */
  private async detectDuplicateClaims(before: CapturedState, after: CapturedState): Promise<{ name: string; ids: string[] } | undefined> {
    const name = this.newDependency(before, after)
    if (name === undefined) return undefined
    const claimed = await this.claimedEntriesOf(name)
    const taken = new Set<string>(after.layer.rows.keys())
    for (const dep of after.dependencies) {
      if (dep === name) continue
      for (const id of await this.claimedEntriesOf(dep)) taken.add(id)
    }
    const overlap = overlappingIds(claimed, taken)
    if (overlap.length === 0) return undefined
    return { name, ids: overlap }
  }

  /** Disable every listed entry id via bare override rows (backup + tmp + rename). */
  private async disableEntries(ids: string[]): Promise<void> {
    let text = await readPatchText(this.facts.patchPath)
    let changed = false
    for (const id of ids) {
      const next = setRowEnabled(text, this.facts.patchPath, id, id, false)
      if (next !== text) {
        text = next
        changed = true
      }
    }
    if (!changed) return
    await writePatchAtomic(this.facts.patchPath, text)
  }

  /**
   * Boot preflight after an install: compose the profile with the CLI's
   * `--dump-config` (resolves every entry without binding the port). A failure
   * that implicates the new plugin disables it so the next start cannot fail;
   * an unrelated failure is reported without touching anything.
   */
  private async verifyBoot(job: GatewayJob, before: CapturedState, after: CapturedState, conflicts: LayerChange[]): Promise<void> {
    const binary = findDshBinary(this.env)
    if (binary === null) return
    const name = this.newDependency(before, after)
    const verifyOutput = { value: '' }
    const child = spawnDsh(binary, ['--profile', this.facts.profileName, '--dump-config'], this.env)
    child.stdout?.on('data', (chunk: Buffer) => { capture(chunk, verifyOutput) })
    child.stderr?.on('data', (chunk: Buffer) => { capture(chunk, verifyOutput) })
    const timer = setTimeout(() => { child.kill() }, 90_000)
    const code = await new Promise<number | null>(resolve => {
      child.on('close', resolve)
    })
    clearTimeout(timer)
    if (code === 0) return
    const tail = verifyOutput.value.trim()
    if (name === undefined) {
      job.phase = 'error'
      job.error = tail === '' ? 'plugin-manager: boot preflight failed' : tail
      return
    }
    const claimed = await this.claimedEntriesOf(name)
    const implicated = tail.includes(name) || claimed.some(id => tail.includes(id))
    if (implicated) {
      await this.disableEntries(claimed)
      conflicts.push({ id: claimed[0] ?? name, from: 'enabled', to: 'disabled' })
      job.phase = 'error'
      job.error = tail === ''
        ? `plugin-manager: 启动预检失败，已自动禁用 ${name}`
        : `plugin-manager: 启动预检失败，已自动禁用 ${name}：\n${tail}`
    } else {
      job.phase = 'error'
      job.error = tail === ''
        ? 'plugin-manager: 启动预检失败（与本次安装无关）'
        : `plugin-manager: 启动预检失败（与本次安装无关）：\n${tail}`
    }
  }
}
