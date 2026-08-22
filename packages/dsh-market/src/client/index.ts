/**
 * Market card, browser half. Registers the dsh-market dictionaries and one
 * first-level section (settings.section) beside the skin center / pet /
 * community plugins entries, and bridges the optional pluginManager
 * service for one-click plugin installs.
 * @module @linxin666/dsh-client-ui-market/client
 */

import type { ClientContext, SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { MarketCardController, MarketSection, type MarketSettings } from './MarketCard.tsx'
import { en, zh, type MarketKey } from './locales.ts'
import { bridgePluginManager } from './plugin-manager-bridge.ts'

export type { MarketCardProps, MarketSectionProps } from './MarketCard.tsx'
export type { InstalledPluginItem, InstallProgressItem, PluginManagerService } from './plugin-manager-bridge.ts'

const MARKET_NS = 'dsh-market'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Market card copy. */
    'dsh-market': MarketKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional rc.6 compatibility binder provided by dsh-web-ui-settings. */
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
}

export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/** Register the market section and the plugin-manager bridge. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('dsh-market', { zh, en }), 'dsh-market: dictionaries')

  bridgePluginManager(ctx)

  const binder = ctx.get('webUiSettings') ?? ctx.settingsScope
  const settingsScope = binder.bind<MarketSettings>({ namespace: MARKET_NS })
  const controller = new MarketCardController(settingsScope)

  ctx.slots.inject('settings.section', () => {
    const unregister = ctx.slots.register({
      name: 'settings.section',
      id: 'market',
      order: 150,
      label: () => ctx.locale.bind('dsh-market')('settings.title'),
      locale: 'dsh-market',
      inject: () => controller.inject(),
    }, MarketSection)
    return () => {
      controller.dispose()
      unregister()
    }
  })
}
