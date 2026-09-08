/**
 * Browser-half entry for the dsh-model-capabilities plugin — runs inside the dsh web GUI.
 *
 * Seats the Models-page `settings.models.provider-card` extension area for the
 * `llm-pi-ai` adapter family: every custom-provider card of that family gets
 * the per-model capability editor (image input + reasoning efforts), which
 * reads and writes the official `llm-pi-ai` settings namespace over the
 * standard remote settings wire. The plugin has no host behavior and no
 * settings namespace of its own.
 * @module @linxin666/dsh-client-ui-model-capabilities/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ctx.slots merge (the renderer owns the slot registry).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.locale merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the Models-page SlotMap declarations
// ('settings.models.provider-card'), our own LocaleNamespaceMap merge, and the
// owner-props types the panel reads.
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import { CapabilitiesPanel } from './CapabilitiesPanel.tsx'
import { NS, zh, en } from './locales.ts'

/** Required services: the slot registry, the dictionary registry, the remote wire. */
export const inject = ['slots', 'locale', 'remote']

/**
 * Client plugin body: register dictionaries and seat the provider-card
 * extension for the pi-ai family.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'dsh-model-capabilities: dictionaries')

  const remote = ctx.get('remote') as unknown as ClientRemote

  ctx.slots.inject('settings.models.provider-card', () => {
    try {
      const unregister = ctx.slots.register({
        name: 'settings.models.provider-card',
        key: 'llm-pi-ai',
        inject: () => ({ remote }),
      }, CapabilitiesPanel)
      return () => {
        unregister()
      }
    } catch {
      // The seat is declared by the official Models section; a host without
      // it (older deployment) offers no slot to fill, so register nothing.
      return () => {}
    }
  })
}
