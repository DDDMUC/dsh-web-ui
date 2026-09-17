/**
 * dsh-liangshen browser half: the LiangShen lever in the composer tool row.
 *
 * The slot is `conversation.input.right` — "compact controls before the
 * composer submit action", which renders immediately left of the model
 * selector (`conversation.input.model`) inside the same composer card, on the
 * homepage's new-session hero as well as in a session. The lever lives only
 * while the session is still blank, because that is the only window in which a
 * preset can change at all: `agentPresets.select` refuses an already-started
 * session, and the arm would have nothing to do in one.
 *
 * This half talks to the host over the agent-preset Remote namespace rather
 * than through the official preset package's browser module: cross-plugin
 * collaboration here goes through cordis services and Remote surfaces, not
 * value imports.
 *
 * Failure policy: a missing slot or a refused Remote call is handled, never
 * thrown — one external plugin must not take the GUI boot down.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the composer tool row).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { LiangShenLever } from './LiangShenLever.tsx'
import { LeverController } from './lever-controller.ts'
import { LiangShenSettingsCard, LiangShenSettingsCardController, type LiangShenSettings } from './LiangShenSettingsCard.tsx'
import { en, zh, type LiangShenKey } from './locales.ts'
import { installPluginCard } from './plugin-card-seat.ts'

/** Locale namespace this half owns. */
export const NS = 'liangshen'

/** Settings namespace the settings card edits (the Host plugin registers it). */
export const SETTINGS_NAMESPACE = 'dsh-liangshen'

/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The child slot the Web UI plugin group declares; this card registers into
     * the group's list seat rather than the official bundle-configuration
     * seat. Declared here so this package needs no dependency on the sibling UI
     * package.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Optional compatibility binder provided by dsh-web-settings; absent when
     * that group plugin is not installed, so callers fall back to the official
     * settings scope.
     */
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): import('@deepseek-ai/dsh-client-ui-settings/client').SettingsScope<S> }
  }
}

/**
 * Required client services: the slot registry, locale, sessions, and the roster
 * Remote. Both `remote` and `remote.agentPresets` are declared: the context
 * proxy refuses an uninjected service, and a nested service name does not imply
 * its parent, so reading `ctx.remote.agentPresets` needs `remote` as well.
 */
export const inject = ['slots', 'locale', 'sessions', 'settingsScope', 'remote', 'remote.agentPresets']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The LiangShen lever copy. */
    'liangshen': LiangShenKey
  }
}

export { LiangShenLever } from './LiangShenLever.tsx'
export { LeverController, type LeverFace, type LeverSnapshot } from './lever-controller.ts'
export { LIANGSHEN_PRESET_ID, leverState, restoreTarget, type LeverFacts, type LeverState } from '../core/lever.ts'

/**
 * Mount the lever: register the copy, follow the roster and the current
 * session, and claim the composer tool row.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'liangshen: lever dictionaries')

  const controller = new LeverController(ctx)
  ctx.effect(() => () => controller.dispose(), 'liangshen: lever controller')
  try {
    controller.start()
  } catch {
    // An unavailable sessions or Remote service leaves the lever inert; the
    // view still renders and reports what it knows.
  }

  // Plugin configuration card: one staged form over the `dsh-liangshen`
  // settings namespace, contributed to the Web UI plugin group beside the
  // remote-access and task-board cards.
  try {
    const binder = ctx.get('webUiSettings') ?? ctx.settingsScope
    const settingsScope = binder.bind<LiangShenSettings>({ namespace: SETTINGS_NAMESPACE })
    const settingsCard = new LiangShenSettingsCardController(settingsScope)
    // Card seat: the family group's list seat, or the official
    // bundle-configuration seat when the group is not installed.
    installPluginCard(ctx, {
      bundle: '@linxin666/dsh-liangshen',
      id: 'liangshen',
      order: 120,
      locale: NS,
      inject: () => settingsCard.inject(),
      component: LiangShenSettingsCard,
    })
    ctx.effect(() => () => { settingsCard.dispose() }, 'liangshen: settings card')
  } catch {
    // A missing settings surface leaves the lever working and the card absent;
    // one unavailable service must not take the browser half down.
  }

  ctx.slots.inject('conversation.input.right', () => {
    try {
      const unregister = ctx.slots.register({
        name: 'conversation.input.right',
        id: 'liangshen-lever',
        order: 20,
        inject: () => controller.face(),
      }, LiangShenLever)
      return () => { unregister() }
    } catch {
      return () => {}
    }
  })
}
