/**
 * The Changes (SCM) panel: per-repo working-tree status grouped into staged /
 * unstaged / untracked, with stage/unstage/discard actions on every row and
 * bulk actions in the section header. The host status is the only truth — no
 * optimistic rows; a failed batch surfaces its paths and the next refresh
 * clears the flag. Discard confirms with copy split by recoverability
 * (untracked = delete vs tracked = irreversible restore).
 *
 * AionUi ScmPanel behavior (Apache-2.0, re-implemented): window focus
 * refreshes (external editors write without git events), unknown states
 * render as a quiet '?', conflicted rows are visually distinct AND have no
 * actions.
 * @module dsh-aionui-panel/client/components/ScmPanel
 */

import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { GitChangeRow } from '../../core/types.ts'
import { t, format } from '../locales.ts'
import { useStore } from '../hooks/useStore.ts'
import type { PanelStores } from '../store.ts'
import { ConfirmDialog } from './overlay.tsx'
import { FileTypeIcon } from './FileIcon.tsx'
import { BranchIcon, ChevronDownIcon, ChevronRightIcon, ListIcon, MinusIcon, PlusIcon, TreeIcon, UndoIcon } from './icons.tsx'
import scmCss from '../styles/scm.module.css'

/** Badge letter + color class per state. */
const BADGE: Record<string, { letter: string; className: string }> = {
  created: { letter: 'A', className: scmCss.badgeCreated },
  modified: { letter: 'M', className: scmCss.badgeModified },
  deleted: { letter: 'D', className: scmCss.badgeDeleted },
  renamed: { letter: 'R', className: scmCss.badgeCreated },
  conflicted: { letter: '!', className: scmCss.badgeConflicted },
  untracked: { letter: '?', className: scmCss.badgeUntracked },
  unknown: { letter: '?', className: scmCss.badgeUntracked },
}

/** The parent dir of a path ('' for root-level). */
function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : ''
}

/** Build a display-only directory tree from rows. */
function buildTree(rows: GitChangeRow[]): Map<string, GitChangeRow[]> {
  const byDir = new Map<string, GitChangeRow[]>()
  for (const row of rows) {
    const dir = dirOf(row.path)
    const list = byDir.get(dir)
    if (list === undefined) byDir.set(dir, [row])
    else list.push(row)
  }
  return byDir
}

/**
 * The SCM tab body.
 * @param stores - the panel store bundle.
 */
