/**
 * useIndexMovers
 *
 * Derives top-N gainers/losers from the index baselines. The baselines query is
 * polled on an interval (see IndexMoversPage), so this is a pure recompute over
 * the latest prices — no WebSocket.
 *
 * Why REST polling, not the live stream: FMP caps WebSocket subscriptions at
 * 100 symbols per API key (and allows only one connection per key), so a 500-
 * symbol board can't stream. Batch REST polling covers every constituent. The
 * low-symbol surfaces (stock detail, at-risk) still use the WebSocket.
 */
import { useMemo } from 'react'
import type { Constituent, Baseline } from '@/lib/fmpIndexMovers'

export interface Mover {
  symbol: string
  name: string | null
  price: number
  prevClose: number
  /** Decimal change, e.g. 0.0123 → +1.23%. */
  changePct: number
}

export interface MoversResult {
  gainers: Mover[]
  losers: Mover[]
  /** Fraction of constituents with a computable % (0..1). */
  coverage: number
}

export function useIndexMovers(
  constituents: Constituent[],
  baselines: Record<string, Baseline>,
  topN = 20,
): MoversResult {
  return useMemo(() => {
    const movers: Mover[] = []
    for (const c of constituents) {
      const base = baselines[c.symbol]
      if (!base) continue
      const changePct = (base.price - base.prevClose) / base.prevClose
      if (!Number.isFinite(changePct)) continue
      movers.push({ symbol: c.symbol, name: c.name, price: base.price, prevClose: base.prevClose, changePct })
    }
    const gainers = movers.filter((m) => m.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct).slice(0, topN)
    const losers = movers.filter((m) => m.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct).slice(0, topN)
    return {
      gainers,
      losers,
      coverage: constituents.length ? movers.length / constituents.length : 0,
    }
  }, [constituents, baselines, topN])
}
