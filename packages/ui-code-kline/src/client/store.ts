/**
 * Browser-side code-kline store: per-workspace K-line snapshots keyed by
 * workspace id, written only through the store's audit actions (the same
 * engine currency as every standard-kit slot store). The RPC fetch lives in
 * the plugin apply body: `ensure` marks loading via an action, awaits
 * `codeKline.list`, then commits the result through the same action set —
 * components only ever read snapshots.
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { RpcError, WorkspaceId } from '@deepseek-ai/dsh-client-connection/client'
import type { KlineCandleView } from '@deepseek-ai/dsh-host-apiproxy'

/** One workspace's K-line state as UI consumers see it. */
export interface WorkspaceKlineState {
  /** Workspace id this entry answers for. */
  workspaceId: WorkspaceId
  /** Candles in ascending date order; empty when `reason` is set. */
  candles: readonly KlineCandleView[]
  /** Absence reason; undefined when candles are present. */
  reason?: 'not-a-git-repository' | 'no-history' | 'scan-error'
  state: 'idle' | 'loading' | 'ready' | 'error'
  error: RpcError | null
}

/** Store state: per-workspace entries plus expanded branch set. */
export type CodeKlineState = {
  entries: Record<string, WorkspaceKlineState>
  /** Workspace ids whose row-below quote branch is expanded. */
  expanded: string[]
}

/** Store write set: the one and only way state changes. */
export type CodeKlineActions = {
  /** Replace one workspace's entry. */
  setEntry: (draft: CodeKlineState, workspaceId: string, entry: WorkspaceKlineState) => void
  /** Toggle one workspace's quote branch (immutable array swap). */
  toggleBranch: (draft: CodeKlineState, workspaceId: string) => void
}

/**
 * Create the code-kline store handle. Handles are constructed in apply world
 * and shared across the plugin's registrations; never export a module-level
 * handle (module-cache identity is a disguised singleton across reloads).
 */
export function createCodeKlineStore(): EngineStoreHandle<CodeKlineState, CodeKlineActions> {
  return defineStore({
    init: (): CodeKlineState => ({ entries: {}, expanded: [] }),
    actions: {
      setEntry: (draft, workspaceId, entry) => {
        draft.entries[workspaceId] = entry
      },
      toggleBranch: (draft, workspaceId) => {
        draft.expanded = draft.expanded.includes(workspaceId)
          ? draft.expanded.filter(other => other !== workspaceId)
          : [...draft.expanded, workspaceId]
      },
    },
  })
}
