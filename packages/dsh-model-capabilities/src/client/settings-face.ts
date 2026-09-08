/**
 * The generated settings-namespace face the plugin's client surfaces need.
 * Typed locally (the generated `ClientRemote['settings']` resolves to `any`
 * fields under this repo's dependency graph, because skipLibCheck swallows
 * the settings-controller d.ts's own unresolved imports).
 * @module @linxin666/dsh-client-ui-model-capabilities/client/settings-face
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-settings/types'

/** The settings namespace methods this plugin reads and writes through. */
export interface SettingsNamespaceFace {
  describe(): Promise<RemoteResult<SettingsDescribeValue>>
  mutate(ns: string, ops: readonly SettingsPathOpView[], expectedRevision: number | undefined): Promise<RemoteResult<SettingsNamespaceView>>
}

/**
 * Cross-surface refresh bus for the plugin's own client components: a toggle
 * from the provider card updates the disabled-providers footer and vice
 * versa; the host's `settings/document-updated` remote event drives it too.
 */
export interface RefreshBus {
  subscribe(callback: () => void): () => void
  notify(): void
}
