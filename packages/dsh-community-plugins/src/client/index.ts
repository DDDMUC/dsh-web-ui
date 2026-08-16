/**
 * Community plugin index, browser half. Registers the community-plugins
 * dictionaries and one card into the plugin-configuration section's
 * top-level list (settings.plugin.item, the same seat as the built-in Shell /
 * Agent loop / Web search cards). The card carries its own enable switch
 * (backed by the community-plugins settings namespace) and lists community
 * plugins with links to each contributor's own repository.
 * @module @linxin666/dsh-client-ui-community-plugins/client
 */

import type { ClientContext, SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the slot-surface types (the settings.plugin.item seat).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { CommunityPluginsCard, CommunityPluginsCardController, type CommunityPluginsSettings } from './CommunityPluginsCard.tsx'
import { en, zh, type CommunityPluginKey } from './locales.ts'

export type { CommunityPluginsCardProps } from './CommunityPluginsCard.tsx'

/** Settings namespace the card's enable switch edits (the Host plugin registers it). */
const COMMUNITY_PLUGINS_NS = 'community-plugins'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Community plugin index card copy. */
    'community-plugins': CommunityPluginKey
  }

  interface SlotMap {
    /**
     * The plugin configuration section's card seat, declared by
     * ui-plugin-config. Spelled here with the same shape so this package can
     * register its card without depending on the sibling UI package.
     */
    'settings.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
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
 * Register the community plugin index card into the plugin-configuration
 * section, with its own enable switch over the community-plugins settings
 * namespace.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('community-plugins', { zh, en }), 'community-plugins: dictionaries')

  const binder = ctx.get('webUiSettings') ?? ctx.settingsScope
  const settingsScope = binder.bind<CommunityPluginsSettings>({ namespace: COMMUNITY_PLUGINS_NS })
  const controller = new CommunityPluginsCardController(settingsScope)

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'community-plugins',
    order: 120,
    locale: 'community-plugins',
    inject: () => controller.inject(),
  }, CommunityPluginsCard))
}
