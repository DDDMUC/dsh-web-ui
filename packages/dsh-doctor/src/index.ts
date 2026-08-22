import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import { fileURLToPath } from 'node:url'
import { DOCTOR_PROTOCOL_VERSION } from './core/protocol.ts'
import { doctorPaths } from './agent/paths.ts'
import { currentPackageVersion } from './agent/version.ts'
import { currentProfile } from './host/profile.ts'
import { SupervisorClient } from './host/client.ts'
import { startHeartbeat } from './host/heartbeat.ts'
import { makeDoctorRoutes } from './host/routes.ts'
import { createDoctorLifecycle, defaultProvisioned } from './host/ensure.ts'
import { mountOnce } from './mount-once.ts'

export const name = 'doctor'
export const inject = ['webServer']
export interface Config { enabled?: boolean; fullProtection?: boolean; autoRepair?: boolean; heartbeatIntervalMs?: number }
export const Config: z<Config> = z.object({ enabled: z.boolean().default(true), fullProtection: z.boolean().default(true), autoRepair: z.boolean().default(true), heartbeatIntervalMs: z.number().min(1000).default(5000) })
export const DOCTOR_SETTINGS_NAMESPACE = settingsNamespace('doctor')

export const apply = mountOnce('@linxin666/dsh-doctor', (ctx: Context, config?: Config): void => {
  let current: () => Config = () => config ?? {}
  let disposeRuntime: (() => void) | undefined
  const sync = (): void => {
    disposeRuntime?.(); disposeRuntime = undefined
    if (!(current().enabled ?? false)) return
    const profile = currentProfile(); const paths = doctorPaths(); const client = new SupervisorClient(paths)
    const hostVersion = currentPackageVersion()
    const lifecycle = createDoctorLifecycle({
      paths,
      cliPath: fileURLToPath(new URL('./cli.mjs', import.meta.url)),
      version: hostVersion,
      status: () => client.status(),
      markUninstall: () => client.call({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'action', action: 'uninstall', profileId: profile.id }),
      source: { home: profile.dshHome, profile: profile.name },
    })
    const routeDisposers = makeDoctorRoutes(client, profile.id, { hostVersion, lifecycle, provisioned: () => defaultProvisioned(paths) }).map(route => ctx.webServer.register(route))
    const disposeHeartbeat = startHeartbeat({ client, profileId: profile.id, runId: process.env.DSH_DOCTOR_RUN_ID || 'unmanaged-' + process.pid, intervalMs: current().heartbeatIntervalMs ?? 5000, webUrl: () => `http://127.0.0.1:${ctx.webServer.port}` })
    disposeRuntime = () => { disposeHeartbeat(); for (const dispose of routeDisposers) dispose() }
  }
  installSettingsSection(ctx, DOCTOR_SETTINGS_NAMESPACE, Config, config ?? {}, { setSource: source => { current = source; sync() }, onChange: sync })
  ctx.effect(() => { sync(); return () => disposeRuntime?.() }, 'doctor: runtime')
})

