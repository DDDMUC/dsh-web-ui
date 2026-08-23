/**
 * Install-spec helpers shared by the market card: one-line command copy and
 * the installed-row lookup for plugins.
 */

import type { InstalledPluginItem } from './plugin-manager-bridge.ts'

export interface PluginEntryLike {
  id: string
  npm?: string
  repo?: string
}

/** The command to install a plugin entry (npm package when published, else its repository URL). */
export function installCommand(entry: PluginEntryLike): string {
  return `dsh plugin --profile web add ${entry.npm ?? entry.repo ?? entry.id}`
}

/** The spec handed to the pluginManager service. */
export function installSpec(entry: PluginEntryLike): string {
  return entry.npm ?? entry.repo ?? entry.id
}

/** Find the installed row for an entry (null when not installed or no snapshot). */
export function entryInstalled(entry: PluginEntryLike, installed: readonly InstalledPluginItem[]): InstalledPluginItem | null {
  return installed.find((item) => item.id === entry.id) ?? null
}
