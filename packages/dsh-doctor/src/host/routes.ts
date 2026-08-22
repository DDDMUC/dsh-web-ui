import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { DOCTOR_PROTOCOL_VERSION, type SupervisorRequest } from '../core/protocol.ts'
import { isLoopbackRequest } from './loopback.ts'
import type { SupervisorClient } from './client.ts'
import type { DoctorLifecycle } from './ensure.ts'

const PREFIX = '/api/doctor'
const MAX_BODY = 64 * 1024

function json(res: ServerResponse, status: number, value: unknown): void { const body = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(body) }

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) { const buffer = Buffer.from(chunk as Buffer); size += buffer.length; if (size > MAX_BODY) throw new Error('doctor: body too large'); chunks.push(buffer) }
  const text = Buffer.concat(chunks).toString('utf8'); if (!text.trim()) return {}
  const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('doctor: body must be an object')
  return value as Record<string, unknown>
}

export interface DoctorRouteOptions {
  /** Version of the host half (package.json), surfaced for console comparisons. */
  hostVersion: string
  /** Lifecycle verbs (service install/uninstall + capsule refresh). */
  lifecycle: DoctorLifecycle
  /** Whether the supervisor state is provisioned; drives the offline error code. */
  provisioned?: () => Promise<boolean>
}

export function makeDoctorRoutes(client: SupervisorClient, profileId: string, options: DoctorRouteOptions): WebRoute[] {
  const guard = (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) { res.writeHead(403); res.end('forbidden'); return }
    try { await handler(req, res) } catch (error) { json(res, 500, { ok: false, error: { code: 'DOCTOR_ROUTE_FAILED', message: error instanceof Error ? error.message : String(error) } }) }
  }
  return [
    {
      kind: 'exact',
      path: PREFIX + '/status',
      handler: guard(async (_req, res) => {
        try {
          const response = await client.status()
          json(res, 200, { ...response, hostVersion: options.hostVersion })
        } catch (error) {
          const provisioned = options.provisioned === undefined ? true : await options.provisioned().catch(() => false)
          json(res, 503, { ok: false, error: { code: provisioned ? 'SUPERVISOR_DOWN' : 'SUPERVISOR_UNPROVISIONED', message: error instanceof Error ? error.message : String(error) } })
        }
      }),
    },
    {
      kind: 'exact',
      path: PREFIX + '/action',
      handler: guard(async (req, res) => {
        const value = await body(req)
        const allowed: readonly string[] = ['provision', 'exercise', 'diagnose', 'repair', 'confirm', 'rollback', 'pause', 'resume', 'uninstall']
        const action = value.action
        if (typeof action !== 'string' || !allowed.includes(action)) { json(res, 400, { ok: false, error: { code: 'INVALID_ACTION', message: 'Unsupported action' } }); return }
        // Lifecycle verbs are orchestrated by the host half (service deploy and
        // capsule refresh) instead of relayed to the supervisor: they must work
        // even while the supervisor is absent.
        if (action === 'provision' || action === 'uninstall') {
          const report = action === 'provision' ? await options.lifecycle.ensure() : await options.lifecycle.uninstall()
          if (!report.ok) { json(res, 500, { ok: false, error: { code: report.code, message: report.message } }); return }
          let snapshot
          try { snapshot = (await client.status()).snapshot } catch { /* supervisor may still be restarting */ }
          json(res, 200, { ok: true, snapshot, hostVersion: options.hostVersion })
          return
        }
        const request: SupervisorRequest = {
          protocol: DOCTOR_PROTOCOL_VERSION,
          type: 'action',
          action: action as Extract<SupervisorRequest, { type: 'action' }>['action'],
          profileId: typeof value.profileId === 'string' ? value.profileId : profileId,
          incidentId: typeof value.incidentId === 'string' ? value.incidentId : undefined,
        }
        json(res, 200, { ...await client.call(request), hostVersion: options.hostVersion })
      }),
    },
    {
      kind: 'exact',
      path: PREFIX + '/client-failure',
      handler: guard(async (req, res) => {
        const value = await body(req)
        if (typeof value.message !== 'string' || value.message.trim() === '') { json(res, 400, { ok: false, error: { code: 'INVALID_FAILURE', message: 'message is required' } }); return }
        json(res, 200, await client.call({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'client-failure', profileId, runId: typeof value.runId === 'string' ? value.runId : process.env.DSH_DOCTOR_RUN_ID, at: new Date().toISOString(), message: value.message.slice(0, 4096), stack: typeof value.stack === 'string' ? value.stack.slice(0, 16_384) : undefined, phase: typeof value.phase === 'string' ? value.phase.slice(0, 128) : undefined }))
      }),
    },
  ]
}
