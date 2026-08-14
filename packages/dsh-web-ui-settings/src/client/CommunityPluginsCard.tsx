/**
 * The community plugin index card. Renders inside the Web UI plugin group:
 * every entry points at a contributor's own repository — this package only
 * indexes them, it never vendors their code. The body is a plain link list
 * (no settings form), so the card works without any settings namespace.
 */

import { useState, type ReactNode } from 'react'
import type { CommunityPluginKey } from './locales.ts'
import { COMMUNITY_PLUGINS, type CommunityPluginEntry } from './generated/community.ts'
import css from './web-ui-settings.module.css'

/** Props the community plugin card binds. */
export interface CommunityPluginsCardProps {
  /** Locale reader for this card's copy. */
  t: (key: CommunityPluginKey) => string
  /** Index entries; defaults to the generated registry (injected for tests). */
  plugins?: readonly CommunityPluginEntry[]
}

/**
 * Render the community plugin index card.
 * @param props - locale copy and the (default-generated) entry list.
 * @returns the disclosure card with the contributor links inside.
 */
export function CommunityPluginsCard(props: CommunityPluginsCardProps): ReactNode {
  const { t } = props
  const plugins = props.plugins ?? COMMUNITY_PLUGINS
  const [open, setOpen] = useState(false)
  return (
    <li className={css.groupCard}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name} title={t('title')}>{t('title')}</span>
          <span className={css.description} title={t('description')}>{t('description')}</span>
        </span>
        <span className={open ? css.chevronOpen : css.chevron}>▾</span>
      </button>
      {open
        ? (
          <div className={css.body}>
            <ul className={css.entries}>
              {plugins.length === 0
                ? <li className={css.empty} role="status">{t('empty')}</li>
                : plugins.map((plugin) => (
                  <li key={plugin.id} className={css.entry}>
                    <span className={css.entryHead}>
                      <span className={css.entryName} title={plugin.name}>{plugin.name}</span>
                      <span className={css.entryAuthor} title={plugin.author}>{t('author')}: {plugin.author}</span>
                    </span>
                    {plugin.description ? <p className={css.entryDescription}>{plugin.description}</p> : null}
                    {plugin.descriptionEn ? <p className={css.entryDescriptionEn}>{plugin.descriptionEn}</p> : null}
                    <span className={css.entryLinks}>
                      <a className={css.entryLink} href={plugin.repo} target="_blank" rel="noreferrer">{t('repository')}</a>
                      {plugin.npm ? <code className={css.entryNpm}>{plugin.npm}</code> : null}
                    </span>
                  </li>
                ))}
            </ul>
            <p className={css.notice} role="note">{t('notice')}</p>
          </div>
        )
        : null}
    </li>
  )
}
