/**
 * DSH Market store, browser half. Registers the dsh-market dictionaries and
 * the single first-level DSH Market settings section (settings.section id
 * `dsh-market`) that renders the store card: browsing dsh-market.com
 * manifests (skins / pets / plugins) with one-click install into the DSH
 * home directories, and bridging the optional pluginManager service for
 * one-click plugin installs.
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

  // The DSH Market: one first-level settings section rendering the store
  // card. Clients install skins / pets / plugins here; management of
  // installed items lives in their own first-level sections (Skin Center,
  // Pet) and in the official Plugins settings section (plugin manager).
  // The section entry owns the controller: unregistering it (fiber
  // disposal, hot reload) releases the scope subscription through dispose.
  ctx.slots.inject('settings.section', () => {
    const unregister = ctx.slots.register({
      name: 'settings.section',
      id: 'dsh-market',
      order: 150,
      label: () => ctx.locale.bind('dsh-market')('settings.title'),
      locale: 'dsh-market',
      inject: () => controller.inject(),
    }, MarketSection)
    return () => {
      unregister()
      controller.dispose()
    }
  })
}
