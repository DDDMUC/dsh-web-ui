/**
 * Models-page footer extension area: the disabled-provider archive listing.
 *
 * A disabled provider's route is unregistered, so for hand-declared routes
 * the provider card itself disappears from the Models page; this footer (the
 * page's `settings.models.footer` seat) is where those providers come back:
 * it lists the archive entries and restores a profile on enable. Renders
 * nothing while the archive is empty.
 * @module @linxin666/dsh-client-ui-model-capabilities/client/DisabledProvidersFooter
 */

import { useCallback, useEffect, useState } from 'react'
import {
  CAPS_SETTINGS_NAMESPACE,
  readDisabledStore,
  type StashedProvider,
} from '../core/provider-toggle.ts'
import { enableProvider } from './provider-toggle.ts'
import type { RefreshBus, SettingsNamespaceFace } from './settings-face.ts'
import { t } from './locales.ts'
import css from './capabilities.module.css'

/** The pi-ai family namespace the archived routes live in. */
const LLM_PI_AI_NAMESPACE = 'llm-pi-ai'

/** Component props: the injected settings face and refresh bus. */
export interface DisabledProvidersFooterProps {
  /** The generated remote settings namespace (extracted by the apply body). */
  settings: SettingsNamespaceFace
  /** Cross-surface refresh bus (a card-side toggle updates this listing). */
  refresh: RefreshBus
}

/** One listing row's transient state. */
type RowBusy = { route: string, busy: boolean } | undefined

/**
 * Render the disabled-provider archive.
 * @param props - the injected settings face and refresh bus.
 * @returns the footer area, or nothing while the archive is empty.
 */
export function DisabledProvidersFooter(props: DisabledProvidersFooterProps) {
  const { settings, refresh } = props
  const [stash, setStash] = useState<Record<string, StashedProvider>>({})
  const [known, setKnown] = useState(false)
  const [busyRoute, setBusyRoute] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const load = useCallback(async (face: SettingsNamespaceFace) => {
    try {
      const described = await face.describe()
      if (!described.ok) return
      const view = described.value.namespaces.find(candidate => candidate.ns === CAPS_SETTINGS_NAMESPACE)
      if (view === undefined) return
      setStash(readDisabledStore(view.value))
      setKnown(true)
    } catch {
      // The archive listing is additive; a failed read keeps the last one.
    }
  }, [])

  useEffect(() => {
    void load(settings)
  }, [load, settings])

  useEffect(() => {
    return refresh.subscribe(() => { void load(settings) })
  }, [load, refresh, settings])

  const routes = Object.keys(stash).sort((a, b) => a.localeCompare(b))
  if (!known || routes.length === 0) return null

  const enable = async (route: string) => {
    if (busyRoute !== undefined) return
    setBusyRoute(route)
    setFailure(undefined)
    try {
      const outcome = await enableProvider(settings, LLM_PI_AI_NAMESPACE, route)
      if (outcome.kind === 'ok') {
        refresh.notify()
        await load(settings)
        return
      }
      if (outcome.kind === 'conflict') {
        setFailure(t('caps.conflict'))
        await load(settings)
        return
      }
      if (outcome.kind === 'route-exists') setFailure(t('caps.error.routeExists'))
      else if (outcome.kind === 'unavailable') setFailure(t('caps.error.unavailable'))
      else if (outcome.kind === 'partial') setFailure(t('caps.error.partialEnable', { error: outcome.message }))
      else setFailure(t('caps.failed', { error: outcome.kind }))
    } finally {
      setBusyRoute(undefined)
    }
  }

  return (
    <section className={css.archive} data-dsh-plugin="model-capabilities" data-dsh-part="disabled-footer">
      <p className={css.archiveTitle}>{t('caps.footer.title')}</p>
      <ul className={css.archiveRows}>
        {routes.map(route => {
          const entry = stash[route]
          const name = entry.displayName !== undefined && entry.displayName.length > 0 ? entry.displayName : route
          return (
            <li key={route} className={css.archiveRow} data-dsh-part="disabled-row">
              <span className={css.modelId}>{name}</span>
              {name !== route ? <span className={css.modelName}>{route}</span> : null}
              <span className={css.spacer} />
              <button
                type="button"
                className={css.ghost}
                data-dsh-part="enable"
                disabled={busyRoute !== undefined}
                onClick={() => { void enable(route) }}
              >
                {busyRoute === route ? t('caps.busy.enabling') : t('caps.action.enable')}
              </button>
            </li>
          )
        })}
      </ul>
      <p className={css.hint}>{t('caps.footer.hint')}</p>
      {failure !== undefined ? <p className={css.failed} role="alert">{failure}</p> : null}
    </section>
  )
}
