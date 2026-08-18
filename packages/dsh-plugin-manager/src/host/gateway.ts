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
import type { InstalledPluginItem } from '../core/protocol.ts'
import type { ControlChange } from '../core/conflict.ts'
import { diffLayer, type LayerSnapshot } from '../core/patch-diff.ts'
import { readProfileManifest, type ProfileFacts } from './profile.ts'
import { parsePatch, bareRowEnabled, bareRowId } from './rows.ts'
import { buildPluginRow } from './state.ts'

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
    const child = spawn(binary, args, {
      env: this.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
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
    job.conflicts = diffLayer(before.layer, after.layer).map(change => ({
      id: change.id,
      name: change.id,
      from: change.from,
      to: change.to,
    }))
    job.plugin = await this.rowFor(job.action, job.spec, before, after)
    job.phase = 'done'
  }
}
