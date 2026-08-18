// @vitest-environment jsdom
/**
 * L2 semantic attributes of the board view (issue #506): the mounted board
 * container, the board root, every status column, and every task card opt
 * into the semantic-attrs/v1 enum (data-dsh-plugin / data-dsh-part) so skins
 * can target them without hash-class selectors.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { mountBoard } from '../src/client/board-mount.tsx'
import { TaskBoard } from '../src/client/board/TaskBoard.tsx'
import type { BoardController, ControllerSnapshot } from '../src/core/controller.ts'
import type { TaskRecord } from '../src/core/tasks.ts'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
let disposeMount: (() => void) | undefined

afterEach(() => {
  disposeMount?.()
  disposeMount = undefined
  for (const root of roots.splice(0)) {
    act(() => { root.unmount() })
  }
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-dsh-taskboard-active')
})

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't1',
    title: 'Task A',
    description: '',
    prompt: 'do it',
    status: 'todo',
    createdAt: 0,
    updatedAt: Date.now(),
    executions: [],
    ...overrides,
  }
}

function fakeController(snapshot?: Partial<ControllerSnapshot>): BoardController {
  const state: ControllerSnapshot = {
    tasks: [task()],
    boardOpen: false,
    archiveView: false,
    selectedTaskId: undefined,
    executionOptions: { workspaces: [], presets: [] },
    pendingTaskIds: [],
    ...snapshot,
  }
  return {
    getSnapshot: () => state,
    subscribe: () => () => {},
    closeBoard: () => {},
    toggleArchiveView: () => {},
    retryHostSync: async () => {},
    openTask: () => {},
  } as unknown as BoardController
}

describe('TaskBoard L2 semantic attributes (#506)', () => {
  it('tags the board root, the status columns, and the task cards', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    await act(async () => { root.render(<TaskBoard controller={fakeController()} />) })

    const board = container.querySelector('[data-dsh-taskboard-board]')
    expect(board).not.toBeNull()
    expect(board!.getAttribute('data-dsh-plugin')).toBe('task-board')

    const columns = container.querySelectorAll('section[data-status]')
    expect(columns.length).toBeGreaterThan(0)
    for (const column of columns) {
      expect(column.getAttribute('data-dsh-part')).toBe('column')
    }

    const card = container.querySelector('[data-dsh-part="card"]')
    expect(card).not.toBeNull()
    expect(card!.textContent).toContain('Task A')
  })

  it('tags the archive column as a column too', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    const controller = fakeController({
      archiveView: true,
      tasks: [task({ archivedAt: Date.now(), status: 'done' })],
    })
    await act(async () => { root.render(<TaskBoard controller={controller} />) })

    const archive = container.querySelector('section[data-status="archived"]')
    expect(archive).not.toBeNull()
    expect(archive!.getAttribute('data-dsh-part')).toBe('column')
  })
})

describe('mountBoard L2 semantic attributes (#506)', () => {
  it('tags the injected board container with data-dsh-plugin', async () => {
    const column = document.createElement('div')
    column.setAttribute('data-pane', 'conversation')
    document.body.appendChild(column)

    await act(async () => { disposeMount = mountBoard(fakeController()) })

    const view = column.querySelector('[data-dsh-taskboard-view]')
    expect(view).not.toBeNull()
    expect(view!.getAttribute('data-dsh-plugin')).toBe('task-board')
  })
})
