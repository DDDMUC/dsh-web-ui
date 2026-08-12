/**
 * Mobile surface stylesheet, shipped as a string and injected at boot (the
 * standalone page has no CSS-module pipeline).
 */
export const mobileCss = `/* Mobile surface chrome: standalone stylesheet (no main-UI design tokens —
   this page boots without the shell). Deliberately small and flat. */

:root {
  --m-bg: #111418;
  --m-bg-raised: #1a1f26;
  --m-bg-input: #20262e;
  --m-border: #2b333d;
  --m-text: #e8eaed;
  --m-text-secondary: #9aa3ad;
  --m-text-tertiary: #6b747f;
  --m-accent: #4f8cff;
  --m-danger: #e5534b;
  --m-success: #3fb68b;
  --m-radius: 12px;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--m-bg);
  color: var(--m-text);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}

#root,
.mobile {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* ── header ─────────────────────────────────────────────────────────── */

.mobile-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 10px;
  background: color-mix(in srgb, var(--m-bg) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--m-border);
}

.mobile-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.mobile-titleInline {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-back {
  flex: none;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--m-text);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.mobile-back:active {
  background: var(--m-bg-raised);
}

/* ── lists ───────────────────────────────────────────────────────────── */

.mobile-list {
  list-style: none;
  margin: 0;
  padding: 8px 0 calc(env(safe-area-inset-bottom, 0px) + 16px);
}

.mobile-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: var(--m-text);
  text-align: left;
  cursor: pointer;
}

.mobile-row:active {
  background: var(--m-bg-raised);
}

.mobile-rowMain {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.mobile-rowTitle {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
}

.mobile-rowMeta {
  flex: none;
  color: var(--m-text-tertiary);
  font-size: 12px;
}

.mobile-chevron {
  flex: none;
  color: var(--m-text-tertiary);
  font-size: 18px;
}

.mobile-live {
  margin-left: 6px;
  color: var(--m-success);
  font-size: 10px;
  vertical-align: middle;
}

/* ── empty / error states ────────────────────────────────────────────── */

.mobile-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
}

.mobile-muted {
  margin: 0;
  color: var(--m-text-tertiary);
}

.mobile-error {
  margin: 0;
  color: var(--m-danger);
}

.mobile-pad {
  padding: 8px 16px;
}

/* ── buttons ─────────────────────────────────────────────────────────── */

.mobile-button {
  height: 38px;
  padding: 0 18px;
  border: 1px solid var(--m-border);
  border-radius: 10px;
  background: var(--m-bg-raised);
  color: var(--m-text);
  font-size: 14px;
  cursor: pointer;
}

.mobile-button:disabled {
  opacity: 0.5;
}

.mobile-block {
  display: block;
  width: calc(100% - 32px);
  margin: 4px 16px;
}

/* ── chat ────────────────────────────────────────────────────────────── */

.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px calc(env(safe-area-inset-bottom, 0px) + 12px);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-msg {
  max-width: 88%;
  padding: 10px 12px;
  border-radius: var(--m-radius);
  font-size: 14.5px;
  line-height: 1.55;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}

.chat-msg-user {
  align-self: flex-end;
  background: var(--m-accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-msg-assistant {
  align-self: flex-start;
  background: var(--m-bg-raised);
  border: 1px solid var(--m-border);
  border-bottom-left-radius: 4px;
}

.chat-msg-pending .chat-msg-text::after {
  content: '▍';
  animation: chat-blink 1s steps(2) infinite;
}

@keyframes chat-blink {
  50% {
    opacity: 0;
  }
}

.chat-msg-failed {
  border-color: var(--m-danger);
}

.chat-tool {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--m-border);
  color: var(--m-text-secondary);
  font-size: 12px;
}

.chat-meta {
  margin-top: 4px;
  color: var(--m-text-tertiary);
  font-size: 11px;
}

.chat-typing {
  color: var(--m-text-tertiary);
  font-size: 13px;
  padding: 4px 2px;
}

.chat-inputbar {
  display: flex;
  gap: 8px;
  padding: 10px 12px calc(env(safe-area-inset-bottom, 0px) + 10px);
  border-top: 1px solid var(--m-border);
  background: var(--m-bg);
}

.chat-input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  max-height: 120px;
  padding: 9px 12px;
  border: 1px solid var(--m-border);
  border-radius: 10px;
  background: var(--m-bg-input);
  color: var(--m-text);
  font: inherit;
  font-size: 14.5px;
  resize: none;
  outline: none;
}

.chat-input:focus {
  border-color: var(--m-accent);
}

.chat-send {
  flex: none;
  align-self: flex-end;
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: var(--m-accent);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.chat-send:disabled {
  opacity: 0.5;
}

.chat-load-older {
  align-self: center;
  margin: 4px 0;
  border: none;
  background: transparent;
  color: var(--m-text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 6px 10px;
}
`
