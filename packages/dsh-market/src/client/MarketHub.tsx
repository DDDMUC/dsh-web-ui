/**
 * The DSH Market hub: the single first-level settings section that hosts the
 * Store / Skin Center / Pet / Community Plugins category cards as tab panels.
 * The hub declares the `dsh-market.tab` child slot (see the shared
 * market-tab contract); category cards register into it, or fall back to
 * their own first-level section when this hub is not installed.
 */

import { useState, type ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel, type HostObservable, type InjectFace, type PropsLocale, type PropsRenderSlots, type PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { MARKET_TAB_KEY, type MarketTabRecord } from './market-tab.ts'
import css from './market.module.css'

/** The registration-side face the hub's slot entry injects. */
export interface MarketHubFace {
  hooks: {
    /** Live tab list (id + resolved label) for the hub's tab bar. */
    marketTabs: HostObservable<MarketTabRecord[]>
  }
}

/** Builds the hub face over the live slot registry. */
export class MarketHubController {
  /**
   * Memoized snapshot, keyed on the entries array identity: the slot registry
   * keeps a stable entries reference between mutations, so a selector hook
   * mounted on this observable re-renders only on real changes — an array
   * rebuilt per getSnapshot call would loop React (#185).
   */
  private cache: { entries: unknown; mapped: MarketTabRecord[] } | null = null

  /** @param ctx - client root context (for the slots registry). */
  constructor(private readonly ctx: ClientContext) {}

  /** Build the face the hub's slot registration injects. */
  inject(): MarketHubFace {
    return {
      hooks: {
        marketTabs: {
          getSnapshot: () => this.snapshot(),
          subscribe: (listener) => this.ctx.slots.subscribe(MARKET_TAB_KEY, listener),
        },
      },
    }
  }

  private snapshot(): MarketTabRecord[] {
    const entries = this.ctx.slots.entries(MARKET_TAB_KEY)
    if (this.cache === null || this.cache.entries !== entries) {
      this.cache = {
        entries,
        mapped: entries.map((entry) => ({ id: entry.options.id ?? '', label: resolveSlotLabel(entry.options.label) ?? '' })),
      }
    }
    return this.cache.mapped
  }
}

/** Props the settings shell binds for the DSH Market hub section. */
export type MarketHubProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'dsh-market'>
  & PropsRenderSlots<'dsh-market.tab'>
  & InjectFace<MarketHubFace>

/**
 * Render the hub: a heading plus a tab bar over the category cards. Only the
 * active tab panel mounts, so a card re-fetches its local state (skin
 * catalog, pet registry, plugin index) when the user returns to it.
 */
export function MarketHub(props: MarketHubProps): ReactNode {
  const { t, useMarketTabs, renderSlot, close } = props
  const tabs = useMarketTabs((snapshot) => snapshot)
  const [picked, setPicked] = useState<string | null>(null)
  const activeId = tabs.some((tab) => tab.id === picked) ? picked : (tabs[0]?.id ?? null)
  return (
    <div className={css.hub}>
      <h2 className={css.hubHeading} title={t('hub.title')}>{t('hub.title')}</h2>
      <p className={css.hubLede} title={t('hub.description')}>{t('hub.description')}</p>
      {tabs.length > 1 ? (
        <div className={css.tabs} role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              className={tab.id === activeId ? css.tab + ' ' + css.tabActive : css.tab}
              onClick={() => { setPicked(tab.id) }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      {activeId !== null ? (
        <div role="tabpanel">
          {renderSlot(MARKET_TAB_KEY, { close }, { only: activeId })}
        </div>
      ) : null}
    </div>
  )
}
