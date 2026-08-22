import { mkdir, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:net'
import { join } from 'node:path'
import { DOCTOR_PROTOCOL_VERSION, isSupervisorRequest, type SupervisorRequest, type SupervisorResponse } from '../core/protocol.ts'
import { appendJsonLine, readJson, writeJsonAtomic } from '../core/store.ts'
import { ensureToken, tokensEqual, type WireEnvelope } from './ipc.ts'
import { doctorPaths, type DoctorPaths } from './paths.ts'
import { emptyState, openIncident, recordFailure, snapshotOf, upsertProfile, type PersistedState } from './state.ts'

export interface SupervisorOptions { paths?: DoctorPaths; version?: string; now?: () => string; heartbeatTimeoutMs?: number }
export class DoctorSupervisor {
  readonly paths: DoctorPaths
  private state: PersistedState = emptyState()
  private token = ''
  private server?: Server
  private sweep?: NodeJS.Timeout
  private readonly version: string
  private readonly now: () => string
  private readonly heartbeatTimeoutMs: number
  constructor(options: SupervisorOptions = {}) { this.paths = options.paths ?? doctorPaths(); this.version = options.version ?? '0.2.8'; this.now = options.now ?? (() => new Date().toISOString()); this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 15_000 }
  async start(): Promise<void> {
    await mkdir(this.paths.state, { recursive: true, mode: 0o700 })
    this.token = await ensureToken(this.paths.token)
    this.state = await readJson(join(this.paths.state, 'supervisor.json'), emptyState())
    this.state.phase = this.state.paused ? 'disabled' : 'armed'
    if (process.platform !== 'win32') await rm(this.paths.socket, { force: true })
    this.server = createServer({ allowHalfOpen: true }, socket => {
      socket.setEncoding('utf8'); let body = ''
      socket.on('data', chunk => { body += chunk; if (body.length > 256 * 1024) socket.destroy(new Error('doctor: IPC body too large')) })
      const respond = (value: SupervisorResponse): void => {
        if (socket.destroyed || socket.writableEnded) return
        socket.end(JSON.stringify(value))
      }
      socket.on('error', () => undefined)
      socket.on('end', () => { void this.handleWire(body).then(respond, error => respond({ ok: false, error: { code: 'INTERNAL', message: String(error) } })) })
    })
    await new Promise<void>((resolvePromise, reject) => { this.server!.once('error', reject); this.server!.listen(this.paths.socket, () => resolvePromise()) })
    this.sweep = setInterval(() => { void this.sweepHeartbeats() }, 5000); this.sweep.unref?.()
    await this.persist()
  }
  async stop(): Promise<void> { if (this.sweep) clearInterval(this.sweep); if (this.server) await new Promise<void>(resolvePromise => this.server!.close(() => resolvePromise())); if (process.platform !== 'win32') await rm(this.paths.socket, { force: true }); await this.persist() }
  async handleWire(body: string): Promise<SupervisorResponse> {
    let envelope: WireEnvelope
    try { envelope = JSON.parse(body.trim()) as WireEnvelope } catch { return { ok: false, error: { code: 'INVALID_JSON', message: 'Invalid request' } } }
    if (!tokensEqual(envelope.token ?? '', this.token)) return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }
    if (!isSupervisorRequest(envelope.request)) return { ok: false, error: { code: 'INVALID_REQUEST', message: 'Unsupported request' } }
    return this.handle(envelope.request)
  }
  async handle(request: SupervisorRequest): Promise<SupervisorResponse> {
    const at = this.now()
    if (request.type === 'status') return { ok: true, snapshot: snapshotOf(this.state, this.version, at) }
    if (request.type === 'launcher-start') {
      if (request.profile.role === 'rescue') return { ok: true, snapshot: snapshotOf(this.state, this.version, at) }
      const profile = upsertProfile(this.state, request.profile); Object.assign(profile, { phase: 'starting', pid: request.pid, runId: request.runId, command: request.argv, startedAt: request.at, managed: true })
    } else if (request.type === 'heartbeat') {
      const profile = this.state.profiles[request.profileId]
      if (profile) Object.assign(profile, { phase: request.phase === 'ready' ? 'healthy' : request.phase === 'degraded' ? 'degraded' : 'starting', pid: request.pid, runId: request.runId, lastHealthyAt: request.at })
    } else if (request.type === 'launcher-exit') {
      const profile = this.state.profiles[request.profileId]
      if (profile) { profile.pid = undefined; profile.phase = request.intentional || request.exitCode === 0 ? 'exited' : 'failed'
        if (!request.intentional && request.exitCode !== 0) { const failures = recordFailure(this.state, request.profileId, request.at); profile.restartCount = failures; if (failures >= 2) profile.phase = 'quarantined'; openIncident(this.state, request.profileId, request.started ? 'process-crash' : 'boot-failure', request.started ? 'DSH process crashed after startup' : 'DSH profile failed during startup', [request.stderrTail ?? ''].filter(Boolean), request.at) }
      }
    } else if (request.type === 'client-failure') {
      openIncident(this.state, request.profileId, 'client-failure', request.message, [request.stack ?? '', request.phase ?? ''].filter(Boolean), request.at)
    } else if (request.type === 'action') {
      if (request.action === 'pause') { this.state.paused = true; this.state.phase = 'disabled' }
      else if (request.action === 'resume') { this.state.paused = false; this.state.phase = 'armed' }
      else if (request.incidentId) { const incident = this.state.incidents[request.incidentId]; if (incident) { incident.phase = request.action === 'rollback' ? 'rolled-back' : request.action === 'confirm' || request.action === 'repair' ? 'repairing' : request.action === 'diagnose' ? 'diagnosing' : incident.phase; if (request.action === 'diagnose' || request.action === 'repair' || request.action === 'confirm' || request.action === 'rollback') await this.runRecovery(request.action, request.incidentId, at) } }
    }
    await appendJsonLine(join(this.paths.logs, 'journal.jsonl'), { at, request: request.type })
    await this.persist()
    return { ok: true, snapshot: snapshotOf(this.state, this.version, at) }
  }
  /** Run the deterministic recovery workflow for one incident; records the outcome on the incident. */
  private async runRecovery(action: 'diagnose' | 'repair' | 'confirm' | 'rollback', incidentId: string, at: string): Promise<void> {
    const incident = this.state.incidents[incidentId]
    const profile = this.state.profiles[incident?.profileId ?? '']
    if (incident === undefined || profile === undefined) return
    try {
      const request = { home: profile.identity.dshHome, profile: profile.identity.name, dshPath: profile.identity.dshExecutable }
      const { diagnoseAndPlan, repairProfile, rollbackTransaction } = await import('../core/recover.ts')
      let outcome
      if (action === 'diagnose') outcome = await diagnoseAndPlan(request)
      else if (action === 'rollback') {
        const { readdir, readFile } = await import('node:fs/promises')
        const { doctorRoot } = await import('../core/paths.ts')
        const dir = doctorRoot(request.home) + '/transactions'
        let latest
        try { latest = (await readdir(dir)).filter(name => name.endsWith('.json')).sort().reverse()[0] } catch { latest = undefined }
        outcome = latest === undefined ? undefined : await rollbackTransaction(request, latest.slice(0, -5))
      } else {
        const running = profile.phase === 'starting' || profile.phase === 'healthy' || profile.phase === 'degraded'
        outcome = await repairProfile({ ...request, allowLive: !running, dshPath: profile.identity.dshExecutable })
      }
      if (outcome === undefined) return
      incident.updatedAt = at
      incident.evidence = [...new Set([...incident.evidence, 'recovery: ' + outcome.phase + (outcome.message !== undefined ? ' - ' + outcome.message : '')])]
      if (outcome.ok) incident.phase = action === 'rollback' ? 'rolled-back' : 'recovered'
      else if (outcome.phase === 'failed' || outcome.phase === 'blocked' || outcome.phase === 'aborted') incident.phase = 'unresolved'
    } catch (error) {
      incident.updatedAt = at
      incident.evidence = [...incident.evidence, 'recovery error: ' + (error instanceof Error ? error.message : String(error))]
    }
  }
  private async persist(): Promise<void> { await writeJsonAtomic(join(this.paths.state, 'supervisor.json'), this.state) }
  private async sweepHeartbeats(): Promise<void> { const at = this.now(); const now = Date.parse(at); for (const profile of Object.values(this.state.profiles)) { if (profile.phase === 'healthy' && profile.lastHealthyAt && now - Date.parse(profile.lastHealthyAt) > this.heartbeatTimeoutMs) { profile.phase = 'suspected'; openIncident(this.state, profile.identity.id, 'heartbeat-timeout', 'Doctor heartbeat timed out', [`last heartbeat: ${profile.lastHealthyAt}`], at) } } await this.persist() }
}

export async function runSupervisor(): Promise<void> { const supervisor = new DoctorSupervisor(); await supervisor.start(); const stop = (): void => { void supervisor.stop().finally(() => process.exit(0)) }; process.on('SIGINT', stop); process.on('SIGTERM', stop) }
