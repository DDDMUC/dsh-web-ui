/**
 * Host half of the dsh-plugin-manager plugin — runs in the DSH host process.
 *
 * Deliberately behavior-free: installation, enablement, conflict rules, and
 * the boot-failure ring are all owned by the official host plugin-installer
 * (the single writer over the profile patch and bundle layers). This package
 * only contributes the browser-side manager tab, which consumes that writer
 * through the loopback RPC channels; no host-side registration is needed.
 * @module @linxin666/dsh-client-ui-plugin-manager
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'ui-plugin-manager'

/** Services the host half needs — none. */
export const inject = []

/** Apply the host half: a no-op by design. */
export function apply(ctx: Context): void {
  void ctx
}
