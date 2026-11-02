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
import { fetchLatestActualAllocation } from './currentAllocation'
import { isCashTicker } from './positionBands'


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
  /** Portfolio weight as a decimal (0.34 = 34%), on whichever basis was used. */
  weight: number
  /**
   * `weight × ret` — the holding's share of the portfolio's move, as a decimal.
   *
   * This, not `ret`, is what the ranking is for. A 5% sleeve down 3.51% costs
   * the book 0.18pp while a 22% sleeve down 1.80% costs 0.40pp, so ranking by
   * return alone puts the smaller problem at the bottom of the list and files
   * the real drag in the middle.
   */
  contribution: number
}

export interface PortfolioMovers {
  /**
   * Which weights the contributions were computed from.
   *
   * `actual` is the allocation file uploaded to `Portfolio Documents` — the one
   * the review's position-sizing step saves. `targets` is
   * `positions.allocation_pct`, used when no file exists. The caller shows
   * which, because a contribution measured against targets describes a book
   * nobody necessarily holds.
   */
  basis: 'actual' | 'targets'
  /** Upload timestamp of the actual-allocation file; null on the targets basis. */
  asOf: string | null
  rows: HoldingMover[]
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
): Promise<PortfolioMovers> {
  const positions = await fetchPositionsByPortfolioId(portfolioName)
  // Keyed UPPER because the uploaded file and the positions table do not agree
  // on case, and the file is the side without a securities2 join.
  const meta = new Map(
    positions.filter((p) => p.ticker).map((p) => [p.ticker.trim().toUpperCase(), p]),
  )

  // Prefer the book actually held over the book intended. A file that fails to
  // load must not take the block out — fall back and say so.
  let basis: PortfolioMovers['basis'] = 'targets'
  let asOf: string | null = null
  let weights = new Map<string, number>()
  try {
    const actual = await fetchLatestActualAllocation(portfolioName)
    if (actual && actual.weights.size > 0) {
      basis = 'actual'
      asOf = actual.asOf
      weights = actual.weights
    }
  } catch { /* fall through to the stored targets */ }
  if (basis === 'targets') {
    weights = new Map(
      positions
        .filter((p) => p.ticker)
        .map((p) => [p.ticker.trim().toUpperCase(), Number(p.weight) || 0]),
    )
  }

  // Cash carries no return and cannot be priced, so it is not a mover — but its
  // weight is deliberately NOT redistributed: a 1% cash sleeve really did
  // contribute nothing, and renormalising would overstate everything else.
  const holdings = [...weights.entries()].filter(([t]) => !isCashTicker(t))
  if (holdings.length === 0) return { basis, asOf, rows: [] }

  const today = new Date()
  // Buffer the fetch window so a base price exists across weekends/holidays.
  const from = new Date(today); from.setDate(from.getDate() - days - 15)
  const fromStr = from.toISOString().slice(0, 10)
  const base = new Date(today); base.setDate(base.getDate() - days)
  const baseStr = base.toISOString().slice(0, 10)

  const rows = await Promise.all(
    holdings.map(async ([symbol, pct]): Promise<HoldingMover | null> => {
      try {
        const series = await fetchDailyAdjustedSeries(symbol, fromStr)
        if (series.length === 0) return null
        const latest = series[series.length - 1].adjClose
        const basePrice = priceOnOrBefore(series, baseStr)
        if (basePrice == null || basePrice === 0) return null
        const ret = latest / basePrice - 1
        const weight = pct / 100
        const p = meta.get(symbol)
        return {
          symbol,
          name: p?.name ?? null,
          numericId: p?.numericId ?? null,
          ret,
          weight,
          contribution: weight * ret,
        }
      } catch {
        return null
      }
    }),
  )

  return {
    basis,
    asOf,
    rows: rows
      .filter((r): r is HoldingMover => r !== null)
      .sort((a, b) => b.contribution - a.contribution),
  }
}
