/**
 * The cordis service contract this package exposes to sibling client plugins
 * under the name `'pluginManager'`. The browser half builds one dual-channel
 * face (official /plugin-installer + /plugin-control RPC channels when
 * available, else this package's loopback HTTP gateway) and provides it via
 * `ctx.provide('pluginManager', face)`; consumers resolve it with
 * `ctx.inject(['pluginManager'], cb)` and read `ctx.pluginManager`.
 *
 * The interface is intentionally narrower than the face the Plugin manager
 * tab receives (`PluginManagerFace` in the client half): it is the stable
 * cross-plugin surface, so it only carries the operations a sibling plugin
 * needs to observe and drive the installed-plugin set.
 * @module @linxin666/dsh-client-ui-plugin-manager/core
 */

import type { InstallProgressItem, InstalledPluginItem } from './protocol.ts'

/** The cordis service name the browser half provides the face under. */
export const PLUGIN_MANAGER_SERVICE = 'pluginManager'

/**
 * The dual-channel plugin-management face, shared between the Plugin manager
 * tab and sibling client plugins.
 */
export interface PluginManagerService {
  /** Whether this browser has loopback authority to use the host routes. */
  readonly isLoopback: boolean
  /** Read the installed snapshot. */
  list(): Promise<InstalledPluginItem[]>
  /** Install one plugin from an npm spec or git URL. */
  install(spec: string): Promise<InstalledPluginItem>
  /** Remove one plugin. */
  uninstall(id: string): Promise<InstalledPluginItem[]>
  /** Read the current install/update progress. */
  status(): Promise<InstallProgressItem>
  /**
   * Subscribe to successful mutations: the callback runs after install(),
   * update(), uninstall(), or setEnabled() resolves. One listener throwing
   * never breaks the others. Returns the unsubscribe function.
   */
  onChange(cb: () => void): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The plugin-manager face (provided by the dsh-plugin-manager client half). */
    pluginManager: PluginManagerService
  }
}
