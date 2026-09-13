/**
 * Board view: the multi-column kanban that replaces the middle column while
 * active. Cards open the task detail (never execute directly); the header
 * offers filter, new-task, and a back-to-chat escape.
 */
import { memo, useCallback, useEffect, useState } from 'react'
import { selectedTaskOf, type BoardController } from '../../core/controller.ts'
import { COLUMNS, canMoveManually, collectKnownTags, tagTone, type TaskRecord } from '../../core/tasks.ts'
import { t } from '../locales.ts'
import css from '../board.module.css'
import { NewTaskModal } from './NewTaskModal.tsx'
import { STATUS_KEY } from './status-key.ts'
import { TaskCard } from './TaskCard.tsx'
import { TaskDetail } from './TaskDetail.tsx'

/** Case-insensitive title/description/tag/freeze-snapshot match. */
export function matchesFilter(task: TaskRecord, filter: string): boolean {
  if (filter.trim() === '') return true
  const needle = filter.trim().toLowerCase()
  const haystacks = [task.title, task.description, ...(task.tags ?? []).map(tag => tag.name)]
  if (task.freeze !== undefined) haystacks.push(task.freeze.goal, task.freeze.progress, task.freeze.next)
  return haystacks.some(text => text.toLowerCase().includes(needle))
}

/**
 * Whether a task carries every selected label (issue #1521). Multi-select is
 * conjunctive: adding a label narrows the board instead of widening it, which
 * is the only reading that keeps "工作" selected from dragging unrelated cards
 * back in when a second label is added.
 */
export function matchesTagFilter(task: TaskRecord, selected: readonly string[]): boolean {
  if (selected.length === 0) return true
  const names = new Set((task.tags ?? []).map(tag => tag.name))
  return selected.every(name => names.has(name))
}

/**
 * Memoized per-card adapter: with a stable `onOpen` from the board and an
 * immutable task record (only the changed card gets a new object ref), a card
 * re-renders only when its own task changes — not when a sibling card status,
 * the filter, or the selection moves.
 */
const MemoTaskCard = memo(function MemoTaskCard({ task, pending, timeZone, onOpen }: { task: TaskRecord; pending: boolean; timeZone?: string; onOpen: (id: string) => void }) {
  const onClick = useCallback(() => { onOpen(task.id) }, [task.id, onOpen])
  return <TaskCard task={task} pending={pending} timeZone={timeZone} onClick={onClick} />
})

