/**
 * useLiveQuote
 *
 * React binding over the quoteStream singleton. Subscribes to live ticks for a
 * symbol while the component is mounted and re-renders only when that symbol's
 * price changes (selective `useSyncExternalStore` subscription).
 *
 * Pair with a REST baseline: components keep their existing `useQuery` for the
 * snapshot (prev close, 52-week range, returns) and overlay the live price from
 * here. When the socket is unconfigured/down, this returns null and the REST
 * value stands in unchanged.
 */
import { useEffect, useSyncExternalStore } from 'react'
import {
  subscribeSymbol,
  subscribeStore,
  getQuote,
  getConnectionState,
  subscribeConnectionState,
  type LiveQuote,
  type ConnectionState,
} from '@/lib/quoteStream'

/** Live quote for a single symbol, or null. Pass null/undefined to subscribe to nothing. */
export function useLiveQuote(symbol: string | null | undefined): LiveQuote | null {
  useEffect(() => {
    if (!symbol) return
    return subscribeSymbol(symbol)
  }, [symbol])

  const quote = useSyncExternalStore(subscribeStore, () =>
    symbol ? getQuote(symbol) : undefined,
  )

  return quote ?? null
}

/** Current websocket connection state, for status indicators. */
export function useQuoteConnectionState(): ConnectionState {
  return useSyncExternalStore(subscribeConnectionState, getConnectionState)
}
