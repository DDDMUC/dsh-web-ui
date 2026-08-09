/**
 * The mobile remote-control panel body: status card (state text + badge),
 * the QR code, the open-on-phone hint with the link text, and the three
 * actions (stop / refresh / copy). Pure presentation — all state and
 * actions arrive through props from the entry's behavior component.
 */
import clsx from 'clsx'
import { QRCodeSVG } from 'qrcode.react'
import {
  IconCloseOutline16, IconCopyOutline16, IconLinkOutline16, IconRefreshOutline16, IconStopFill16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PairingPhase } from '../pairing.ts'
import { formatClock } from './pair-api.ts'
import css from './remote.module.css'

/** The panel's view state, owned by the entry component. */
export type PanelState =
  | { kind: 'lan-required' }
  | { kind: 'loopback-required' }
  | { kind: 'unreachable' }
  | {
      kind: 'ready'
      url: string
      expiresAt: number
      expired: boolean
      phase: PairingPhase
      deviceCount: number
      onlineCount: number
    }

/** Full panel props: copy + view state + actions. */
export interface RemotePanelProps {
  t: TranslateNS<'remote'>
  state: PanelState
  copied: boolean
  onClose(): void
  onStop(): void
  onRefresh(): void
  onCopy(): void
}

/** Badge text + tone per phase (ready states only). */
function statusOf(
  t: TranslateNS<'remote'>,
  state: Extract<PanelState, { kind: 'ready' }>,
): { text: string; tone: 'waiting' | 'connected' | 'disconnected' | 'stopped' } {
  switch (state.phase) {
    case 'connected': return { text: t('status.connected', { n: state.onlineCount }), tone: 'connected' }
    case 'disconnected': return { text: t('status.disconnected'), tone: 'disconnected' }
    case 'stopped': return { text: t('status.stopped'), tone: 'stopped' }
    case 'lan-required': return { text: t('status.lanRequired'), tone: 'stopped' }
    case 'waiting': return { text: t('status.waiting'), tone: 'waiting' }
  }
}

/**
 * Render the pairing panel.
 * @param props - copy, state, and actions.
 * @returns the panel element tree.
 */
export function RemotePanel({ t, state, copied, onClose, onStop, onRefresh, onCopy }: RemotePanelProps) {
  return (
    <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('title')}>
      <div className={css.header}>
        <div className={css.heading}>
          <h2 className={css.title}>{t('title')}</h2>
          <p className={css.subtitle}>{t('subtitle')}</p>
        </div>
        <button type="button" className={css.close} aria-label={t('close.label')} onClick={onClose}>
          <IconCloseOutline16 size={14} />
        </button>
      </div>

      {state.kind === 'lan-required' ? (
        <div className={css.banner} role="alert">
          <p className={css.bannerTitle}>{t('status.lanRequired')}</p>
          <p className={css.bannerHint}>{t('status.lanRequiredHint')}</p>
        </div>
      ) : state.kind === 'loopback-required' ? (
        <div className={css.banner} role="alert">
          <p className={css.bannerTitle}>{t('status.loopbackRequired')}</p>
          <p className={css.bannerHint}>{t('status.loopbackRequiredHint')}</p>
        </div>
      ) : state.kind === 'unreachable' ? (
        <div className={css.banner} role="alert">
          <p className={css.bannerTitle}>{t('status.unreachable')}</p>
          <p className={css.bannerHint}>{t('status.unreachableHint')}</p>
        </div>
      ) : (
        <>
          <div className={css.card}>
            <div className={css.cardHeader}>
              <span className={css.cardTitle}>{t('card.title')}</span>
              <span className={clsx(css.badge, css[`badge-${statusOf(t, state).tone}`])}>
                {statusOf(t, state).text}
              </span>
            </div>
            <div className={css.qrWrap} data-testid="remote-qr">
              <QRCodeSVG value={state.url} size={184} level="M" marginSize={1} className={css.qr} />
            </div>
            {state.expired
              ? <p className={css.expired}>{t('pair.expired')}</p>
              : <p className={css.expiry}>{t('pair.expires', { time: formatClock(state.expiresAt) })}</p>}
          </div>

          <p className={css.hint}>{t('pair.hint')}</p>
          <p className={css.link} title={state.url}>{state.url}</p>
          {state.phase === 'stopped' && <p className={css.stoppedHint}>{t('stopped.hint')}</p>}

          <div className={css.actions}>
            <button type="button" className={css.action} onClick={onStop}>
              <IconStopFill16 size={14} />
              {t('action.stop')}
            </button>
            <button type="button" className={css.action} onClick={onRefresh}>
              <IconRefreshOutline16 size={14} />
              {t('action.refresh')}
            </button>
            <button type="button" className={css.action} onClick={onCopy}>
              {copied ? <IconCopyOutline16 size={14} /> : <IconLinkOutline16 size={14} />}
              {copied ? t('action.copied') : t('action.copy')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
