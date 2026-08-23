/**
 * DSH Market hub, browser half. Registers the dsh-market dictionaries and the
 * single first-level DSH Market section (settings.section id `dsh-market`)
 * that hosts the Store / Skin Center / Pet / Community Plugins cards as tab
 * panels (`dsh-market.tab`), and bridges the optional pluginManager service
 * for one-click plugin installs. The market card itself registers as the
 * Store tab; the other category cards register into the same tab slot from
 * their own packages and fall back to their own sections when this hub is
 * not installed.
 * @module @linxin666/dsh-client-ui-market/client
 */

import type { ClientContext, SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { MarketCardController, MarketSection, type MarketSettings } from './MarketCard.tsx'
import { MarketHub, MarketHubController } from './MarketHub.tsx'
import { MARKET_TAB_KEY } from './market-tab.ts'
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

  // The DSH Market hub: one first-level settings section declaring the
  // dsh-market.tab child slot the category cards register into. The hub
  // registers first so its tab declaration lands before any card's tab wait
  // fires; the two-seat guard in each card keeps modes exclusive anyway.
  const hub = new MarketHubController(ctx)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-market',
    order: 150,
    label: () => ctx.locale.bind('dsh-market')('hub.title'),
    locale: 'dsh-market',
    children: { 'dsh-market.tab': { kind: 'list', scope: 'root' } },
    inject: () => hub.inject(),
  }, MarketHub))

  // The Store tab: the market card itself, as the first (default) tab panel.
  ctx.slots.inject(MARKET_TAB_KEY, () => {
    const unregister = ctx.slots.register({
      name: MARKET_TAB_KEY,
      id: 'market',
      order: 100,
      label: () => ctx.locale.bind('dsh-market')('tab.shop'),
      locale: 'dsh-market',
      inject: () => controller.inject(),
    }, MarketSection)
    return () => {
      controller.dispose()
      unregister()
    }
  })
}