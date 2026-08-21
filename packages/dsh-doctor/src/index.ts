import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import { doctorPaths } from './agent/paths.ts'
import { currentProfile } from './host/profile.ts'
import { SupervisorClient } from './host/client.ts'
import { startHeartbeat } from './host/heartbeat.ts'
import { makeDoctorRoutes } from './host/routes.ts'
import { mountOnce } from './mount-once.ts'

export const name = 'doctor'
export const inject = ['webServer']
export interface Config { enabled?: boolean; fullProtection?: boolean; autoRepair?: boolean; heartbeatIntervalMs?: number }
export const Config: z<Config> = z.object({ enabled: z.boolean().default(false), fullProtection: z.boolean().default(true), autoRepair: z.boolean().default(true), heartbeatIntervalMs: z.number().min(1000).default(5000) })
export const DOCTOR_SETTINGS_NAMESPACE = settingsNamespace('doctor')

export const apply = mountOnce('@linxin666/dsh-doctor', (ctx: Context, config?: Config): void => {
  let current: () => Config = () => config ?? {}
  let disposeRuntime: (() => void) | undefined
  const sync = (): void => {
    disposeRuntime?.(); disposeRuntime = undefined
    if (!(current().enabled ?? false)) return
    const profile = currentProfile(); const client = new SupervisorClient(doctorPaths())
    const routeDisposers = makeDoctorRoutes(client, profile.id).map(route => ctx.webServer.register(route))
    const disposeHeartbeat = startHeartbeat({ client, profileId: profile.id, runId: process.env.DSH_DOCTOR_RUN_ID || 'unmanaged-' + process.pid, intervalMs: current().heartbeatIntervalMs ?? 5000, webUrl: () => `http://127.0.0.1:${ctx.webServer.port}` })
    disposeRuntime = () => { disposeHeartbeat(); for (const dispose of routeDisposers) dispose() }
  }
  installSettingsSection(ctx, DOCTOR_SETTINGS_NAMESPACE, Config, config ?? {}, { setSource: source => { current = source; sync() }, onChange: sync })
  ctx.effect(() => { sync(); return () => disposeRuntime?.() }, 'doctor: runtime')
})

