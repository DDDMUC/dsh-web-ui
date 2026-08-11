import { Context } from 'cordis'
import { describe, expect, it } from 'vitest'
import { SlotsService } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-conversation's SlotMap merge for the composer dock hole.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { apply } from '../src/client/index.ts'

/** Declare the composer dock hole under root, as ui-conversation does. */
async function bench(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SlotsService).await()
  ctx.provide('conversation', {} as never)
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.composer.dock': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  await ctx.plugin(apply).await()
  return ctx
}

describe('live-stats client apply', () => {
  it('mounts nothing into the composer dock (the TPS group lives in the stats line)', async () => {
    const ctx = await bench()
    expect(ctx.slots.entries('conversation.composer.dock')).toHaveLength(0)
  })
})
