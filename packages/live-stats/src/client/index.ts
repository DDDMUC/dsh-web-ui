import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'

export { TpsLine, formatTokensPerSecond } from './TpsLine.tsx'

/**
 * Client entry kept for roster compatibility. The generation-throughput row
 * merged into the conversation stats line (ui-conversation reads the
 * `liveTokenUsage` projection directly), so the client half mounts nothing;
 * this package now only supplies the projection on the host side.
 */
export function apply(_ctx: ClientContext): void {
  // Nothing to mount: the TPS group lives in the ui-conversation stats row.
}
