/**
 * Mobile-surface mux stream client: the WebSocket live-event channel. The
 * host pushes session frames (subscribed baselines, session events,
 * approvals, questions, queue snapshots, tasks, projections) as soon as the
 * socket opens — no subscription handshake is needed. Frames are validated
 * against the wire schema; unknown frame types are dropped so a newer host
 * never breaks this client.
 */

import type { MuxFrame } from '@deepseek-ai/dsh-host-apiproxy/api/events'
import { muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema'
import { serverRequestSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'

/** Injectable seams for tests. */
export interface MuxClientOptions {
  /** Socket factory (defaults to the browser WebSocket). */
  socketFactory?: (url: string) => WebSocketLike
  /** Base reconnect delay; doubles up to the cap. */
  reconnectBaseMs?: number
  /** Cap on the reconnect delay. */
  reconnectMaxMs?: number
  /** Timer source. */
  timer?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(t: unknown): void }
}

/** The WebSocket subset this client uses (browser WebSocket fits). */
export interface WebSocketLike {
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  close(): void
}

/** Browser default socket factory. */
function browserSocket(url: string): WebSocketLike {
  // The DOM WebSocket is structurally compatible; the `this`-typed handler
  // signatures differ, so the narrow face takes it through an adapter cast.
  return new WebSocket(url) as unknown as WebSocketLike
}

const nodeTimer = { setTimeout, clearTimeout }

/**
 * Keep one mux socket open with automatic reconnect, fanning validated
 * frames out to subscribers.
 */
export class MuxClient {
  private readonly socketFactory: (url: string) => WebSocketLike
  private readonly reconnectBaseMs: number
  private readonly reconnectMaxMs: number
  private readonly timer: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(t: unknown): void }
  private readonly listeners = new Set<(frame: MuxFrame) => void>()
  private socket: WebSocketLike | undefined
  private reconnectTimer: unknown | undefined
  private attempts = 0
  private stopped = false
  private readonly url: string

  /**
   * @param url - the mux endpoint (defaults to the browser-relative path).
   * @param options - seams.
   */
  constructor(url = '/api/events.mux', options: MuxClientOptions = {}) {
    this.url = url
    this.socketFactory = options.socketFactory ?? browserSocket
    this.reconnectBaseMs = options.reconnectBaseMs ?? 2_000
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30_000
    this.timer = options.timer ?? nodeTimer
  }

  /** Open the socket (idempotent; reconnect keeps it open until {@link stop}). */
  start(): void {
    this.stopped = false
    if (this.socket !== undefined) return
    this.connect()
  }

  /** Close for good: no reconnect. */
  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== undefined) {
      this.timer.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.closeSocket()
  }

  /** Subscribe to validated frames; returns an unsubscribe function. */
  onFrame(listener: (frame: MuxFrame) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private connect(): void {
    if (this.stopped) return
    const socket = this.socketFactory(this.url)
    this.socket = socket
    socket.onopen = () => {
      // A fresh socket means fresh baselines; a reconnect resets backoff.
      this.attempts = 0
    }
    socket.onmessage = (event) => {
      this.handleMessage(event.data)
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = undefined
      this.scheduleReconnect()
    }
    socket.onerror = () => {
      // Errors normally precede close; close owns the reconnect decision.
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    // The mux channel carries server-request envelopes whose payload is the
    // mux frame (host pushes ride the RPC channel like everything else).
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

  private scheduleReconnect(): void {
    if (this.stopped) return
    const delay = Math.min(this.reconnectBaseMs * 2 ** this.attempts, this.reconnectMaxMs)
    this.attempts += 1
    this.reconnectTimer = this.timer.setTimeout(() => {
      this.reconnectTimer = undefined
      if (!this.stopped) this.connect()
    }, delay)
  }

  private closeSocket(): void {
    const socket = this.socket
    this.socket = undefined
    if (socket !== undefined) {
      // Detach handlers first so the close event cannot schedule a reconnect.
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      try {
        socket.close()
      } catch {
        // Already closed.
      }
    }
  }
}