export function ScmPanel({ stores }: { stores: PanelStores }): JSX.Element {
  const scm = stores.scm
  const state = useStore(scm)
  const [discardTargets, setDiscardTargets] = useState<GitChangeRow[] | null>(null)

  // Window focus refreshes (catches external editors writing the tree).
  useEffect(() => {
    const onFocus = (): void => { void scm.refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [scm])

  const status = state.status
  const changesSectionOpen = state.sectionCollapsed['changes'] !== true

  const requestDiscard = (rows: GitChangeRow[]): void => {
    if (rows.length === 0) return
    setDiscardTargets(rows)
  }
  const confirmDiscard = (): void => {
    if (discardTargets === null) return
    void scm.discard(discardTargets.map((row) => row.path))
    setDiscardTargets(null)
  }

  if (state.loading && status === null) {
    return <div className={`aionui-root ${scmCss.panel}`}><div className={scmCss.loading}>{t('scm.loading')}</div></div>
  }
  if (status === null) {
    return <div className={`aionui-root ${scmCss.panel}`}><div className={scmCss.notRepo}>{t('scm.notRepo')}</div></div>
  }

  const staged = status.staged
  const unstaged = status.unstaged
  const untracked = status.untracked
  const hasChanges = staged.length + unstaged.length + untracked.length > 0
  const allUntracked = discardTargets !== null && discardTargets.every((row) => row.state === 'untracked')

  return (
    <div className={`aionui-root ${scmCss.panel}`}>
      {/* Changes section. */}
      <div className={scmCss.section} style={{ flex: changesSectionOpen ? 1 : undefined, maxHeight: changesSectionOpen ? undefined : 24 }}>
        <div
          className={scmCss.sectionHeader}
          onClick={() => scm.setSectionCollapsed('changes', changesSectionOpen)}
          role="button"
          aria-expanded={changesSectionOpen}
        >
          <span className={`${scmCss.sectionChevron}${changesSectionOpen ? ` ${scmCss.sectionChevronOpen}` : ''}`}>
            <ChevronRightIcon size={13} />
          </span>
          <span className={scmCss.sectionTitle}>{t('scm.changes')}</span>
          {status.branch !== '' && (
            <span className={scmCss.branchName} style={{ fontSize: 11, color: 'var(--aion-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <BranchIcon size={12} />
              {status.branch}
            </span>
          )}
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={scmCss.sectionAction}
              title={t('scm.stageAll')}
              onClick={() => void scm.stage(unstaged.map((row) => row.path))}
              disabled={unstaged.length === 0}
            >
              <PlusIcon size={13} />
            </button>
            <button
              type="button"
              className={scmCss.sectionAction}
              title={t('scm.discardAll')}
              onClick={() => requestDiscard([...unstaged, ...untracked])}
              disabled={unstaged.length + untracked.length === 0}
            >
              <UndoIcon size={13} />
            </button>
            <button
              type="button"
              className={`${scmCss.sectionAction}${state.viewMode === 'list' ? '' : ''}`}
              title={t('scm.viewList')}
              style={{ color: state.viewMode === 'list' ? 'var(--aion-brand)' : undefined }}
              onClick={() => scm.setViewMode('list')}
            >
              <ListIcon size={13} />
            </button>
            <button
              type="button"
              className={scmCss.sectionAction}
              title={t('scm.viewTree')}
              style={{ color: state.viewMode === 'tree' ? 'var(--aion-brand)' : undefined }}
              onClick={() => scm.setViewMode('tree')}
            >
              <TreeIcon size={13} />
            </button>
          </span>
        </div>

        {changesSectionOpen && (
          <div className={scmCss.sectionBody}>
            {!hasChanges && <div className={scmCss.empty}>{t('scm.empty')}</div>}
            {hasChanges && (
              <Group
                scm={scm}
                title={staged.length > 0 ? t('scm.staged') : undefined}
                rows={staged}
                bulkLabel={t('scm.unstage')}
                onBulk={(rows) => void scm.unstage(rows.map((row) => row.path))}
                onDiscard={requestDiscard}
              />
            )}
            {hasChanges && unstaged.length > 0 && (
              <Group
                scm={scm}
                rows={unstaged}
                bulkLabel={t('scm.stage')}
                onBulk={(rows) => void scm.stage(rows.map((row) => row.path))}
                onDiscard={requestDiscard}
              />
            )}
            {untracked.length > 0 && (
              <Group
                scm={scm}
                title={t('scm.untracked')}
                rows={untracked}
                bulkLabel={t('scm.stage')}
                onBulk={(rows) => void scm.stage(rows.map((row) => row.path))}
                onDiscard={requestDiscard}
              />
            )}
          </div>
        )}
      </div>

      {discardTargets !== null && (
        <ConfirmDialog
          title={t('scm.discard')}
          body={allUntracked
            ? format(t('scm.discardConfirmUntracked'), { count: discardTargets.length })
            : format(t('scm.discardConfirmTracked'), { count: discardTargets.length })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={confirmDiscard}
          onCancel={() => setDiscardTargets(null)}
        />
      )}
    </div>
  )
}

/** One change group (staged / unstaged / untracked) with list or tree body. */
function Group({
  scm,
  rows,
  title,
  bulkLabel,
  onBulk,
  onDiscard,
}: {
  scm: PanelStores['scm']
  rows: GitChangeRow[]
  title?: string
  bulkLabel: string
  onBulk: (rows: GitChangeRow[]) => void
  onDiscard: (rows: GitChangeRow[]) => void
}): JSX.Element {
  const state = useStore(scm)
  const tree = useMemo(() => buildTree(rows), [rows])
  const viewTree = state.viewMode === 'tree'
  const allActionable = rows.filter((row) => row.state !== 'conflicted')

  return (
    <div>
      {title !== undefined && (
        <div className={scmCss.groupTitle}>
          {title}
          <button
            type="button"
            className={scmCss.groupAction}
            title={bulkLabel}
            onClick={() => onBulk(allActionable)}
            disabled={allActionable.length === 0}
          >
            {bulkLabel === t('scm.unstage') ? <MinusIcon size={12} /> : <PlusIcon size={12} />}
          </button>
        </div>
      )}
      {viewTree ? (
        [...tree.entries()].map(([dir, dirRows]) => (
          <DirNode
            key={dir === '' ? '\u0000' : dir}
            dir={dir}
            rows={dirRows}
            depth={0}
            state={state}
            scm={scm}
            onDiscard={onDiscard}
          />
        ))
      ) : (
        rows.map((row) => (
          <ChangeRow
            key={`${row.staged ? 's' : 'u'}:${row.path}`}
            row={row}
            state={state}
            scm={scm}
            onDiscard={onDiscard}
          />
        ))
      )}
    </div>
  )
}

/** Tree-view directory node (expandable). */
function DirNode({
  dir,
  rows,
  depth,
  state,
  scm,
  onDiscard,
}: {
  dir: string
  rows: GitChangeRow[]
  depth: number
  state: ReturnType<PanelStores['scm']['getSnapshot']>
  scm: PanelStores['scm']
  onDiscard: (rows: GitChangeRow[]) => void
}): JSX.Element {
  const expanded = state.treeExpanded.includes(dir)
  const label = dir === '' ? '/' : dir.split('/').pop() ?? dir
  return (
    <>
      <div
        className={scmCss.dirRow}
        style={{ paddingLeft: 12 + depth * 12 }}
        onClick={() => {
          const next = expanded
            ? state.treeExpanded.filter((item) => item !== dir)
            : [...state.treeExpanded, dir]
          scm.setTreeExpanded(next)
        }}
        role="button"
        aria-expanded={expanded}
      >
        <span className={`${scmCss.dirArrow}${expanded ? ` ${scmCss.dirArrowOpen}` : ''}`}>
          <ChevronRightIcon size={13} />
        </span>
        <FileTypeIcon name={label} isDir expanded={expanded} />
        <span style={{ fontSize: 13, color: 'var(--aion-text-primary)' }}>{label}</span>
      </div>
      {expanded &&
        rows.map((row) => (
          <ChangeRow
            key={`${row.staged ? 's' : 'u'}:${row.path}`}
            row={row}
            state={state}
            scm={scm}
            onDiscard={onDiscard}
            indent={depth + 1}
            hideDir
          />
        ))}
    </>
  )
}

/** One change row: badge + name + dimmed dir + hover actions. */
function ChangeRow({
  row,
  state,
  scm,
  onDiscard,
  indent = 0,
  hideDir = false,
}: {
  row: GitChangeRow
  state: ReturnType<PanelStores['scm']['getSnapshot']>
  scm: PanelStores['scm']
  onDiscard: (rows: GitChangeRow[]) => void
  indent?: number
  hideDir?: boolean
}): JSX.Element {
  const badge = BADGE[row.state] ?? BADGE.unknown
  const busy = state.busy.includes(row.path)
  const failed = state.failed.includes(row.path)
  const conflicted = row.state === 'conflicted'
  const displayName = row.oldPath !== undefined ? `${row.oldPath.split('/').pop()} -> ${row.path.split('/').pop()}` : (row.path.split('/').pop() ?? row.path)
  const dir = dirOf(row.path)

  return (
    <div
      className={`${scmCss.changeRow}${failed ? ` ${scmCss.rowFailed}` : ''}`}
      style={{ paddingLeft: 12 + indent * 12 }}
      title={row.path}
    >
      <span className={`${scmCss.badge} ${badge.className}`}>{badge.letter}</span>
      <span className={scmCss.changeName}>{displayName}</span>
      {!hideDir && dir !== '' && <span className={scmCss.changeDir}>{dir}</span>}
      <span className={`${scmCss.rowActions}${busy || failed ? ` ${scmCss.rowActionsVisible}` : ''}`}>
        {conflicted ? null : row.staged ? (
          <>
            <button
              type="button"
              className={scmCss.rowAction}
              title={t('scm.unstage')}
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); void scm.unstage([row.path]) }}
            >
              <MinusIcon size={13} />
            </button>
            <button
              type="button"
              className={scmCss.rowAction}
              title={t('scm.discard')}
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); onDiscard([row]) }}
            >
              <UndoIcon size={13} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={scmCss.rowAction}
              title={t('scm.stage')}
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); void scm.stage([row.path]) }}
            >
              <PlusIcon size={13} />
            </button>
            <button
              type="button"
              className={scmCss.rowAction}
              title={t('scm.discard')}
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); onDiscard([row]) }}
            >
              <UndoIcon size={13} />
            </button>
          </>
        )}
      </span>
    </div>
  )
}
