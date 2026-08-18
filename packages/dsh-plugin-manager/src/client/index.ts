/**
 * Plugin-manager browser half: contributes the family plugin-manager tab to
 * the official Plugins settings section (`settings.plugins.tab` slot) and
 * wires every operation to the official host RPC channels — `/plugin-installer`
 * for user plugins and `/plugin-control` for the built-in products. This
 * package owns no install writes: the official host installer is the single
 * writer (file lock + atomic write + managed patch rows), and this half is a
 * UI, diagnostics, and repair-orchestration consumer of that writer.
 * @module @linxin666/dsh-client-ui-plugin-manager/client
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings surface's slot contracts (settings.plugins.tab).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the client runtime Context merge (ctx.workspaces, ctx.sessions).
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { PluginManagerTab, type PluginManagerTabInjected } from './PluginManagerTab.tsx'
import { en, zh, type PluginManagerKey } from './locales.ts'
import {
  parseFailuresSnapshot,
  parseInstallStatus,
  parseInstalledPlugin,
  parsePluginControlSnapshot,
  parsePluginList,
  parseUpdateList,
  type InstalledPluginItem,
  type InstallProgressItem,
  type PluginControlItem,
  type PluginFailuresSnapshot,
  type PluginUpdateItem,
} from '../core/protocol.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the family plugin-manager tab. */
    'settings.pluginManager': PluginManagerKey
  }
}

const NS = 'settings.pluginManager'
const CHANNEL = '/plugin-installer'
const CONTROL_CHANNEL = '/plugin-control'
const LIST_ENDPOINT = 'list'
const INSTALL_ENDPOINT = 'install'
const UPDATE_ENDPOINT = 'update'
const UNINSTALL_ENDPOINT = 'uninstall'
const SET_ENABLED_ENDPOINT = 'set-enabled'
const CHECK_UPDATES_ENDPOINT = 'check-updates'
const STATUS_ENDPOINT = 'status'
const FAILURES_ENDPOINT = 'failures'
const SET_SAFE_MODE_ENDPOINT = 'set-safe-mode'

/** Services required by the slot registration and the RPC callers. */
export const inject = ['slots', 'locale', 'connection', 'workspaces', 'sessions']

/** Contribute the family plugin-manager tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-manager: dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const call = async (endpoint: string, payload: unknown): Promise<unknown> => {
    const result = await connection.rpc.call(CHANNEL, endpoint, payload)
    if (!result.ok) {
      throw new Error(`plugin-installer ${endpoint} failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const list = async (): Promise<InstalledPluginItem[]> =>
    parsePluginList(await call(LIST_ENDPOINT, {}))
  const install = async (spec: string): Promise<InstalledPluginItem> =>
    parseInstalledPlugin(await call(INSTALL_ENDPOINT, { spec }))
  const update = async (id: string): Promise<InstalledPluginItem> =>
    parseInstalledPlugin(await call(UPDATE_ENDPOINT, { id }))
  const uninstall = async (id: string): Promise<InstalledPluginItem[]> =>
    parsePluginList(await call(UNINSTALL_ENDPOINT, { id }))
  const setEnabled = async (id: string, enabled: boolean): Promise<InstalledPluginItem> =>
    parseInstalledPlugin(await call(SET_ENABLED_ENDPOINT, { id, enabled }))
  const checkUpdates = async (): Promise<PluginUpdateItem[]> =>
    parseUpdateList(await call(CHECK_UPDATES_ENDPOINT, {}))
  const status = async (): Promise<InstallProgressItem> =>
    parseInstallStatus(await call(STATUS_ENDPOINT, {}))
  const failures = async (): Promise<PluginFailuresSnapshot> =>
    parseFailuresSnapshot(await call(FAILURES_ENDPOINT, {}))
  const setSafeMode = async (enabled: boolean): Promise<void> => {
    await call(SET_SAFE_MODE_ENDPOINT, { enabled })
  }

  /**
   * Start a repair conversation for a failed plugin: resolve a workspace over
   * the plugin install root (created once, reused after), open a fresh
   * session there, and seed its first prompt with the failure details. The
   * session's workspace is the plugin home so the agent's file tools reach
   * the plugin code without leaving the workspace boundary.
   * @param pluginRoot - absolute plugin install root.
   * @param message - the seeded first user message.
   * @returns resolution after the prompt is accepted and the session opens.
   */
  const repairPlugin = async (pluginRoot: string, message: string): Promise<void> => {
    const workspace = await ctx.workspaces.create({ path: pluginRoot })
    const sessionId = await ctx.workspaces.connectWorkspace(workspace.workspaceId)
    const binding = ctx.sessions.binding(sessionId)
    if (binding === undefined) throw new Error(`plugin-manager: repair session ${sessionId} is unavailable`)
    const result = await binding.session.prompt([{ type: 'text', text: message }], 'queue')
    if (!result.ok) throw new Error(`plugin-manager: repair prompt failed: ${result.error.code}: ${result.error.message}`)
    ctx.sessions.open(sessionId)
  }

  const controlCall = async (endpoint: string, payload: unknown): Promise<unknown> => {
    const result = await connection.rpc.call(CONTROL_CHANNEL, endpoint, payload)
    if (!result.ok) {
      throw new Error(`plugin-control ${endpoint} failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const controlsList = async (): Promise<PluginControlItem[]> =>
    parsePluginControlSnapshot(await controlCall('list', {}))
  const controlsSetEnabled = async (pluginId: string, enabled: boolean): Promise<PluginControlItem[]> =>
    parsePluginControlSnapshot(await controlCall('set-enabled', { pluginId, enabled }))

  const injected = (): PluginManagerTabInjected => ({
    isLoopback: connection.isLoopback,
    list,
    install,
    update,
    uninstall,
    setEnabled,
    checkUpdates,
    status,
    failures,
    setSafeMode,
    repairPlugin,
    controlsList,
    controlsSetEnabled,
  })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'family-plugins',
    order: 20,
    label: () => ctx.locale.bind(NS)('tab'),
    locale: NS,
    inject: injected,
  }, PluginManagerTab))
}
