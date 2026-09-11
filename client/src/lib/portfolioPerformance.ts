/**
 * portfolioPerformance.ts
 *
 * Per-holding trailing returns for a portfolio's current positions.
 *
 * The buy-and-hold PERFORMANCE ENGINE that used to live here was removed
 * (Sep 2026). It recomputed portfolio NAV from FMP dividend-adjusted closes,
 * rebalancing at each `portfolio_allocations` snapshot — and it silently
 * contributed exactly 0.00% on every rebalance date, because episode n emitted
 * days `d < b` while episode n+1 rebuilt shares from the same NAV at close(b).
 * At a monthly allocation cadence that zeroed ~12 trading days a year, biasing
 * the portfolio downward against a benchmark row that had no episodes and so no
 * such loss.
 *
 * Rather than fix it, model-portfolio performance now comes from YCharts' own
 * figures on `portfolio.*_total_return`, refreshed by the daily workbook import
 * and rendered by the Total Returns block in `PortfolioOverview`. YCharts is the
 * system of record the advisor already reconciles against, so recomputing it
 * here was duplicating a number we do not own — and owning it meant owning its
 * bugs.
 *
 * What remains is the movers ranking, which is a different question: not "how
 * did the portfolio do" but "which holdings led and lagged". It needs no NAV
 * reconstruction — a ratio of two dividend-adjusted closes per holding is a
 * total return on its own.
 */
import { fetchDailyAdjustedSeries, type DailyPrice } from './fmpMarket'
import { fetchPositionsByPortfolioId } from './positions'

const CASH = '$Cash'

/** Latest adjusted close on or before `date` (walks back over weekends/holidays). */
function priceOnOrBefore(series: DailyPrice[], date: string): number | null {
  let out = null
  for (const row of series) {
    if (row.date <= date) out = row.adjClose
    else break
  }
  return out
}

// ── Trailing-window holding movers (per-position total return) ──────────────

export interface HoldingMover {
  symbol: string
  name: string | null
  /** securities2.id for routing, when the holding is in securities2. */
  numericId: number | null
  /** Trailing-window total return as a decimal (0.0123 = +1.23%). */
  ret: number
}

/** Cash / non-priceable tickers excluded from the movers ranking. */
function isCashLike(ticker: string): boolean {
  const t = ticker.trim().toUpperCase()
  return t === '' || t === CASH.toUpperCase() || t === 'CASH' || t === '$:CASH'
}

/**
 * Per-holding total return over the trailing `days` window for the portfolio's
 * current positions, sorted best→worst. Uses FMP dividend-adjusted closes (a
 * ratio of two points is a total return). Cash and anything FMP can't price are
 * dropped. Each holding is one FMP call; results that fail to price are omitted.
 */
export async function fetchPortfolioMovers(
  portfolioName: string,
  days = 30,
): Promise<HoldingMover[]> {
  const positions = await fetchPositionsByPortfolioId(portfolioName)
  const holdings = positions.filter((p) => p.ticker && !isCashLike(p.ticker))
  if (holdings.length === 0) return []

  const today = new Date()
  // Buffer the fetch window so a base price exists across weekends/holidays.
  const from = new Date(today); from.setDate(from.getDate() - days - 15)
  const fromStr = from.toISOString().slice(0, 10)
  const base = new Date(today); base.setDate(base.getDate() - days)
  const baseStr = base.toISOString().slice(0, 10)

  const rows = await Promise.all(
    holdings.map(async (p): Promise<HoldingMover | null> => {
      try {
        const series = await fetchDailyAdjustedSeries(p.ticker, fromStr)
        if (series.length === 0) return null
        const latest = series[series.length - 1].adjClose
        const basePrice = priceOnOrBefore(series, baseStr)
        if (basePrice == null || basePrice === 0) return null
        return { symbol: p.ticker, name: p.name, numericId: p.numericId, ret: latest / basePrice - 1 }
      } catch {
        return null
      }
    }),
  )

  return rows
    .filter((r): r is HoldingMover => r !== null)
    .sort((a, b) => b.ret - a.ret)
}
