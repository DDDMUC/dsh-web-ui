/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-code-kline`.
 * @module @deepseek-ai/dsh-client-ui-code-kline/invariant
 */

/* jscpd:ignore-start */
import type { Context } from 'cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-code-kline'

/** Cordis companion plugin name. */
export const name = 'client-ui-code-kline-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin owns no cordis events and no
 * cross-plugin mutable state — its contract is the slot registrations and
 * the pure chart components, asserted by this package's tests.
 */
const install: InvariantInstaller = () => {}
/* jscpd:ignore-end */

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
