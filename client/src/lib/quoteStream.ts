/**
 * quoteStream.ts
 *
 * Singleton FMP real-time quote WebSocket client. Pure TypeScript — no React.
 *
 * Why this exists: the rest of the app reads FMP over REST through TanStack
 * Query (pull/cache). Live ticks are push-based and high-frequency, which fights
 * Query's cache model, so live prices live here instead — in a tiny external
 * store read via `useSyncExternalStore` (see hooks/useLiveQuote.ts). TanStack
 * keeps owning all snapshot/baseline data (prev close, returns, constituents);
 * this module owns only the live "last price" leg. Components merge the two.
 *
 * Design:
 *   - ONE connection for the whole app, opened lazily on the first subscription
 *     and closed when the last subscriber leaves (bandwidth discipline).
 *   - Ref-counted symbol subscriptions: a symbol shown in two places opens one
 *     upstream subscription.
 *   - Ticks are coalesced into a short flush window so a burst of trades causes
 *     at most one store update / render pass.
 *   - Reconnect with exponential backoff; the symbol registry is replayed on
 *     every (re)connect.
 *   - The socket is dropped while the tab is hidden and reopened on return.
 *
 * Live data is never persisted — consistent with the "FMP derived data is not
 * stored in Supabase" convention.
 *
 * Protocol (FMP stocks websocket):
 *   login:       { event: 'login',       data: { apiKey } }
 *   subscribe:   { event: 'subscribe',   data: { ticker: ['aapl', ...] } }
 *   unsubscribe: { event: 'unsubscribe', data: { ticker: ['aapl', ...] } }
 *   tick:        { s: 'aapl', t: <ms>, type: 'T'|'Q'|'B', lp: <last price>, ... }
 */

export interface LiveQuote {
  /** Uppercased ticker, matching securities2.security_id. */
  symbol: string
  /** Last traded price. */
  price: number
  /** Exchange timestamp (ms), or 0 if absent. */
  timestamp: number
}

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting'

const DEFAULT_WS_URL = 'wss://websockets.financialmodelingprep.com'
/** Coalescing window: a burst of ticks flushes to the store at most this often. */
const FLUSH_MS = 200
const MAX_BACKOFF_MS = 30_000

function wsUrl(): string {
  return (import.meta.env.VITE_FMP_WS_URL as string | undefined) ?? DEFAULT_WS_URL
}

function apiKey(): string | null {
  return (import.meta.env.VITE_FMP_API_KEY as string | undefined) ?? null
}

// ── Module state ────────────────────────────────────────────────────────────

let ws: WebSocket | null = null
let connState: ConnectionState = 'idle'
/**
 * FMP permits only ONE live websocket per API key — a newer connection (another
 * tab/instance) kicks this one with a 401 "Connected from another location". When
 * that happens we set this flag and stop auto-reconnecting, so two tabs don't war
 * over the single slot. The active (foreground) tab reclaims on visibility.
 */
let superseded = false
/**
 * FMP processes messages in order and rejects a `subscribe` that arrives before
 * the `login` is acknowledged (401 "Unauthorized"). So we hold subscriptions
 * until the `login: 200` ack lands, then flush the whole registry.
 */
let authenticated = false

/** symbol (UPPER) → number of active subscribers. */
const refCounts = new Map<string, number>()
/** symbol (UPPER) → latest quote. Object identity is stable until replaced on flush. */
const quotes = new Map<string, LiveQuote>()
/** Ticks buffered between flushes. */
const pendingTicks = new Map<string, LiveQuote>()

const storeListeners = new Set<() => void>()
const stateListeners = new Set<() => void>()

let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null

// ── Store notification ──────────────────────────────────────────────────────

function notifyStore(): void {
  storeListeners.forEach((l) => l())
}

function setConnState(next: ConnectionState): void {
  if (next === connState) return
  connState = next
  stateListeners.forEach((l) => l())
}

// ── Tick coalescing ─────────────────────────────────────────────────────────

function scheduleFlush(): void {
  if (flushTimer != null) return
  flushTimer = setTimeout(flush, FLUSH_MS)
}

function flush(): void {
  flushTimer = null
  if (pendingTicks.size === 0) return
  pendingTicks.forEach((q, sym) => quotes.set(sym, q))
  pendingTicks.clear()
  notifyStore()
}

// ── Socket lifecycle ────────────────────────────────────────────────────────

