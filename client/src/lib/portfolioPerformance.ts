/**
 * portfolioPerformance.ts
 *
 * Portfolio-level performance — **buy-and-hold drift with rebalancing only at
 * the portfolio's own dated allocation snapshots** (`portfolio_allocations`).
 * Nothing else feeds it: no model data, no change log, no benchmarks.
 *
 * Model
 * -----
 * Consecutive snapshot dates are episode boundaries. Within an episode shares are
 * held fixed and weights drift with price; at each snapshot date the book is
 * rebalanced to that snapshot's target weights (NAV preserved across the
 * boundary). The allocation in force at the window start is the latest snapshot
 * dated on or before it.
 *
 * Holdings
 * --------
 * Stocks are priced from FMP dividend-adjusted closes (dividends + splits folded
 * in). Anything FMP can't price — `$Cash`, a money-market fund, etc. — is held
 * **flat** (constant dollars, 0% return) with its weight preserved, so every
 * episode stays 100% invested with no renormalization distortion. Class tickers
 * are mapped to FMP's hyphen form (BRK.B → BRK-B).
 *
 * Total return is gross, time-weighted: no fees, taxes, or trade-cost slippage.
 */
import { fetchAllocationSnapshots } from './portfolioAllocations'
import { fetchDailyAdjustedSeries, type DailyPrice } from './fmpMarket'
import { fetchPositionsByPortfolioId } from './positions'

const CASH = '$Cash'

/** FMP uses hyphens for share-class tickers (BRK.B → BRK-B). */
const fmpSymbol = (s: string) => s.replace(/\./g, '-')

export interface PerfPoint {
  date: string
  /** NAV index, 1.0 at the start date. */
  nav: number
}

export interface PerfEpisode {
  start: string
  end: string
  /** Number of priced stock holdings in this episode. */
  holdings: number
  /** Flat (cash + unpriceable) fraction of the episode allocation (0–1). */
  cashWeight: number
  /** Gross weight sum of the snapshot (percent points; ≈100 when consistent). */
  weightSum: number
}

export interface PortfolioPerformanceResult {
  start: string
  end: string
  series: PerfPoint[]
  totalReturn: number | null
  episodes: PerfEpisode[]
  /** Non-cash holdings held flat because FMP returned no price (e.g. money funds). */
  heldFlat: string[]
  notes: string[]
}

/** adjClose on the most recent trading day on or before `date`; series sorted ASC. */
function priceOnOrBefore(series: DailyPrice[], date: string): number | null {
  let lo = 0, hi = series.length - 1, ans: number | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (series[mid].date <= date) { ans = series[mid].adjClose; lo = mid + 1 }
    else hi = mid - 1
  }
  return ans
}

