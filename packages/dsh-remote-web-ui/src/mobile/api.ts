/**
 * Mobile-surface business API: the handful of host RPC methods the
 * simplified surface needs. Types come from the harness apiproxy contract
 * (type-only imports; the wire schemas stay in the bundle only through the
 * rpc/mux layers).
 */

import type { WorkspaceView } from '@deepseek-ai/dsh-host-apiproxy/api/workspace'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api/sessions'
import { callUnary } from './rpc.ts'

/** One session.list page. */
export interface SessionPage {
  items: SessionSummary[]
  /** Continuation cursor; undefined once the tail is reached. */
  nextCursor?: string
  hasMore: boolean
}

/** One history page (already bounded to whole messages by the host). */
export interface HistoryPage {
  events: import('@deepseek-ai/dsh-host-apiproxy/api/sessions').HistoryEntry[]
  hasMore: boolean
}

/** The workspace roster (session ids come back per workspace). */
export async function listWorkspaces(): Promise<WorkspaceView[]> {
  const { items } = await callUnary<{ items: WorkspaceView[] }>('workspace.list', {})
  return items
}

/** One session.list page; omit the cursor for the first page. */
export async function listSessions(cursor?: string): Promise<SessionPage> {
  return await callUnary<SessionPage>('session.list', cursor === undefined ? {} : { cursor })
}

/** One history window; omit beforeSeq for the tail page. */
export async function history(
  sessionId: string,
  beforeSeq?: number,
  maxMessages = 30,
): Promise<HistoryPage> {
  return await callUnary<HistoryPage>('session.history', {
    sessionId,
    maxMessages,
    ...(beforeSeq !== undefined ? { beforeSeq } : {}),
  })
}

/** Send one text prompt (queued: the agent picks it up in order). */
export async function prompt(sessionId: string, text: string): Promise<void> {
  await callUnary<{ accepted: true }>('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text }],
  })
}
