/**
 * Workspace quote card: the "个股页" of the code-K-line idiom as a modal
 * card (the sidebar is too narrow for the full chart). Clicking a workspace
 * row's mini K-line opens the card: a full-size candlestick chart with
 * volume sub-chart and MA overlays, plus the latest-day headline (net
 * change and close). Escape or mask click closes it.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-workspace's SlotMap merge for the workspace-row hole.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { createCodeKlineStore } from './store.ts'
import { CandlestickChart, candleNetChange } from './CandlestickChart.tsx'
import type { CodeKlineInjected } from './index.ts'
import { NS } from './locales.ts'
import css from './WorkspaceKlineCard.module.css'

/** Card chart geometry. */
const CHART_WIDTH = 300
const CHART_HEIGHT = 168

/** Full props of the workspace quote card. */
export type WorkspaceKlineCardProps =
  PropsRuntime<'sidebar.workspaces.workspaceRow'>
  & PropsStore<ReturnType<typeof createCodeKlineStore>>
  & CodeKlineInjected
  & PropsLocale<typeof NS>

const cls = (name: keyof typeof css): string => css[name] ?? ''

/**
 * Render the workspace quote card (modal 个股页).
 * @param props - workspace owner, store, and ensure action.
 * @returns the modal card, or nothing while closed.
 */
export function WorkspaceKlineCard({ workspaceId, useStore, actions, ensure, t }: WorkspaceKlineCardProps) {
  // Both selectors run unconditionally: the closed early-return must not
  // change the hook count across renders (Rules of Hooks).
  const expanded = useStore(s => s.expanded.includes(workspaceId))
  const entry = useStore(s => s.entries[workspaceId])
  if (!expanded) return null
  if (entry === undefined || entry.state === 'idle') {
    ensure(workspaceId)
  }
  const loading = entry === undefined || entry.state === 'idle' || entry.state === 'loading'
  const empty = !loading && entry.candles.length === 0
  const reason = empty
    ? entry.reason === 'not-a-git-repository'
      ? t('panel.noGit')
      : entry.reason === 'scan-error'
        ? t('panel.scanError')
        : t('panel.noHistory')
    : ''
  const last = !loading && !empty ? entry.candles[entry.candles.length - 1] : undefined
  const net = last === undefined ? 0 : candleNetChange(last)
  return (
    <Modal
      open
      onClose={() => { actions.toggleBranch(workspaceId) }}
      title={t('panel.title')}
      closeLabel={t('row.close')}
    >
      <div className={cls('card')}>
        <div className={cls('headline')} data-trend={net > 0 ? 'up' : net < 0 ? 'down' : 'none'}>
          <span className={cls('net')}>{t('row.net', { n: net })}</span>
          {last !== undefined && <span className={cls('close')}>{t('row.close', { n: last.close })}</span>}
        </div>
        {loading && <div className={cls('status')}>{t('row.loading')}</div>}
        {empty && <div className={cls('status')}>{reason}</div>}
        {!loading && !empty && last !== undefined && (
          <CandlestickChart
            candles={entry.candles}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            showVolume
            maPeriods={[5, 20]}
          />
        )}
      </div>
    </Modal>
  )
}