export async function computePortfolioPerformance(
  portfolioName: string,
  start: string,
  end: string,
): Promise<PortfolioPerformanceResult> {
  const empty = (notes: string[]): PortfolioPerformanceResult => ({
    start, end, series: [], totalReturn: null, episodes: [], heldFlat: [], notes,
  })

  // 1. The portfolio's own dated allocation snapshots (ascending).
  const snaps = await fetchAllocationSnapshots(portfolioName)
  if (snaps.length === 0) return empty(['No allocation snapshots for this portfolio yet.'])

  // 2. Episode boundaries: window start, then every snapshot date in (start, end], then end.
  const innerDates = snaps.map((s) => s.effective_date).filter((d) => d > start && d <= end)
  const rawBounds = [start, ...innerDates, end]
  const boundaries = rawBounds.filter((d, i) => i === 0 || d !== rawBounds[i - 1])

  // Allocation in force at a date = latest snapshot with effective_date ≤ date (else earliest).
  const allocAt = (date: string): Map<string, number> => {
    let chosen = snaps[0]
    for (const s of snaps) { if (s.effective_date <= date) chosen = s; else break }
    return chosen.weights
  }

  // 3. Fetch FMP daily series for every non-cash symbol ever held in the window.
  //    Fetch from ~10 days BEFORE the window so the base price is the close on or
  //    before `start` (e.g. From=Jan 1 anchors on the Dec 31 close), matching the
  //    YTD/period-return convention instead of skipping the first in-window day.
  const fetchFrom = new Date(new Date(start + 'T00:00:00').getTime() - 10 * 86_400_000)
    .toISOString().slice(0, 10)
  const symbols = new Set<string>()
  for (const b of boundaries.slice(0, -1)) for (const [sym, w] of allocAt(b)) if (w > 0 && sym !== CASH) symbols.add(sym)
  const seriesBySym = new Map<string, DailyPrice[]>()
  await Promise.all([...symbols].map(async (sym) => {
    try {
      const s = await fetchDailyAdjustedSeries(fmpSymbol(sym), fetchFrom, end)
      if (s.length > 0) seriesBySym.set(sym, s)
    } catch { /* held flat below */ }
  }))

  // 4. Trading-day axis = union of all priced series' dates within [start, end].
  const dateSet = new Set<string>()
  for (const s of seriesBySym.values()) for (const p of s) if (p.date >= start && p.date <= end) dateSet.add(p.date)
  const axis = [...dateSet].sort()
  if (axis.length === 0) return empty(['No FMP price data returned for any holding in this window.'])

  // 5. Simulate NAV: priced stocks as shares (drift); everything else flat (0%).
  let nav = 1.0
  const series: PerfPoint[] = []
  const episodes: PerfEpisode[] = []
  const heldFlat = new Set<string>()

  for (let ep = 0; ep < boundaries.length - 1; ep++) {
    const a = boundaries[ep]
    const b = boundaries[ep + 1]
    const isLast = ep === boundaries.length - 2
    const alloc = allocAt(a)
    const grossAll = [...alloc.values()].reduce((s, w) => s + w, 0)
    const days = axis.filter((d) => d >= a && (isLast ? d <= b : d < b))

    // Base prices at the episode start `a` — for the first episode that's the
    // close on/before the window start; for rebalances it's the snapshot date.
    let flatWeight = 0
    const shares = new Map<string, number>()
    if (days.length > 0 && grossAll > 0) {
      for (const [sym, w] of alloc) {
        if (w <= 0) continue
        const px = sym === CASH ? null : priceOnOrBefore(seriesBySym.get(sym) ?? [], a)
        if (px != null && px > 0) {
          shares.set(sym, (w / grossAll) * nav / px)
        } else {
          flatWeight += w
          if (sym !== CASH) heldFlat.add(sym)
        }
      }
    }
    const cashValue = grossAll > 0 ? (flatWeight / grossAll) * nav : 0

    for (const d of days) {
      let v = cashValue
      for (const [sym, sh] of shares) {
        const px = priceOnOrBefore(seriesBySym.get(sym)!, d)
        if (px != null) v += sh * px
      }
      if (v > 0) { nav = v; series.push({ date: d, nav: v }) }
    }
    episodes.push({ start: a, end: b, holdings: shares.size, cashWeight: grossAll > 0 ? flatWeight / grossAll : 0, weightSum: grossAll })
  }

  // De-dupe boundary days (keep last write), sort.
  const dedup = new Map<string, number>()
  for (const p of series) dedup.set(p.date, p.nav)
  const finalSeries = [...dedup.entries()].map(([date, navv]) => ({ date, nav: navv }))
  finalSeries.sort((a, b) => (a.date < b.date ? -1 : 1))
  const totalReturn = finalSeries.length > 0 ? finalSeries[finalSeries.length - 1].nav - 1 : null

  const notes: string[] = []
  if (heldFlat.size > 0) notes.push(`Held flat as cash-equivalent (no FMP price): ${[...heldFlat].join(', ')}.`)
  const badSum = episodes.find((e) => Math.abs(e.weightSum - 100) > 0.5)
  if (badSum) notes.push(`A snapshot's weights sum to ${badSum.weightSum.toFixed(1)}% (expected 100%).`)

  return { start, end, series: finalSeries, totalReturn, episodes, heldFlat: [...heldFlat], notes }
}

