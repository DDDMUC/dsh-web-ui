/**
 * Chat level: one session. Loads the history tail page on open, appends
 * pages upward (loadOlder), folds live mux frames in as they arrive, and
 * sends prompts through session.prompt. All rendering is text-first —
 * message bodies fold to plain text, tool calls to a one-line summary.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MuxFrame } from '@deepseek-ai/dsh-host-apiproxy/api/events'
import { loadHistory, prompt, type SessionView } from './App.tsx'
import { foldEvents, type RenderMessage, type WireEvent } from '../messages.ts'
import { MuxClient } from '../mux.ts'
import { errorText } from './App.tsx'

/** Props for the chat view. */
export interface ChatViewProps {
  session: SessionView
  /** The page-lifetime mux client (undefined before the first effect tick). */
  mux?: MuxClient | undefined
  onBack(): void
}

/** Extract the raw event from one history entry (the fold consumes events only). */
function eventOf(entry: { event: WireEvent }): WireEvent {
  return entry.event
}

/**
 * Render one session's chat.
 * @param props - the session, the mux client, and the back action.
 * @returns the chat surface.
 */
export function ChatView({ session, mux, onBack }: ChatViewProps) {
  const [messages, setMessages] = useState<RenderMessage[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | undefined>(undefined)
  const pendingRef = useRef(false)

  // Tail page on open (content loads only when the session is opened).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(undefined)
    setMessages([])
    void loadHistory(session.sessionId).then(
      (page) => {
        if (cancelled) return
        setMessages(foldEvents(page.events.map(eventOf)))
        setHasOlder(page.hasMore)
        setLoading(false)
        scrollToBottom()
      },
      (reason: unknown) => {
        if (cancelled) return
        setError(errorText(reason))
        setLoading(false)
      },
    )
    return () => { cancelled = true }
  }, [session.sessionId])

  // Live frames: fold session events for this session in as they arrive.
  useEffect(() => {
    if (mux === undefined) return
    return mux.onFrame((frame: MuxFrame) => {
      if (frame.type !== 'session/event') return
      if (frame.sessionId !== session.sessionId) return
      setMessages(previous => foldEvents([frame.event as WireEvent], previous))
    })
  }, [mux, session.sessionId])

  // Keep the newest content visible while streaming.
  useEffect(() => {
    if (messages.some(message => message.pending === true)) scrollToBottom()
  }, [messages])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el === undefined) return
    el.scrollTop = el.scrollHeight
  }, [])

  /** Load one older page and prepend it. The fold is directional (incremental
   *  tails only), so the older page folds standalone and concatenates ahead —
   *  host page boundaries never cut a message, so the seam is exact. */
  const loadOlder = useCallback(() => {
    if (pendingRef.current) return
    pendingRef.current = true
    setLoading(true)
    const first = messages[0]
    if (first === undefined) {
      pendingRef.current = false
      setLoading(false)
      return
    }
    void loadHistory(session.sessionId, first.seq).then(
      (page) => {
        pendingRef.current = false
        setLoading(false)
        const older = foldEvents(page.events.map(eventOf))
        setMessages(previous => [...older, ...previous])
        setHasOlder(page.hasMore)
      },
      (reason: unknown) => {
        pendingRef.current = false
        setLoading(false)
        setError(errorText(reason))
      },
    )
  }, [session.sessionId, messages])

  /** Send the drafted prompt (the echoed user/message arrives over mux). */
  const send = useCallback(() => {
    const text = input.trim()
    if (text === '' || sending) return
    setSending(true)
    void prompt(session.sessionId, text).then(
      () => {
        setSending(false)
        setInput('')
      },
      (reason: unknown) => {
        setSending(false)
        setError(errorText(reason))
      },
    )
  }, [input, sending, session.sessionId])

  return (
    <div className="chat">
      <header className="mobile-header">
        <button type="button" className="mobile-back" aria-label="返回" onClick={onBack}>‹</button>
        <h1 className="mobile-title mobile-titleInline">{session.title}</h1>
      </header>
      {error !== undefined && <p className="mobile-error mobile-pad">{error}</p>}
      <div className="chat-scroll" ref={ref => { scrollRef.current = ref ?? undefined }}>
        {hasOlder && (
          <button type="button" className="chat-load-older" disabled={loading} onClick={() => { void loadOlder() }}>
            {loading ? '加载中…' : '加载更早的消息'}
          </button>
        )}
        {messages.map(message => <MessageRow key={message.id} message={message} />)}
        {loading && messages.length === 0 && <p className="chat-typing">加载中…</p>}
        {!loading && messages.length === 0 && <p className="chat-typing">还没有消息，发一句话开始吧</p>}
      </div>
      <div className="chat-inputbar">
        <textarea
          className="chat-input"
          rows={1}
          value={input}
          placeholder="输入消息…"
          enterKeyHint="send"
          onChange={(event) => { setInput(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button type="button" className="chat-send" disabled={sending || input.trim() === ''} onClick={() => { void send() }}>
          {sending ? '发送中…' : '发送'}
        </button>
      </div>
    </div>
  )
}

/** One rendered message row. */
function MessageRow({ message }: { message: RenderMessage }) {
  return (
    <div className={`chat-msg chat-msg-${message.kind}${message.pending === true ? ' chat-msg-pending' : ''}${message.failed === true ? ' chat-msg-failed' : ''}`}>
      <span className="chat-msg-text">{message.text}</span>
      {message.toolSummary !== undefined && <div className="chat-tool">{message.toolSummary}</div>}
    </div>
  )
}
