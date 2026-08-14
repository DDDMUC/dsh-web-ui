/**
 * The git branch selector chip, mounted above the input card. Preferred
 * seat is the selector row's context hole
 * (`conversation.input.selector.context`, session-maybe) right beside the
 * official workspace selector; on shells that dropped the hole (rc.6 and the
 * current shipped shell) the chip falls back to `conversation.input.dock`
 * (session-scoped). The dock seat renders its own row above the composer
 * card, so the chip measures the input card's left edge and aligns itself
 * flush with it. The chip hides itself only when its data source is absent
 * (no session cwd, or not a git repository).
 * @module dsh-git-graph/client/chips/BranchChip
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { BranchesView, RepoStatus } from '../../core/types.ts'
import type { GitGraphInjected } from '../index.ts'
import { Chip } from './Chip.tsx'
import { BranchPopover } from './BranchPopover.tsx'
import { CreateBranchDialog } from './CreateBranchDialog.tsx'
import { GraphDialog } from '../graph/GraphDialog.tsx'
import css from './context.module.css'

/** Full props of the branch chip: either seat's runtime share (the session-maybe context hole or the session-scoped dock fallback) + the git-graph inject face + the locale seat. */
export type BranchChipProps =
  (PropsRuntime<'conversation.input.selector.context'> | PropsRuntime<'conversation.input.dock'>)
  & GitGraphInjected
  & PropsLocale<'git-graph'>

/**
 * The git branch selector chip.
 * @param props - the composed entry props of whichever seat it mounted in.
 */
export function BranchChip(props: BranchChipProps) {
  const sessionId = props.sessionId
  // Only the dock seat carries the conversation snapshot; its row spans the
  // whole composer stack, so the chip indents by the shell's composer side
  // clearance to start flush with the input card below it.
  const dockSeat = 'session' in props

  /** Repository state: undefined = loading, null = not a repository, else the snapshot. */
  const [repo, setRepo] = useState<RepoStatus | null | undefined>(undefined)
  /** Fresh branch list, fetched when the branch popover opens. */
  const [branchesView, setBranchesView] = useState<BranchesView | null>(null)
  const [branchOpen, setBranchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  /** Measured left offset between the dock row and the input card; null until measured. */
  const [dockInset, setDockInset] = useState<number | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)

  // The dock row spans different containers per shell phase (the centered
  // hero composer stack, or the full-width active-session column), so the
  // chip measures the input card's left edge and matches it instead of
  // trusting a fixed indent. The CSS class keeps the hero-phase clearance
  // as a fallback before the first measurement.
  useLayoutEffect(() => {
    if (!dockSeat) return
    const anchor = anchorRef.current
    if (anchor === null) return
    const update = (): void => {
      const card = document.querySelector<HTMLElement>('[data-composer-card]')
      if (card === null) return
      const inset = Math.max(0, card.getBoundingClientRect().left - anchor.getBoundingClientRect().left)
      setDockInset(previous => previous === inset ? previous : inset)
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(anchor)
    const card = document.querySelector<HTMLElement>('[data-composer-card]')
    if (card !== null) observer?.observe(card)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [dockSeat, repo !== undefined && repo !== null])

  const refetch = useCallback(() => {
    let live = true
    props.repoStatus(sessionId)
      .then((status) => { if (live) setRepo(status) })
      .catch(() => { if (live) setRepo(null) })
    return () => { live = false }
  }, [props.repoStatus, sessionId])

  // Initial load + host-pushed external changes + focus refresh. A session
  // switch changes props.sessionId and re-fetches through the session-keyed
  // verbs.
  useEffect(() => refetch(), [refetch])
  useEffect(() => {
    const unsubscribe = props.subscribeChanges(sessionId, () => { refetch() })
    const onFocus = (): void => { refetch() }
    window.addEventListener('focus', onFocus)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [props.subscribeChanges, sessionId, refetch])

  const closeCreate = (): void => {
    setCreateOpen(false)
    refetch()
  }

  // Fetch the fresh branch list each time the popover opens. All hooks stay
  // above the data-gated returns so the hook order is stable while `repo`
  // settles from undefined (loading) to a snapshot.
  useEffect(() => {
    if (!branchOpen) return
    let live = true
    setBranchesView(null)
    props.branches(sessionId).then((view) => { if (live) setBranchesView(view) })
    return () => { live = false }
  }, [branchOpen, props.branches, sessionId])

  // Loading or not a repository: no chip (no dead control). A workspace that
  // becomes a repository appears on the next refresh.
  if (repo === undefined || repo === null) return null

  const openBranchPopover = (): void => {
    setBranchOpen(open => !open)
  }

  return (
    <div
      ref={anchorRef}
      className={dockSeat ? `${css.anchor} ${css.anchorDock}` : css.anchor}
      style={dockSeat && dockInset !== null ? { paddingLeft: `${dockInset}px` } : undefined}
    >
      <Chip
        icon={<IconBranchOutline16 size={14} />}
        label={repo.branch === '' ? props.t('branch.detached') : repo.branch}
        ariaLabel={props.t('chip.aria.branch')}
        open={branchOpen}
        onClick={openBranchPopover}
      />
      {branchOpen && branchesView !== null && (
        <BranchPopover
          view={branchesView}
          onSwitch={(branch) => props.switchBranch(sessionId, branch)}
          onSwitched={refetch}
          onCreate={() => {
            setBranchOpen(false)
            setCreateOpen(true)
          }}
          onGraph={() => {
            setBranchOpen(false)
            setGraphOpen(true)
          }}
          onClose={() => { setBranchOpen(false) }}
          t={props.t}
        />
      )}
      {createOpen && (
        <CreateBranchDialog
          onCreate={(name) => props.createBranch(sessionId, name)}
          onClose={closeCreate}
          t={props.t}
        />
      )}
      {graphOpen && (
        <GraphDialog
          graph={(limit) => props.graph(sessionId, limit)}
          onClose={() => { setGraphOpen(false) }}
          t={props.t}
        />
      )}
    </div>
  )
}
