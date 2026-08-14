// @vitest-environment jsdom
/**
 * Branch-chip behavior tests: the input selector context entry renders the
 * branch chip from the session baseline, non-repository workspaces (and
 * sessions without a cwd) hide it, blank (hero) sessions keep it mounted,
 * the popover searches/filters and marks the current branch, the footer
 * flows fire the right verbs, switch rejections surface readable copy, and
 * the create/graph dialogs behave (validation, duplicate copy, lane
 * rendering).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { BranchesView, GraphView, RepoStatus, SwitchResult } from '../src/core/types.ts'
import type { GitGraphInjected } from '../src/client/index.ts'
import type { BranchChipProps } from '../src/client/chips/BranchChip.tsx'
import { BranchChip } from '../src/client/chips/BranchChip.tsx'
import { zh, type GitGraphKey } from '../src/client/locales.ts'

afterEach(cleanup)

const sid = (value: string): SessionId => value as SessionId

/** Minimal translate over the zh dictionary (template params included). */
function makeTranslate(): BranchChipProps['t'] {
  return (key, params) => {
    let text = zh[key as GitGraphKey] ?? key
    if (params !== undefined) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
    }
    return text
  }
}

interface BenchOptions {
  cwd?: string
  blank?: boolean
  repoStatus?: RepoStatus | null
  branchesView?: BranchesView | null
  switchResult?: SwitchResult
  createResult?: SwitchResult
  graphView?: GraphView | null
  /** Override the graph verb (e.g. a deferred promise for the loading state). */
  graph?: (limit?: number) => Promise<GraphView | null>
}

/** The seat whose props the bench should compose. */
type BenchSeat = 'context' | 'dock'

/** Render the branch chip with stub framework hooks and a scripted inject face. */
function bench(options: BenchOptions = {}, seat: BenchSeat = 'context') {
  const sessionId = sid('sess-1')
  const cwd = 'cwd' in options ? options.cwd : '/ws/proj'
  const repoStatus = options.repoStatus === undefined
    ? { root: '/ws/proj', branch: 'main', head: 'abc1234', dirtyFiles: 0, untrackedFiles: 0, conflicts: 0, operationInProgress: false }
    : options.repoStatus
  const branchesView = options.branchesView === undefined
    ? {
      root: '/ws/proj', branch: 'main',
      branches: [
        { name: 'feature/x', current: false },
        { name: 'main', current: true },
      ],
      dirtyFiles: 0, untrackedFiles: 0, conflicts: 0, operationInProgress: false,
    }
    : options.branchesView

  const calls: Record<string, unknown[]> = {
    repoStatus: [], branches: [], switchBranch: [], createBranch: [], graph: [],
    subscribeChanges: [],
  }
  const record = <K extends keyof typeof calls>(key: K, ...args: unknown[]): void => {
    calls[key].push(args)
  }

  const injected: GitGraphInjected = {
    // Mirrors the real inject face: without a session cwd every git verb
    // resolves no workspace (null), so the chip has nothing to show.
    repoStatus: vi.fn(async (sessionId: SessionId | undefined) => { record('repoStatus', sessionId); return cwd === undefined ? null : repoStatus }),
    branches: vi.fn(async (sessionId: SessionId | undefined) => { record('branches', sessionId); return cwd === undefined ? null : branchesView }),
    switchBranch: vi.fn(async (sessionId: SessionId | undefined, branch: string) => {
      record('switchBranch', sessionId, branch)
      return options.switchResult ?? { ok: true, branch }
    }),
    createBranch: vi.fn(async (sessionId: SessionId | undefined, name: string) => {
      record('createBranch', sessionId, name)
      return options.createResult ?? { ok: true, branch: name }
    }),
    graph: vi.fn(async (sessionId: SessionId | undefined, limit?: number) => {
      record('graph', sessionId, limit)
      return options.graph !== undefined ? options.graph(limit) : options.graphView ?? null
    }),
    subscribeChanges: vi.fn((sessionId: SessionId | undefined, _onChange: () => void) => { record('subscribeChanges', sessionId); return () => {} }),
  }

  const sessionsState = {
    byId: { [sessionId]: { cwd, blank: options.blank === true } },
  }
  const commonProps = {
    // The context/dock holes read their state from the standard session kit +
    // the inject face; the dock seat additionally carries the conversation
    // snapshot (and indents the chip to the input card start).
    useSession: (() => undefined) as never,
    useSessions: ((selector: (state: typeof sessionsState) => unknown) => selector(sessionsState)) as never,
    useWorkspaces: (() => undefined) as never,
    useProjection: (() => undefined) as never,
    t: makeTranslate(),
    ...injected,
  } as const

  let props: BranchChipProps
  if (seat === 'dock') {
    props = {
      ...commonProps,
      sessionId,
      session: { composerPhase: 'active' } as never,
      input: {} as never,
    }
  } else {
    props = {
      ...commonProps,
      sessionId,
    }
  }

  const view = render(<BranchChip {...props} />)
  return { view, injected, calls, props }
}

