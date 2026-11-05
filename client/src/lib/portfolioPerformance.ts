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
import { fetchStoredSecurityReturns, type StoredSecurityReturns } from './securities'
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
  /**
   * Where `ret` came from. `ycharts` is the figure the workbook loaded onto
   * `securities2`; `fmp` is a ratio of two dividend-adjusted closes.
   */
  source: ReturnSource
}

/**
 * Who owns a holding's return.
 *
 * For a fund or ETF it is YCharts, which publishes the fund's own total return
 * and is the system of record the advisor reconciles against. For a single
 * stock there is no such published figure to read, so it is computed from FMP
 * dividend-adjusted closes.
 */
export type ReturnSource = 'ycharts' | 'fmp'

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
  /**
   * The weight that produced no contribution, so the book reconciles to 100%.
   *
   * Without this the block silently described a minority of some portfolios:
   * Hybrid Conservative holds 13 positions totalling 100%, of which FMP prices
   * six — the other 57%, including the LARGEST holding at 21%, simply vanished
   * from the ranking with nothing on screen saying so. A contribution column
   * that cannot be reconciled is worse than one that admits what it omits.
   *
   * Cash is separated from unpriced holdings because the two are not the same
   * claim: cash genuinely contributed nothing, while an unpriced fund
   * contributed something nobody here can measure.
   */
  cashWeight: number
  /**
   * Holdings that produced no contribution, each saying WHY.
   *
   * The two reasons are different problems with different owners: a missing
   * YCharts figure means the workbook did not carry one for that window, while
   * a missing FMP series means the price feed does not cover the symbol. Naming
   * them apart is what makes the gap actionable rather than just visible.
   */
  unpriced: { symbol: string; weight: number; reason: UnpricedReason }[]
  /**
   * Which feed the returns came from, for the caller to name on screen. Null
   * when nothing priced. `mixed` cannot occur on today's books — every
   * portfolio is all-stock or all-fund — but a mixed book would compare a
   * YCharts calendar-month figure against a rolling 30-day one, so the caller
   * must be able to say so rather than quietly rank them together.
   */
  returnSource: ReturnSource | 'mixed' | null
  /** As-of for the YCharts figures (newest import stamp read); null if unused. */
  returnsAsOf: string | null
}

export type UnpricedReason = 'no_ycharts_figure' | 'no_price_series'

/**
 * An attribution window, named rather than counted in days.
 *
 * **YTD is calendar-anchored, so a day count cannot express it.** It is 309
 * days on 5 November and 5 days on 5 January, and the YCharts column behind it
 * is a calendar figure, not a rolling one — keying the lookup on `days` would
 * have meant inventing a number that is wrong on every date but one, and
 * silently mapping a fund's calendar YTD onto a rolling 309-day request. The
 * window is therefore its own type, and each leg of the fetch (the stored
 * column for funds, the price series for stocks) resolves it in its own terms.
 */
export type AttributionWindow = '1m' | '3m' | 'ytd' | '1y'

export const ATTRIBUTION_WINDOW_LABELS: Record<AttributionWindow, string> = {
  '1m': '1 Month',
  '3m': '3 Month',
  ytd: 'Year to Date',
  '1y': '1 Year',
}

/**
 * The YCharts column carrying a fund's own total return over a window.
 *
 * Every window the attribution block can show is mapped. An unmapped one would
 * return null, which makes the fund unpriced rather than quietly measured over
 * some other period — the same refusal as a missing figure.
 *
 * **Exported so the mapping itself is tested.** It is the one place a window
 * could silently read the wrong column, and the failure is invisible on screen:
 * YTD pointed at the three-month figure renders two identical rankings under
 * two different headings, which reads as a coincidence rather than a bug.
 */
export function storedReturnFor(
  stored: StoredSecurityReturns,
  window: AttributionWindow,
): number | null {
  switch (window) {
    case '1m': return stored.oneMonth
    case '3m': return stored.threeMonth
    case 'ytd': return stored.ytd
    case '1y': return stored.oneYear
  }
}

/**
 * The first day of an attribution window, for the price-series leg.
 *
 * Stocks have no published figure to read, so their return is computed from
 * dividend-adjusted closes between this day and today. **YTD anchors on
 * 1 January of the current year** — the same definition the YCharts column
 * uses, so a book holding both is measured consistently; the other three step
 * back a fixed span.
 *
 * Exported and pure because the two definitions of YTD agreeing is the whole
 * reason a mixed book can be ranked at all.
 */
export function attributionWindowStart(window: AttributionWindow, today: Date): Date {
  const d = new Date(today)
  switch (window) {
    case '1m': d.setDate(d.getDate() - 30); return d
    case '3m': d.setDate(d.getDate() - 90); return d
    case '1y': d.setFullYear(d.getFullYear() - 1); return d
    case 'ytd': return new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  }
}

