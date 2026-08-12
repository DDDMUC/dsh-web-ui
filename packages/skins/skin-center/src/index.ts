/**
 * Host half of the in-GUI skin center: mounts the `/api/skin-center/*` routes
 * the browser half uses for one-click apply / restore-official. Every switch
 * delegates to the `dsh-skin` CLI, which owns the `dsh-skin managed` section
 * of `~/.dsh/cordis.patch.yml` and the profile symlink; the DSH config
 * watcher hot-reloads the patch within seconds, so no restart is needed.
 * Try-on stays pure browser work (see src/client/try-on.ts).
 * @module @deepseek-ai/dsh-client-ui-skin-center
 */

import { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the dsh-host-webserver service seat (ctx.httpServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeSkinCenterRoutes, SKIN_CENTER_API_PREFIX } from './routes.ts'

export { makeSkinCenterRoutes, SKIN_CENTER_API_PREFIX } from './routes.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'ui-skin-center'

/** Services required before the skin-center can mount its routes. */
export const inject = ['httpServer']

/**
 * Register the skin-center API routes.
 *
 * Failure policy: route mounting problems are logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws, and the skin center
 * must not take the GUI down.
 * @param ctx - cordis context.
 */
export function apply(ctx: Context): void {
  const routes = makeSkinCenterRoutes()
  try {
    ctx.effect(() => {
      const disposers = routes.map(route => ctx.httpServer.register(route))
      return () => { for (const dispose of disposers) dispose() }
    }, 'ui-skin-center: routes')
  } catch (error) {
    console.error('[ui-skin-center] route registration failed:', error)
  }
}
