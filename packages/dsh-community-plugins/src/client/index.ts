/**
 * Community plugin index, browser half. Registers the community-plugins
 * dictionaries and one section into the settings panel's first-level nav
 * (settings.section; the promoted family sections sit beside the built-in
 * general / models / plugins / agent-presets entries). The card carries its
 * own enable switch (backed by the community-plugins settings namespace) and
 * lists community plugins with links to each contributor's own repository.
 * @module @linxin666/dsh-client-ui-community-plugins/client
 */

import type { ClientContext, SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the slot-surface types (the settings.section seat).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { CommunityPluginsCardController, CommunityPluginsSection, type CommunityPluginsSettings } from './CommunityPluginsCard.tsx'
import { installMarketTabSeat, MARKET_TAB_KEY } from './market-tab.ts'
import { en, zh, type CommunityPluginKey } from './locales.ts'
import { bridgePluginManager } from './plugin-manager-bridge.ts'

export type { CommunityPluginsCardProps, CommunityPluginsSectionProps } from './CommunityPluginsCard.tsx'
export type { InstalledPluginItem, InstallProgressItem, PluginManagerService } from './plugin-manager-bridge.ts'

/** Settings namespace the card's enable switch edits (the Host plugin registers it). */
const COMMUNITY_PLUGINS_NS = 'community-plugins'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Community plugin index card copy. */
    'community-plugins': CommunityPluginKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Optional rc.6 compatibility binder provided by dsh-web-ui-settings;
     * absent when that group plugin is not installed, so callers fall back to
     * the official settings scope.
     */
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
}

/** Required services. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/**
 * Register the community plugin index as a first-level settings section, with
 * its own enable switch over the community-plugins settings namespace.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('community-plugins', { zh, en }), 'community-plugins: dictionaries')

  // Bridge the optional 'pluginManager' cordis service (provided by the
  // sibling dsh-plugin-manager plugin) into the card's reactive store. It is
  // deliberately NOT in the module-level inject array: when the sibling is
  // absent this plugin still loads and the card keeps its read-only index UI.
  bridgePluginManager(ctx)

  const binder = ctx.get('webUiSettings') ?? ctx.settingsScope
  const settingsScope = binder.bind<CommunityPluginsSettings>({ namespace: COMMUNITY_PLUGINS_NS })
  const controller = new CommunityPluginsCardController(settingsScope)

  // Two-seat registration (the DSH Market hub contract, see market-tab.ts):
  // with the hub installed this card becomes the Community Plugins tab;
  // standalone it keeps its own first-level settings section. The seat flag
  // makes both modes mutually exclusive and keeps the controller disposal on
  // the seat that actually lives.
  let seat: 'tab' | 'section' | null = null
  let fallbackEntry: (() => void) | null = null
  ctx.slots.inject(MARKET_TAB_KEY, () => {
    seat = 'tab'
    const unregister = ctx.slots.register({
      name: MARKET_TAB_KEY,
      id: 'community-plugins',
      order: 400,
      label: () => ctx.locale.bind('community-plugins')('settings.title'),
      locale: 'community-plugins',
      inject: () => controller.inject(),
    }, CommunityPluginsSection)
    if (fallbackEntry) {
      fallbackEntry()
      fallbackEntry = null
    }
    return () => {
      if (seat === 'tab') {
        seat = null
        controller.dispose()
      }
      unregister()
    }
  })
  ctx.slots.inject('settings.section', () => {
    if (seat === 'tab') return () => {}
    seat = 'section'
    fallbackEntry = ctx.slots.register({
      name: 'settings.section',
      id: 'community-plugins',
      order: 140,
      label: () => ctx.locale.bind('community-plugins')('settings.title'),
      locale: 'community-plugins',
      inject: () => controller.inject(),
    }, CommunityPluginsSection)
    return () => {
      if (seat === 'section') {
        seat = null
        controller.dispose()
      }
      fallbackEntry = null
    }
  })
}