/**
 * Per-holding total return over one attribution `window` for the portfolio's
 * holdings, sorted best→worst by contribution.
 *
 * **A fund's or ETF's return is READ from YCharts, not recomputed.** The
 * workbook's `Securities` sheet is the system of record for fund returns, so
 * this reads the matching `securities2.*_total_return_nav` column for anything
 * the classifier calls a fund or ETF, and falls to FMP dividend-adjusted closes
 * only for single stocks, which have no published figure to read.
 *
 * That split is not a preference, it is a coverage fact: FMP prices none of the
 * institutional mutual-fund share classes these books hold. Pricing every
 * holding from FMP left Hybrid Conservative ranking 42% of itself, its largest
 * holding among the 57% that vanished — while YCharts carried a figure for all
 * thirteen the whole time.
 *
 * A fund with no YCharts figure is reported unpriced rather than quietly
 * falling back to FMP: the two feeds measure different windows (a calendar
 * month against a rolling thirty days), so substituting one into a list built
 * from the other would rank them against each other as if they agreed.
 */
export async function fetchPortfolioMovers(
  portfolioName: string,
  window: AttributionWindow = '1m',
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
  const cashWeight = [...weights.entries()]
    .filter(([t]) => isCashTicker(t))
    .reduce((sum, pct) => sum + pct[1] / 100, 0)
  const holdings = [...weights.entries()].filter(([t]) => !isCashTicker(t))
  const empty: PortfolioMovers = {
    basis, asOf, rows: [], cashWeight, unpriced: [], returnSource: null, returnsAsOf: null,
  }
  if (holdings.length === 0) return empty

  // One lookup for the whole book — the classifier columns and the YCharts
  // returns come from the same row, so asking per holding would be 13 queries
  // for one answer. Keyed on the weights, not on positions, so a ticker that
  // appears only in the uploaded file is still resolved.
  const stored = await fetchStoredSecurityReturns(holdings.map(([symbol]) => symbol))
  let returnsAsOf: string | null = null

  const today = new Date()
  const base = attributionWindowStart(window, today)
  const baseStr = base.toISOString().slice(0, 10)
  // Buffer the fetch window so a base price exists across weekends/holidays —
  // 1 January is never a trading day, so YTD depends on this.
  const from = new Date(base); from.setDate(from.getDate() - 15)
  const fromStr = from.toISOString().slice(0, 10)

  // A holding that cannot be priced keeps its WEIGHT here rather than being
  // dropped, so the caller can account for it instead of losing it.
  type Unpriced = { symbol: string; weight: number; reason: UnpricedReason }
  const settled = await Promise.all(
    holdings.map(async ([symbol, pct]): Promise<HoldingMover | Unpriced> => {
      const weight = pct / 100
      const p = meta.get(symbol)
      const sec = stored.get(symbol)
      const row = (ret: number, source: ReturnSource): HoldingMover => ({
        symbol,
        name: sec?.name ?? p?.name ?? null,
        numericId: sec?.numericId ?? p?.numericId ?? null,
        ret,
        weight,
        contribution: weight * ret,
        source,
      })

      // Funds and ETFs: YCharts owns the figure. No fallback to the price feed,
      // deliberately — see the note above this function.
      if (sec?.isFund) {
        const ret = storedReturnFor(sec, window)
        if (ret == null) return { symbol, weight, reason: 'no_ycharts_figure' }
        if (sec.updatedAt && (returnsAsOf == null || sec.updatedAt > returnsAsOf)) {
          returnsAsOf = sec.updatedAt
        }
        return row(ret, 'ycharts')
      }

      // Stocks, and any symbol with no securities2 row to classify: compute it.
      try {
        const series = await fetchDailyAdjustedSeries(symbol, fromStr)
        if (series.length === 0) return { symbol, weight, reason: 'no_price_series' }
        const latest = series[series.length - 1].adjClose
        const basePrice = priceOnOrBefore(series, baseStr)
        if (basePrice == null || basePrice === 0) return { symbol, weight, reason: 'no_price_series' }
        return row(latest / basePrice - 1, 'fmp')
      } catch {
        return { symbol, weight, reason: 'no_price_series' }
      }
    }),
  )

  const isPriced = (r: HoldingMover | Unpriced): r is HoldingMover => 'contribution' in r

  const rows = settled.filter(isPriced).sort((a, b) => b.contribution - a.contribution)
  const kinds = new Set(rows.map((r) => r.source))

  return {
    basis,
    asOf,
    rows,
    cashWeight,
    unpriced: settled
      .filter((r): r is Unpriced => !isPriced(r))
      .sort((a, b) => b.weight - a.weight),
    returnSource: kinds.size === 0 ? null : kinds.size > 1 ? 'mixed' : [...kinds][0],
    returnsAsOf: kinds.has('ycharts') ? returnsAsOf : null,
  }
}