// ── Standard-period returns ────────────────────────────────────────────────────

export interface PeriodReturns {
  inception: string | null
  /** Last date in the computed series (the "as of" date). */
  asOf: string | null
  oneDay: number | null
  fiveDay: number | null
  oneMonth: number | null
  threeMonth: number | null
  ytd: number | null
  oneYear: number | null
  /** 3Y/5Y/10Y and All Time are annualized; the rest are cumulative. */
  threeYear: number | null
  fiveYear: number | null
  tenYear: number | null
  allTime: number | null
  heldFlat: string[]
  notes: string[]
}

/**
 * All standard-period returns from a single inception→today NAV series.
 * Periods ≤ 1 year are cumulative; 3Y/5Y/10Y and All Time are annualized.
 * Periods extending before inception return null ("—").
 */
export async function computePortfolioPeriodReturns(portfolioName: string): Promise<PeriodReturns> {
  const blank: PeriodReturns = {
    inception: null, asOf: null, oneDay: null, fiveDay: null, oneMonth: null, threeMonth: null,
    ytd: null, oneYear: null, threeYear: null, fiveYear: null, tenYear: null, allTime: null,
    heldFlat: [], notes: [],
  }
  const snaps = await fetchAllocationSnapshots(portfolioName)
  if (snaps.length === 0) return { ...blank, notes: ['No allocation snapshots for this portfolio yet.'] }

  const inception = snaps[0].effective_date
  const today = new Date().toISOString().slice(0, 10)
  const full = await computePortfolioPerformance(portfolioName, inception, today)
  const s = full.series
  if (s.length < 2) return { ...blank, inception, heldFlat: full.heldFlat, notes: full.notes }

  const navLast = s[s.length - 1].nav
  const lastDate = s[s.length - 1].date
  const navOnOrBefore = (date: string): number | null => {
    let ans: number | null = null
    for (const p of s) { if (p.date <= date) ans = p.nav; else break }
    return ans
  }
  // Cumulative return from a base date to the latest point.
  const cum = (baseDate: string): number | null => {
    const bn = navOnOrBefore(baseDate)
    return bn != null && bn > 0 ? navLast / bn - 1 : null
  }
  // Annualized (CAGR) over `years`, null if the base predates inception.
  const ann = (baseDate: string, years: number): number | null => {
    if (baseDate < inception) return null
    const bn = navOnOrBefore(baseDate)
    return bn != null && bn > 0 ? Math.pow(navLast / bn, 1 / years) - 1 : null
  }
  const shift = (months: number, years = 0): string => {
    const d = new Date(lastDate + 'T00:00:00')
    d.setFullYear(d.getFullYear() - years)
    d.setMonth(d.getMonth() - months)
    return d.toISOString().slice(0, 10)
  }

  const ytdBase = `${Number(lastDate.slice(0, 4)) - 1}-12-31`
  const oneYearBase = shift(0, 1)
  const days = (new Date(lastDate + 'T00:00:00').getTime() - new Date(inception + 'T00:00:00').getTime()) / 86_400_000

  return {
    inception,
    asOf: lastDate,
    oneDay: s.length >= 2 ? navLast / s[s.length - 2].nav - 1 : null,
    fiveDay: s.length >= 6 ? navLast / s[s.length - 6].nav - 1 : null,
    oneMonth: cum(shift(1)),
    threeMonth: cum(shift(3)),
    // YTD from Dec 31 prior year; if the portfolio started this year, since inception.
    ytd: ytdBase < inception ? navLast - 1 : cum(ytdBase),
    oneYear: oneYearBase < inception ? null : cum(oneYearBase),
    threeYear: ann(shift(0, 3), 3),
    fiveYear: ann(shift(0, 5), 5),
    tenYear: ann(shift(0, 10), 10),
    allTime: days > 0 ? Math.pow(navLast, 365.25 / days) - 1 : null,
    heldFlat: full.heldFlat,
    notes: full.notes,
  }
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
