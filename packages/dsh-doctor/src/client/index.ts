/**
 * Browser-half entry for the dsh-doctor plugin.
 *
 * Mounts the first-level settings section (the recovery console), registers the
 * doctor locale namespace, wires the passive failure probe (window error and
 * unhandledrejection capture, React boundary reports, connection-rebuild boot
 * signals) into the console snapshot, and starts the loopback /api/doctor poll
 * loop.
 *
 * Resilience contract: apply() never throws. Every mount step is guarded so a
 * missing service, a duplicate injection or a hostile scope degrades to an
 * empty-but-alive plugin instead of taking the GUI down.
 * @module @linxin666/dsh-doctor/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings surface's slot contracts (settings.section) and
// the settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the SlotMap/LocaleNamespaceMap merge points.
import type {} from '@deepseek-ai/dsh-client-ui-slots'

import { DoctorApi } from './doctor-api.ts'
import type { DoctorSettings } from './doctor-types.ts'
import { DoctorController } from './doctor-controller.ts'
import { PassiveProbe } from './doctor-passive.ts'
import { createDoctorSettingsHandle, type DoctorSettingsHandle } from './doctor-settings.ts'
import { DoctorRecoveryConsole, type DoctorConsoleInjected } from './DoctorRecoveryConsole.tsx'
import { en, zh, type DoctorKey } from './locales.ts'

/** Locale namespace owned by this plugin. */
export const NS = 'doctor'

/** Slot id of the first-level settings section this plugin owns. */
export const SECTION_ID = 'doctor'

/** Semantic plugin short name used on the root container. */
export const PLUGIN_SHORT_NAME = 'doctor'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Recovery console copy. */
    'doctor': DoctorKey
  }
}

/** Services required by the browser half. */
export const inject = ['slots', 'locale', 'settingsScope']

/** Apply-guard: a duplicated client injection must not mount a second console. */
let claimed = false

/** Apply the browser half; never throws. */
export function apply(ctx: ClientContext): void {
  if (claimed) return
  claimed = true

  // Dictionaries.
  safe(() => {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'doctor: dictionaries')
  })

  // Controller: passive probe + poll loop, both fail-open.
  let controller: DoctorController | undefined
  safe(() => {
    const passive = new PassiveProbe({
      notify: () => { controller?.syncProbe() },
    })
    controller = new DoctorController({ api: new DoctorApi(), passive })
    passive.start()
    ctx.effect(() => {
      controller?.start()
      return () => { controller?.dispose() }
    }, 'doctor: poll loop')
    // Boot-phase signal: a rebuilt connection refreshes the snapshot.
    ctx.effect(() => ctx.on('connection/reset', () => { controller?.noteConnectionReset() }), 'doctor: connection signals')
  })

  // Settings handle over the doctor namespace (null when the scope is absent).
  let settings: DoctorSettingsHandle | null = null
  safe(() => {
    const binder = ctx.get('settingsScope')
    const scope = binder?.bind<DoctorSettings>({ namespace: NS })
    settings = createDoctorSettingsHandle(scope)
  })

  // First-level settings section. Registration is guarded: a duplicate entry id
  // or an undeclared slot must not break apply.
  ctx.slots.inject('settings.section', () => {
    const dispose = safeRegister(ctx, controller, settings)
    return () => { safe(() => dispose?.()) }
  })
}

/** Register the section; returns the disposer or undefined on failure. */
function safeRegister(
  ctx: Context,
  controller: DoctorController | undefined,
  settings: DoctorSettingsHandle | null,
): (() => void) | undefined {
  if (controller === undefined) return undefined
  try {
    return ctx.slots.register({
      name: 'settings.section',
      id: SECTION_ID,
      order: 130,
      label: () => {
        try {
          return ctx.locale.bind(NS)('settings.title')
        } catch {
          return 'Doctor'
        }
      },
      locale: NS,
      inject: () => ({ controller, settings }) satisfies DoctorConsoleInjected,
    }, DoctorRecoveryConsole)
  } catch {
    return undefined
  }
}

/** Run one guarded step; never rethrows. */
function safe(step: () => void): void {
  try {
    step()
  } catch {
    // fail-open: a broken optional step must not break apply.
  }
}
