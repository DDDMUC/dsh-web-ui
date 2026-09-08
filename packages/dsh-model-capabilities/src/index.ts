/**
 * Host loader entry for the dsh-model-capabilities plugin — runs in the DSH host process.
 *
 * The plugin has no host behavior: its whole function is a Models-page
 * extension area (the browser half) that reads and writes the official
 * `llm-pi-ai` settings namespace over the standard remote settings wire. The
 * host side of that wire is owned by DSH itself (`dsh-api-settings-controller`
 * plus the `dsh-llm-pi-ai` adapter), so this half exists only to carry the
 * bundle row in cordis.patch.yml that makes the client half load.
 * @module @linxin666/dsh-client-ui-model-capabilities
 */
import type { Context } from '@deepseek-ai/cordis'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'ui-model-capabilities'

/** Apply the host half: nothing to do (see module doc). */
export function apply(_ctx: Context): void {}
