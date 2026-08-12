/**
 * dsh-pet browser half — registers the whale-girl into the conversation
 * composer dock (the same list slot the live-stats line uses) and drives it
 * from the host's same-origin `/api/pet/*` JSON endpoints: poll the host
 * snapshot (~800 ms), forward interactions, persist drag positions. The dock
 * anchor mounts the floating pet via portal; when the pet is hidden the
 * anchor becomes the summon button.
 * @module @deepseek-ai/dsh-pet/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PetDisplayConfig } from '../persist.ts'
import type { PetInteractResult, PetStateView } from '../service.ts'
import type { PetInteraction } from '../affinity.ts'
import { createPetStore, type PetFeedback, type PetUiState } from './pet-store.ts'
import { PetDockEntry, type PetInjected } from './PetDockEntry.tsx'
import { PetSettingsCard, PetSettingsCardController, type PetSettings } from './PetSettingsCard.tsx'
import { NS, en, zh } from './locales.ts'

/** The host pet API as the browser sees it (same-origin JSON endpoints). */
interface PetHttpApi {
  state(): Promise<PetStateView>
  interact(kind: PetInteraction): Promise<PetInteractResult>
  setVisible(visible: boolean): Promise<{ ok: true; display: PetDisplayConfig }>
  setConfig(patch: Partial<PetDisplayConfig>): Promise<{ ok: true; display: PetDisplayConfig }>
  setName(name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }>
}

/** Same-origin JSON fetch helper (GET without body, POST with JSON body). */
async function petFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined
    ? {}
    : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
  if (!response.ok) {
    throw new Error(`pet ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

/** The live host API instance (always defined; failures surface per call). */
const petApi: PetHttpApi = {
  state: () => petFetch('/api/pet/state'),
  interact: (kind) => petFetch('/api/pet/interact', { kind }),
  setVisible: (visible) => petFetch('/api/pet/set-visible', { visible }),
  setConfig: (patch) => petFetch('/api/pet/set-config', patch),
  setName: (name) => petFetch('/api/pet/set-name', { name }),
}

/** Baked store actions the inject factory receives (draft pre-applied). */
interface PetBakedActions {
  setSnapshot: (snapshot: PetStateView) => void
  setState: (state: PetUiState['state'], error: string | null) => void
  setFeedback: (feedback: PetFeedback | null) => void
}

/** Poll interval for the host snapshot. */
const POLL_MS = 800

/** Settings namespace the pet settings card edits (the Host plugin registers it). */
const PET_SETTINGS_NS = 'pet'

/** Required services. */
export const inject = ['slots', 'locale', 'settingsScope', 'remote']

/** Re-exported for consumers that type against the injected face. */
export type { PetInjected, PetDockEntryProps } from './PetDockEntry.tsx'
export type { PetUiState, PetFeedback } from './pet-store.ts'
export type { PetSettingsCardFace, PetSettingsCardState } from './PetSettingsCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The child slot the Web UI plugin group declares; this card registers
     * into the group instead of the top-level `settings.plugin.item` list.
     * Spelled here with the same shape so this package can register without
     * depending on the sibling UI package.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the group card supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/**
 * Client plugin body: register dictionaries, mount the dock entry and poll
 * loop while the plugin is enabled, and seat the settings card in the Web UI
 * plugin group.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')

  const settingsScope = ctx.settingsScope.bind<PetSettings>({ namespace: PET_SETTINGS_NS })
  const enabled = (): boolean => {
    const snapshot = settingsScope.getSnapshot()
    return snapshot.status === 'ready' ? snapshot.value?.enabled ?? true : true
  }

  // Plugin configuration card: one staged form over the `pet` settings
  // namespace, contributed to the Web UI plugin group.
  const petSettings = new PetSettingsCardController(settingsScope)
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item',
    id: 'pet-settings',
    order: 140,
    locale: NS,
    inject: () => petSettings.inject(),
  }, PetSettingsCard))

  // The dock entry, its store, and the poll loop live while the plugin is
  // enabled; toggling the setting off hides the pet and stops polling.
  let disposeUi: (() => void) | undefined
  const syncUi = (): void => {
    if (enabled() && disposeUi === undefined) {
      const store = createPetStore()

      // Baked actions are only available after the slot registration mints
      // the store instance; the inject factory captures them for the poll loop.
      let baked: PetBakedActions | null = null

      const pollNow = (): void => {
        petApi.state().then((snapshot) => {
          baked?.setSnapshot(snapshot)
        }, () => {
          baked?.setState('error', 'pet.state transport error')
        })
      }

      const disposePoll = ctx.effect(() => {
        const timer = window.setInterval(pollNow, POLL_MS)
        return () => window.clearInterval(timer)
      }, 'pet: poll')

      const injected = (_sessionId: SessionId, actions: PetBakedActions): PetInjected => {
        baked = actions
        return {
          ensure: pollNow,
          pet: () => {
            petApi.interact('pet').then((result) => {
              actions.setFeedback({
                text: result.reaction,
                kind: 'pet',
                at: Date.now(),
              })
            }, () => {
              // Ignore transport errors on interactions; the next poll resyncs.
            })
          },
          feed: () => {
            petApi.interact('feed').then((result) => {
              actions.setFeedback({
                text: result.reaction,
                kind: 'feed',
                at: Date.now(),
              })
            }, () => {
              // Ignore transport errors on interactions; the next poll resyncs.
            })
          },
          hide: () => {
            petApi.setVisible(false).then(() => {
              pollNow()
            }, () => {
              // Ignore; next poll resyncs.
            })
          },
          summon: () => {
            petApi.setVisible(true).then(() => {
              pollNow()
            }, () => {
              // Ignore; next poll resyncs.
            })
          },
          dragEnd: (right, bottom) => {
            petApi.setConfig({ right, bottom }).then(() => {
              pollNow()
            }, () => {
              // Ignore; next poll resyncs.
            })
          },
          rename: (name) => {
            petApi.setName(name).then((result) => {
              if (result.ok) pollNow()
            }, () => {
              // Ignore; next poll resyncs.
            })
          },
          feedbackDone: () => {
            actions.setFeedback(null)
          },
        }
      }

      const disposeDock = ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'pet',
          order: 10,
          store,
          inject: injected,
          locale: NS,
        }, PetDockEntry))

      disposeUi = () => {
        disposeDock()
        disposePoll()
        disposeUi = undefined
      }
    } else if (!enabled() && disposeUi !== undefined) {
      disposeUi()
      disposeUi = undefined
    }
  }
  settingsScope.subscribe(syncUi)
  syncUi()
}