describe('BranchChip', () => {
  it('shows the branch chip with the current branch name', async () => {
    bench()
    const branchChip = await screen.findByRole('button', { name: '分支' })
    expect(branchChip.textContent).toContain('main')
  })

  it('keeps the branch chip in a blank (hero) session — the selector row stays docked', async () => {
    bench({ blank: true })
    const branchChip = await screen.findByRole('button', { name: '分支' })
    expect(branchChip.textContent).toContain('main')
  })

  it('shows the chip on the dock seat above the composer card', async () => {
    bench({}, 'dock')
    const branchChip = await screen.findByRole('button', { name: '分支' })
    expect(branchChip.textContent).toContain('main')
  })

  it('indents the dock copy so it starts flush with the input card', async () => {
    bench({}, 'dock')
    const branchChip = await screen.findByRole('button', { name: '分支' })
    // The dock row spans the composer stack; only the dock seat carries the
    // side-clearance indent that aligns the chip with the input card below.
    expect(branchChip.parentElement?.className).toContain('anchorDock')
  })

  it('measures the input card left edge and applies it as the dock indent', async () => {
    const card = document.createElement('div')
    card.setAttribute('data-composer-card', '')
    document.body.append(card)
    try {
      const { view } = bench({}, 'dock')
      const chip = await screen.findByRole('button', { name: '分支' })
      const anchor = chip.parentElement as HTMLElement
      anchor.getBoundingClientRect = () => ({
        left: 540, right: 1344, top: 0, bottom: 24, width: 804, height: 24, x: 540, y: 0, toJSON: () => ({}),
      }) as DOMRect
      card.getBoundingClientRect = () => ({
        left: 600, right: 1380, top: 0, bottom: 100, width: 780, height: 100, x: 600, y: 0, toJSON: () => ({}),
      }) as DOMRect
      act(() => { window.dispatchEvent(new Event('resize')) })
      expect(anchor.style.paddingLeft).toBe('60px')
      expect(view.unmount).toBeTruthy()
    } finally {
      card.remove()
    }
  })

  it('keeps the context copy without the dock indent', async () => {
    bench()
    const branchChip = await screen.findByRole('button', { name: '分支' })
    expect(branchChip.parentElement?.className).not.toContain('anchorDock')
  })

  it('hides the branch chip when the workspace is not a git repository', async () => {
    bench({ repoStatus: null })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: '分支' })).toBeNull()
  })

  it('hides the branch chip without a session cwd (cold start)', async () => {
    bench({ cwd: undefined })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: '分支' })).toBeNull()
  })

  it('switches a branch from the list and closes on success', async () => {
    const { injected, calls } = bench()
    fireEvent.click(await screen.findByRole('button', { name: '分支' }))
    fireEvent.click(await screen.findByRole('option', { name: 'feature/x' }))
    expect(calls.switchBranch).toEqual([['sess-1', 'feature/x']])
    expect(await screen.findByText('已切换到分支 feature/x')).toBeTruthy()
    expect(injected.switchBranch).toHaveBeenCalled()
  })

  it('shows readable copy when a switch is rejected', async () => {
    bench({
      switchResult: { ok: false, error: { code: 'conflicts-present', message: 'conflicts' } },
    })
    fireEvent.click(await screen.findByRole('button', { name: '分支' }))
    fireEvent.click(await screen.findByRole('option', { name: 'feature/x' }))
    expect(await screen.findByText('当前仓库还有未解决的冲突，先处理完再切换分支。')).toBeTruthy()
  })

  it('shows the overwrite copy with blocked paths', async () => {
    bench({
      switchResult: {
        ok: false,
        error: { code: 'untracked-changes-would-be-overwritten', message: 'blocked', paths: ['a.txt'], moreFiles: 2 },
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: '分支' }))
    fireEvent.click(await screen.findByRole('option', { name: 'feature/x' }))
    expect(await screen.findByText(/未跟踪文件会被目标分支覆盖："a.txt" 等另外 2 个文件/)).toBeTruthy()
  })

  it('creates a branch through the dialog with validation copy', async () => {
    const { injected } = bench()
    fireEvent.click(await screen.findByRole('button', { name: '分支' }))
    fireEvent.click(await screen.findByRole('button', { name: /创建并检出新分支/ }))
    const input = screen.getByLabelText('分支名')
    fireEvent.change(input, { target: { value: 'bad name' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并切换' }))
    expect(await screen.findByText('分支名无效，请重新输入。')).toBeTruthy()
    expect(injected.createBranch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'feature/good' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并切换' }))
    expect(injected.createBranch).toHaveBeenCalledWith(sid('sess-1'), 'feature/good')
  })

  it('shows duplicate-name copy from the host', async () => {
    bench({
      createResult: { ok: false, error: { code: 'branch-already-exists', message: 'dup' } },
    })
    fireEvent.click(await screen.findByRole('button', { name: '分支' }))
    fireEvent.click(await screen.findByRole('button', { name: /创建并检出新分支/ }))
    fireEvent.change(screen.getByLabelText('分支名'), { target: { value: 'feature/x' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并切换' }))
    expect(await screen.findByText('分支已存在，请换一个名称。')).toBeTruthy()
  })

  it('renders the Git graph with lanes, refs, and load-more', async () => {
    const graphView: GraphView = {
      root: '/ws/proj', branch: 'main',
      commits: [
        { oid: 'aabbcc', parents: ['ddeeff'], subject: 'merge work', author: 'Alice', authorTime: 1700000000, refs: ['main', 'v1'] },
        { oid: 'ddeeff', parents: [], subject: 'root commit', author: 'Bob', authorTime: 1690000000, refs: [] },
      ],
      hasMore: true,
    }
    const { calls } = bench({ graphView })
    fireEvent.click(await screen.findByRole('button', { name: '分支' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Git 图谱' }))
    const dialog = await screen.findByRole('dialog', { name: 'Git 图谱' })
    expect(dialog.textContent).toContain('merge work')
    expect(dialog.textContent).toContain('2 个提交')
    expect(calls.graph).toEqual([['sess-1', 200]])
    // Refs render as pills; the current branch is highlighted.
    expect(dialog.querySelectorAll('[class*="graphRef"]')).toHaveLength(2)
    expect(dialog.querySelectorAll('[class*="graphRefCurrent"]')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    expect(calls.graph).toEqual([['sess-1', 200], ['sess-1', 102]])
  })

  it('shows a loading hint before the first graph response', async () => {
    let resolveGraph!: (view: GraphView) => void
    bench({
      graph: () => new Promise<GraphView>((resolve) => { resolveGraph = resolve }),
    })
    fireEvent.click(await screen.findByRole('button', { name: '分支' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Git 图谱' }))
    expect(await screen.findByText('加载中…')).toBeTruthy()
    resolveGraph({
      root: '/ws/proj', branch: 'main',
      commits: [
        { oid: 'aabbcc', parents: [], subject: 'root commit', author: 'Bob', authorTime: 1690000000, refs: [] },
      ],
      hasMore: false,
    })
    expect(await screen.findByText('root commit')).toBeTruthy()
  })
})
