/**
 * Workspace-row mini K-line: a compact candlestick sparkline rendered in the
 * sidebar workspace group header row (the "自选股行" of the code-K-line
 * idiom). Shows the trailing 30-day candles of the workspace's net line
 * value; hover shows the latest day's net change, clicking toggles the
 * row-below quote branch (个股页). Absence states render a muted placeholder
 * ("停牌"-style, no candles).
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-workspace's SlotMap merge for the workspace-row hole.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { createCodeKlineStore } from './store.ts'
import type { WorkspaceKlineState } from './store.ts'
import { CandlestickChart, candleNetChange } from './CandlestickChart.tsx'
import { WorkspaceKlineCard } from './WorkspaceKlineCard.tsx'
import type { CodeKlineInjected } from './index.ts'
import { NS, type CodeKlineKey } from './locales.ts'
import css from './WorkspaceRowKline.module.css'

/** Trailing candles shown in the row sparkline. */
const MINI_CANDLES = 30
/** Mini chart geometry. */
const MINI_WIDTH = 76
const MINI_HEIGHT = 18

/** Full props of the workspace-row mini K-line component. */
export type WorkspaceRowKlineProps =
  PropsRuntime<'sidebar.workspaces.workspaceRow'>
  & PropsStore<ReturnType<typeof createCodeKlineStore>>
  & CodeKlineInjected
  & PropsLocale<typeof NS>

const cls = (name: keyof typeof css): string => css[name] ?? ''

/** Recent-candles window (oldest first, trailing MINI_CANDLES). */
function trailing(candles: readonly WorkspaceKlineState['candles'][number][]): readonly WorkspaceKlineState['candles'][number][] {
  return candles.length <= MINI_CANDLES ? candles : candles.slice(candles.length - MINI_CANDLES)
}

/**
 * Render the workspace-row mini K-line sparkline.
 * @param props - workspace owner, code-kline store, ensure action, and the
 * branch toggle (baked from the store's actions).
 * @returns the sparkline, a loading mark, or a muted placeholder.
 */
export function WorkspaceRowKline({ workspaceId, useStore, actions, ensure, useSessions, useWorkspaces, t }: WorkspaceRowKlineProps) {
  const entry = useStore(s => s.entries[workspaceId])
  // The quote card shares every seat with the row; one object keeps the
  // three render sites (placeholder/loading/ready) in lockstep.
  const cardProps = { workspaceId, useStore, actions, ensure, useSessions, useWorkspaces, t }
  if (entry === undefined || entry.state === 'idle') {
    ensure(workspaceId)
    return (
      <>
        <span className={cls('placeholder')} aria-label={t('row.loading')} />
        <WorkspaceKlineCard {...cardProps} />
      </>
    )
  }
  if (entry.state === 'loading' || entry.candles.length === 0) {
    return (
      <>
        <span className={cls('placeholder')} aria-label={entry.state === 'loading' ? t('row.loading') : t('row.noMarket')} />
        <WorkspaceKlineCard {...cardProps} />
      </>
    )
  }
  const candles = trailing(entry.candles)
  const last = candles[candles.length - 1]
  if (last === undefined) return <span className={cls('placeholder')} aria-label={t('row.noMarket')} />
  const net = candleNetChange(last)
  const label = `${t('row.net', { n: net })}, ${t('row.close', { n: last.close })}`
  return (
    <>
      <button
        type="button"
        className={cls('mini')}
        title={label}
        aria-label={label}
        data-trend={net >= 0 ? 'up' : 'down'}
        onClick={(e) => {
          e.stopPropagation()
          actions.toggleBranch(workspaceId)
        }}
      >
        <CandlestickChart
          candles={candles}
          width={MINI_WIDTH}
          height={MINI_HEIGHT}
          showVolume={false}
          maPeriods={[]}
          slotPadding={0.22}
        />
      </button>
      <WorkspaceKlineCard {...cardProps} />
    </>
  )
}

/** Localization keys used by the row sparkline. */
export type { CodeKlineKey }
