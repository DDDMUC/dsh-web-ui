/**
 * Mobile-surface live-event client: the plugin's `/m/api/events.mux` SSE
 * channel (Server-Sent Events — the host bridges the mux stream onto it, so
 * no WebSocket handshake or framing is needed on this side). The host
 * pushes mux frames (subscribed baselines, session events, approvals,
 * questions, queue snapshots, tasks, projections) as soon as the stream
 * opens — no subscription handshake is needed. Frames arrive as
 * server-request envelopes whose payload is the mux frame; unknown frame
 * types are dropped so a newer host never breaks this client.
 * EventSource reconnects automatically.
 */

import type { MuxFrame } from '@deepseek-ai/dsh-host-apiproxy/api/events'
import { muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema'
import { serverRequestSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'

/** Injectable seams for tests. */
export interface MuxClientOptions {
  /** EventSource factory (defaults to the browser EventSource). */
  sourceFactory?: (url: string) => EventSourceLike
}

/** The EventSource subset this client uses (browser EventSource fits). */
export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  close(): void
}

/** Browser default source factory. */
function browserSource(url: string): EventSourceLike {
  // The DOM EventSource is structurally compatible; the `this`-typed handler
  // signatures differ, so the narrow face takes it through an adapter cast.
  return new EventSource(url) as unknown as EventSourceLike
}

/**
 * Keep one SSE subscription open, fanning validated frames out to
 * subscribers. EventSource owns reconnection (with its own backoff); this
 * class only manages the subscription lifecycle.
 */
export class MuxClient {
  private readonly sourceFactory: (url: string) => EventSourceLike
  private readonly listeners = new Set<(frame: MuxFrame) => void>()
  private source: EventSourceLike | undefined
  private stopped = false
  private readonly url: string

  /**
   * @param url - the mobile events endpoint (browser-relative).
   * @param options - seams.
   */
  constructor(url = '/m/api/events.mux', options: MuxClientOptions = {}) {
    this.url = url
    this.sourceFactory = options.sourceFactory ?? browserSource
  }

  /** Open the stream (idempotent; EventSource reconnects until {@link stop}). */
  start(): void {
    this.stopped = false
    if (this.source !== undefined) return
    this.connect()
  }

  /** Close for good. */
  stop(): void {
    this.stopped = true
    this.closeSource()
  }

  /** Subscribe to validated frames; returns an unsubscribe function. */
  onFrame(listener: (frame: MuxFrame) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private connect(): void {
    const source = this.sourceFactory(this.url)
    this.source = source
    source.onmessage = (event) => {
      this.handleMessage(event.data)
    }
    source.onerror = () => {
      // EventSource reconnects by itself; when we are closing, detach first
      // so the native reconnect cannot outlive stop().
      if (this.stopped && this.source === source) this.closeSource()
    }
  }

  private handleMessage(data: string): void {
    if (typeof data !== 'string' || data === '') return
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    // The SSE channel carries server-request envelopes whose payload is the
    // mux frame (same wire shape as the desktop mux channel).
    const envelope = serverRequestSchema.safeParse(parsed)
    if (!envelope.success) return
    const frame = muxFrameSchema.safeParse(envelope.data.payload)
    if (!frame.success) return
    for (const listener of this.listeners) {
      try {
        listener(frame.data)
      } catch {
        // A throwing subscriber must not break the emit loop.
      }
    }
  }

  private closeSource(): void {
    const source = this.source
    this.source = undefined
    if (source !== undefined) {
      source.onmessage = null
      source.onerror = null
      try {
        source.close()
      } catch {
        // Already closed.
      }
    }
  }
}
