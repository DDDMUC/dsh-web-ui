/** Turnstile token relay hosted on the market origin. */

const MARKET_ORIGIN = 'https://dsh-market.com'
const CHALLENGE_URL = MARKET_ORIGIN + '/api/turnstile/challenge'
const TIMEOUT_MS = 10_000

let frame: HTMLIFrameElement | null = null
let ready: Promise<HTMLIFrameElement> | null = null
let chain: Promise<void> = Promise.resolve()

function challengeFrame(): Promise<HTMLIFrameElement> {
  if (ready !== null) return ready
  ready = new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.src = CHALLENGE_URL
    iframe.hidden = true
    iframe.title = 'Market verification'
    iframe.setAttribute('aria-hidden', 'true')
    iframe.onload = () => { frame = iframe; resolve(iframe) }
    iframe.onerror = () => {
      iframe.remove()
      frame = null
      ready = null
      reject(new Error('turnstile-frame-failed'))
    }
    document.body.append(iframe)
  })
  return ready
}

async function requestOne(): Promise<string> {
  const iframe = await challengeFrame()
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('turnstile-timeout')), TIMEOUT_MS)
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { source?: unknown; type?: unknown; id?: unknown; token?: unknown } | null
      if (event.origin !== MARKET_ORIGIN || event.source !== iframe.contentWindow) return
      if (data?.source !== 'dsh-market-card' || data.type !== 'token' || data.id !== id) return
      finish(null, typeof data.token === 'string' ? data.token : '')
    }
    const finish = (error: Error | null, token = ''): void => {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if (error !== null) {
        iframe.remove()
        frame = null
        ready = null
        reject(error)
      } else {
        resolve(token)
      }
    }
    window.addEventListener('message', onMessage)
    iframe.contentWindow?.postMessage({ source: 'dsh-market-card', type: 'request', id }, MARKET_ORIGIN)
  })
}

/** Serialize challenges because one invisible widget can execute only once at a time. */
export function marketTurnstileToken(): Promise<string> {
  const request = chain.then(requestOne)
  chain = request.then(() => undefined, () => undefined)
  return request
}

/** Test-only lifecycle reset; production keeps one hidden frame per page. */
export function resetMarketTurnstile(): void {
  frame?.remove()
  frame = null
  ready = null
  chain = Promise.resolve()
}
