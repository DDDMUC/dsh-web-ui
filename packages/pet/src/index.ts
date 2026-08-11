/**
 * dsh-pet host half — mounts the pet service and its HTTP routes. The
 * browser half (the `./client` entry) renders the whale-girl companion and
 * drives it through the same-origin `/api/pet/*` JSON endpoints plus the
 * `/pet/whale/*` media route. Install via `dsh plugin --profile web add
 * link:<dsh-web-ui>/packages/pet`; the cordis.patch.yml inserts this plugin row.
 * @module @deepseek-ai/dsh-pet
 */

import { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { PetService, type PetConfig } from './service.ts'
import { makePetRoutes, petPackageRoot } from './routes.ts'

export { PetService } from './service.ts'
export type {
  PetConfig,
  PetInteractResult,
  PetStateView,
} from './service.ts'
export {
  AFFINITY_MAX,
  AFFINITY_RANKS,
  applyInteraction,
  applyTurnReward,
  emptyAffinity,
  rankOf,
} from './affinity.ts'
export type {
  AffinityConfig,
  AffinityState,
  InteractionOutcome,
  PetInteraction,
} from './affinity.ts'
export {
  animationForPhase,
  PetStateMachine,
  rowOf,
} from './state.ts'
export type {
  ActivityPhase,
  PetAnimation,
  PetStateConfig,
  PetStateInput,
  PetStateSnapshot,
} from './state.ts'
export {
  consumeTreat,
  defaultTreatConfig,
  emptyTreatLedger,
  settleTreatGrants,
} from './treats.ts'
export type { TreatConfig, TreatLedger, TreatSettlement } from './treats.ts'
export {
  defaultDisplayConfig,
  emptyPersist,
  loadPetPersist,
  petHomeDir,
  savePetPersist,
} from './persist.ts'
export type { PetDisplayConfig, PetPersist } from './persist.ts'

export {
  makePetRoutes,
  petPackageRoot,
  PET_API_PREFIX,
  PET_ASSET_PREFIX,
} from './routes.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'pet'

/** Services required before the pet can mount its surfaces. */
export const inject = ['httpServer']

/** Register the pet service and its API + asset routes on the context. */
export function apply(ctx: Context, config: PetConfig = {}): void {
  const service = new PetService(ctx, config)

  // The browser half talks to the pet through same-origin JSON endpoints and
  // loads the atlas from the pet's own media route (RPC domains are
  // platform-registered, so the pet serves its own API — the same pattern as
  // dsh-remote-web-ui's /api/pair family).
  const routes = makePetRoutes({ service, packageRoot: petPackageRoot(import.meta.url) })
  ctx.effect(
    () => {
      const disposers = routes.map((route) => ctx.httpServer.register(route))
      return () => { for (const dispose of disposers) dispose() }
    },
    'pet: routes',
  )
}
