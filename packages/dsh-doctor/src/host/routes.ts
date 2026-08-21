import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { DOCTOR_PROTOCOL_VERSION, type SupervisorRequest } from '../core/protocol.ts'
import { isLoopbackRequest } from './loopback.ts'
import type { SupervisorClient } from './client.ts'

const PREFIX = '/api/doctor'
const MAX_BODY = 64 * 1024
function json(res: ServerResponse, status: number, value: unknown): void { const body = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(body) }
async function body(req: IncomingMessage): Promise<Record<string, unknown>> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { const buffer = Buffer.from(chunk as Buffer); size += buffer.length; if (size > MAX_BODY) throw new Error('doctor: body too large'); chunks.push(buffer) } const text = Buffer.concat(chunks).toString('utf8'); if (!text.trim()) return {}; const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('doctor: body must be an object'); return value as Record<string, unknown> }
export function makeDoctorRoutes(client: SupervisorClient, profileId: string): WebRoute[] {
  const guard = (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => async (req: IncomingMessage, res: ServerResponse): Promise<void> => { if (!isLoopbackRequest(req)) { res.writeHead(403); res.end('forbidden'); return } try { await handler(req, res) } catch (error) { json(res, 500, { ok: false, error: { code: 'DOCTOR_ROUTE_FAILED', message: error instanceof Error ? error.message : String(error) } }) } }
  return [
    { kind: 'exact', path: PREFIX + '/status', handler: guard(async (_req, res) => json(res, 200, await client.status())) },
    { kind: 'exact', path: PREFIX + '/action', handler: guard(async (req, res) => { const value = await body(req); const allowed = ['provision', 'exercise', 'diagnose', 'repair', 'confirm', 'rollback', 'pause', 'resume', 'uninstall'] as const; const action = value.action; if (typeof action !== 'string' || !(allowed as readonly string[]).includes(action)) { json(res, 400, { ok: false, error: { code: 'INVALID_ACTION', message: 'Unsupported action' } }); return } const request: SupervisorRequest = { protocol: DOCTOR_PROTOCOL_VERSION, type: 'action', action: action as typeof allowed[number], profileId: typeof value.profileId === 'string' ? value.profileId : profileId, incidentId: typeof value.incidentId === 'string' ? value.incidentId : undefined }; json(res, 200, await client.call(request)) }) },
    { kind: 'exact', path: PREFIX + '/client-failure', handler: guard(async (req, res) => { const value = await body(req); if (typeof value.message !== 'string' || value.message.trim() === '') { json(res, 400, { ok: false, error: { code: 'INVALID_FAILURE', message: 'message is required' } }); return } json(res, 200, await client.call({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'client-failure', profileId, runId: typeof value.runId === 'string' ? value.runId : process.env.DSH_DOCTOR_RUN_ID, at: new Date().toISOString(), message: value.message.slice(0, 4096), stack: typeof value.stack === 'string' ? value.stack.slice(0, 16_384) : undefined, phase: typeof value.phase === 'string' ? value.phase.slice(0, 128) : undefined })) }) },
  ]
}