/** Board component; subscribes to the controller snapshot. */
export function TaskBoard({ controller }: { controller: BoardController }) {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot())
  useEffect(
    () => controller.subscribe(() => setSnapshot(controller.getSnapshot())),
    [controller],
  )
  const [filter, setFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [showNew, setShowNew] = useState(false)
  const selected = selectedTaskOf(snapshot)
  const archiveView = snapshot.archiveView
  // Every label in use across the ledger (board and archive alike), so the
  // filter never loses an option just because its task was archived.
  const knownTags = collectKnownTags(snapshot.tasks)
  // Archived tasks leave the columns; the archive view shows them instead.
  const visible = snapshot.tasks.filter(task =>
    (archiveView ? task.archivedAt !== undefined : task.archivedAt === undefined)
    && matchesFilter(task, filter)
    && matchesTagFilter(task, tagFilter),
  )
  const toggleTag = useCallback((name: string): void => {
    setTagFilter(current => current.includes(name)
      ? current.filter(entry => entry !== name)
      : [...current, name])
  }, [])
  const openTask = useCallback((id: string): void => { controller.openTask(id) }, [controller])

  return (
    <div className={css.board} data-dsh-taskboard-board="" data-dsh-plugin="task-board">
      <header className={css.boardHeader}>
        {/* Shared hook: dsh-web-all offsets center-view back controls beside the collapsed mobile sidebar. */}
        <button
          type="button"
          className={`${css.ghostButton} ${css.backButton}`}
          data-dsh-center-view-back=""
          aria-label={t('board.close')}
          onClick={() => { controller.closeBoard() }}
        >
          <span aria-hidden="true">‹</span>
          <span>{t('board.close')}</span>
        </button>
        <h2 className={css.boardTitle}>{t('board.title')}</h2>
        {snapshot.host !== undefined && (
          <span className={css.detailMeta}>
            {t('board.hostMeta', {
              revision: String(snapshot.host.revision),
              timeZone: snapshot.host.scheduler.timeZone,
            })}
          </span>
        )}
        <input
          className={css.search}
          type="search"
          placeholder={t('board.search')}
          value={filter}
          onChange={event => { setFilter(event.target.value) }}
          aria-label={t('board.search')}
        />
        <button
          type="button"
          className={archiveView ? css.primaryButton : css.ghostButton}
          onClick={() => { controller.toggleArchiveView() }}
        >
          {archiveView
            ? t('board.backToBoard')
            : t('board.archiveView', { count: String(snapshot.tasks.filter(task => task.archivedAt !== undefined).length) })}
        </button>
        <button
          type="button"
          className={css.primaryButton}
          onClick={() => { setShowNew(true) }}
        >
          + {t('board.new')}
        </button>
      </header>

      {!archiveView && knownTags.length > 0 && (
        <div className={css.tagFilter} data-dsh-part="tag-filter">
          <span className={css.tagFilterLabel}>{t('board.tagFilter')}</span>
          {knownTags.map(tag => {
            const active = tagFilter.includes(tag.name)
            return (
              <button
                key={tag.name}
                type="button"
                className={css.tagChip}
                data-dsh-part="tag-chip"
                data-tag-tone={tagTone(tag.name)}
                data-active={active ? 'true' : undefined}
                aria-pressed={active}
                title={tag.promptPrefix === undefined ? tag.name : tag.promptPrefix}
                onClick={() => { toggleTag(tag.name) }}
              >
                {tag.name}
              </button>
            )
          })}
          {tagFilter.length > 0 && (
            <button type="button" className={css.linkButton} onClick={() => { setTagFilter([]) }}>
              {t('board.tagFilterClear')}
            </button>
          )}
        </div>
      )}

      {snapshot.transportError !== undefined && (
        <div className={css.formError}>
          {t('board.hostError', { error: snapshot.transportError })}{' '}
          <button type="button" className={css.linkButton} onClick={() => { void controller.retryHostSync() }}>
            {t('board.retryHost')}
          </button>
        </div>
      )}

      <div className={css.columns}>
        {archiveView ? (
          <section className={css.column} data-status="archived" data-dsh-part="column">
            <header className={css.columnHeader}>
              <h3 className={css.columnTitle}>{t('board.archive')}</h3>
              <span className={css.columnCount}>{visible.length}</span>
            </header>
            <div className={css.cards}>
              {visible.map(task => (
                <MemoTaskCard key={task.id} task={task} pending={snapshot.pendingTaskIds.includes(task.id)} timeZone={snapshot.host?.scheduler.timeZone} onOpen={openTask} />
              ))}
              {visible.length === 0 && (
                <div className={css.columnEmpty}>{tagFilter.length > 0 ? t('board.tagEmpty') : t('archive.empty')}</div>
              )}
            </div>
          </section>
        ) : (
          COLUMNS.map(column => {
            const tasks = visible.filter(task => task.status === column.status)
            const isManualDropTarget = column.status === 'backlog' || column.status === 'todo'
            return (
              <section
                key={column.status}
                className={css.column}
                data-status={column.status}
                data-dsh-part="column"
                onDragOver={isManualDropTarget ? (event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                } : undefined}
                onDrop={isManualDropTarget ? (event) => {
                  event.preventDefault()
                  const taskId = event.dataTransfer.getData('text/plain')
                  if (!taskId) return
                  const dropped = snapshot.tasks.find(t => t.id === taskId)
                  if (dropped && canMoveManually(dropped.status, column.status) && dropped.status !== column.status) {
                    controller.moveTask(taskId, column.status)
                  }
                } : undefined}
              >
                <header className={css.columnHeader}>
                  <span className={css.statusDot} data-status={column.status} aria-hidden="true" />
                  <h3 className={css.columnTitle}>{t(STATUS_KEY[column.status])}</h3>
                  <span className={css.columnCount}>{tasks.length}</span>
                </header>
                <div className={css.cards}>
                  {tasks.map(task => (
                    <MemoTaskCard key={task.id} task={task} pending={snapshot.pendingTaskIds.includes(task.id)} timeZone={snapshot.host?.scheduler.timeZone} onOpen={openTask} />
                  ))}
                  {tasks.length === 0 && (
                    <div className={css.columnEmpty}>{tagFilter.length > 0 ? t('board.tagEmpty') : t('board.empty')}</div>
                  )}
                </div>
              </section>
            )
          })
        )}
      </div>

      {selected !== undefined && (
        <TaskDetail controller={controller} task={selected} />
      )}
      {showNew && (
        <NewTaskModal
          controller={controller}
          onClose={() => { setShowNew(false) }}
        />
      )}
    </div>
  )
}
