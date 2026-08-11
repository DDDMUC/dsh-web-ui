import type { Context } from 'cordis'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-session-projection'
import { resolveEstimatorConfig } from './estimator.ts'
import type { EstimatorConfig } from './estimator.ts'
import { createLiveTokenUsageProjectionDefinition } from './projection.ts'

/** Services required by the host projection plugin. */
export const inject = ['sessionProjections']

/** Plugin configuration for provider-independent token estimation. */
export type Config = EstimatorConfig

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  charsPerToken: z.number().min(0.01).default(4),
  blockOverhead: z.number().step(1).min(0).default(4),
  roleOverhead: z.number().step(1).min(0).default(4),
})

/** Register the replayable live-token projection. */
export function apply(ctx: Context, config: Config = {}): void {
  const spec = resolveEstimatorConfig(config)
  ctx.sessionProjections.register(createLiveTokenUsageProjectionDefinition(spec))
}

export { createLiveTokenUsageProjectionDefinition } from './projection.ts'
export { resolveEstimatorConfig } from './estimator.ts'
export type { EstimatorConfig, EstimatorSpec } from './estimator.ts'