function send(payload: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

function sendSubscribe(symbols: string[]): void {
  if (symbols.length === 0) return
  send({ event: 'subscribe', data: { ticker: symbols.map((s) => s.toLowerCase()) } })
}

function sendUnsubscribe(symbols: string[]): void {
  if (symbols.length === 0) return
  send({ event: 'unsubscribe', data: { ticker: symbols.map((s) => s.toLowerCase()) } })
}

function handleMessage(raw: unknown): void {
  if (raw == null || typeof raw !== 'object') return
  const msg = raw as Record<string, unknown>

  // Control frames carry an `event` (login/subscribe acks), not a symbol.
  if (typeof msg.event === 'string') {
    if (msg.event === 'login') {
      if (msg.status === 200) {
        // Authenticated — now safe to (re)subscribe the full registry.
        authenticated = true
        superseded = false
        reconnectAttempts = 0
        sendSubscribe([...refCounts.keys()])
      } else {
        // A login 401 means a newer connection took the single per-key slot;
        // mark superseded so onclose won't reconnect into a tug-of-war.
        superseded = true
      }
    }
    // subscribe/unsubscribe acks need no handling.
    return
  }

  // Tick messages carry a symbol in `s`. Both trade ('T') and quote ('Q') frames
  // include `lp` (last price), which is what we display.
  const sym = typeof msg.s === 'string' ? msg.s.toUpperCase() : null
  if (!sym) return
  const lp = typeof msg.lp === 'number' ? msg.lp : Number(msg.lp)
  if (!Number.isFinite(lp) || lp <= 0) return
  // Only stream symbols we still care about (a late tick after unsubscribe).
  if (!refCounts.has(sym)) return
  pendingTicks.set(sym, {
    symbol: sym,
    price: lp,
    // FMP sends the trade time as epoch nanoseconds; normalise to ms.
    timestamp: typeof msg.t === 'number' ? Math.floor(msg.t / 1e6) : 0,
  })
  scheduleFlush()
}

function connect(): void {
  if (ws != null) return
  const key = apiKey()
  if (!key) return // no key configured → stay idle, components fall back to REST
  if (typeof WebSocket === 'undefined') return

  setConnState(reconnectAttempts > 0 ? 'reconnecting' : 'connecting')

  let socket: WebSocket
  try {
    socket = new WebSocket(wsUrl())
  } catch {
    scheduleReconnect()
    return
  }
  ws = socket

  socket.onopen = () => {
    setConnState('open')
    authenticated = false
    // Authenticate first; the registry is flushed on the login:200 ack so the
    // subscribe never races ahead of auth (see handleMessage).
    send({ event: 'login', data: { apiKey: key } })
  }

  socket.onmessage = (ev) => {
    try {
      handleMessage(JSON.parse(ev.data as string))
    } catch {
      /* ignore malformed frames */
    }
  }

  socket.onerror = () => {
    socket.close()
  }

  socket.onclose = () => {
    if (ws === socket) ws = null
    authenticated = false
    // Reconnect only if work remains, the tab is visible, and we weren't
    // superseded by another connection (which would restart the tug-of-war).
    if (refCounts.size > 0 && !isHidden() && !superseded) {
      scheduleReconnect()
    } else {
      setConnState('idle')
    }
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer != null) return
  setConnState('reconnecting')
  const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** reconnectAttempts)
  reconnectAttempts += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function disconnect(): void {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  authenticated = false
  if (ws != null) {
    const socket = ws
    ws = null
    socket.onclose = null // suppress reconnect from our own teardown
    socket.onerror = null
    try {
      socket.close()
    } catch {
      /* already closing */
    }
  }
  setConnState('idle')
}

// ── Tab visibility ──────────────────────────────────────────────────────────

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (isHidden()) {
      // Drop the socket while backgrounded; keep refCounts so we can replay.
      disconnect()
    } else if (refCounts.size > 0) {
      // The active tab reclaims the single connection slot.
      superseded = false
      reconnectAttempts = 0
      connect()
    }
  })
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Subscribe to live ticks for `symbol`. Returns an unsubscribe function.
 * Opens the shared connection on the first subscriber and closes it when the
 * last one leaves.
 */
export function subscribeSymbol(symbol: string): () => void {
  const sym = symbol.toUpperCase()
  const count = refCounts.get(sym) ?? 0
  refCounts.set(sym, count + 1)

  if (count === 0) {
    if (ws == null) {
      connect()
    } else if (authenticated) {
      sendSubscribe([sym])
    }
    // else: connecting/authenticating — flushed on the login:200 ack.
  }

  return () => {
    const c = refCounts.get(sym) ?? 0
    if (c <= 1) {
      refCounts.delete(sym)
      quotes.delete(sym)
      pendingTicks.delete(sym)
      sendUnsubscribe([sym])
      if (refCounts.size === 0) disconnect()
    } else {
      refCounts.set(sym, c - 1)
    }
  }
}

/** Latest live quote for `symbol`, or undefined. Reference is stable until the next tick. */
export function getQuote(symbol: string): LiveQuote | undefined {
  return quotes.get(symbol.toUpperCase())
}

/** Register a listener fired on any store change. For useSyncExternalStore. */
export function subscribeStore(listener: () => void): () => void {
  storeListeners.add(listener)
  return () => storeListeners.delete(listener)
}

/** Current connection state. */
export function getConnectionState(): ConnectionState {
  return connState
}

/** Register a listener fired on connection-state change. */
export function subscribeConnectionState(listener: () => void): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}
