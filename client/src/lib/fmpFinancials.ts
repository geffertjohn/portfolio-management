export interface DailyPrice {
  date: string
  close: number
}

export interface MergedQuarter {
  periodEnd: string
  fiscalPeriod: string
  reportDate: string | null
  actualRevenue: number | null
  actualEbitda: number | null
  actualEbit: number | null
  actualNetIncome: number | null
  actualEps: number | null
  actualSga: number | null
  estRevenueLow: number | null
  estRevenueHigh: number | null
  estRevenueAvg: number | null
  estEbitdaLow: number | null
  estEbitdaHigh: number | null
  estEbitdaAvg: number | null
  estEbitLow: number | null
  estEbitHigh: number | null
  estEbitAvg: number | null
  estNetIncomeLow: number | null
  estNetIncomeHigh: number | null
  estNetIncomeAvg: number | null
  estEpsLow: number | null
  estEpsHigh: number | null
  estEpsAvg: number | null
  estSgaLow: number | null
  estSgaHigh: number | null
  estSgaAvg: number | null
  analystCountRevenue: number | null
  analystCountEps: number | null
  priceReactionPct: number | null
}

export interface FinancialsData {
  prices: DailyPrice[]
  quarters: MergedQuarter[]
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Derives "Q1 2025" from a date string when the API doesn't supply period/calendarYear.
// Uses calendar quarters (Mar=Q1, Jun=Q2, Sep=Q3, Dec=Q4 ± a few days slop).
function deriveFiscalPeriodFromDate(date: string): string {
  const dt = new Date(date + 'T00:00:00')
  const year = dt.getFullYear()
  const month = dt.getMonth() + 1
  const q = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4'
  return `${q} ${year}`
}

// Advance a fiscal period label forward by n periods.
// Handles both "Q2 2026" (quarterly) and "FY 2025" (annual).
function advanceFiscalPeriod(fiscalPeriod: string, n: number): string {
  const fyMatch = fiscalPeriod.match(/^FY\s+(\d{4})$/)
  if (fyMatch) return `FY ${parseInt(fyMatch[1], 10) + n}`
  const qMatch = fiscalPeriod.match(/^Q([1-4])\s+(\d{4})$/)
  if (!qMatch) return fiscalPeriod
  let q = parseInt(qMatch[1], 10)
  let year = parseInt(qMatch[2], 10)
  for (let i = 0; i < n; i++) {
    q++
    if (q > 4) { q = 1; year++ }
  }
  return `Q${q} ${year}`
}

interface IncomeRow {
  date: string
  calendarYear: unknown
  period: unknown
  revenue: unknown
  ebitda: unknown
  operatingIncome: unknown
  netIncome: unknown
  epsdiluted: unknown
  sellingGeneralAndAdministrativeExpenses: unknown
}

// Stable /analyst-estimates endpoint field names
interface EstimateRow {
  date: string
  revenueLow: unknown
  revenueHigh: unknown
  revenueAvg: unknown
  ebitdaLow: unknown
  ebitdaHigh: unknown
  ebitdaAvg: unknown
  ebitLow: unknown
  ebitHigh: unknown
  ebitAvg: unknown
  netIncomeLow: unknown
  netIncomeHigh: unknown
  netIncomeAvg: unknown
  sgaExpenseLow: unknown
  sgaExpenseHigh: unknown
  sgaExpenseAvg: unknown
  epsLow: unknown
  epsHigh: unknown
  epsAvg: unknown
  numAnalystsRevenue: unknown
  numAnalystsEps: unknown
}

interface EarningsRow {
  date: string              // announcement date
  fiscalDateEnding?: string // present on stable/earnings; may be absent on other endpoints
  revenueActual?: unknown   // what Wall Street tracks — matches estimate definitions
  epsActual?: unknown       // same basis as epsEstimated in analyst estimates
}

// Handles both a plain array and the { historical: [...] } wrapper FMP uses on some v3 endpoints.
function extractArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && 'historical' in raw) {
    const h = (raw as { historical: unknown }).historical
    if (Array.isArray(h)) return h
  }
  return []
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json() as Promise<unknown>
}

/**
 * Find the nearest price index (oldest→newest sorted) at or after targetDate.
 * Falls back to scanning ±3 days if no price on/after targetDate exists.
 */
function findNearestPriceIndex(prices: DailyPrice[], targetDate: string): number {
  // Forward scan: first price on or after targetDate
  for (let i = 0; i < prices.length; i++) {
    if (prices[i].date >= targetDate) return i
  }
  // No price on or after — scan backwards up to 3 days
  const targetMs = new Date(targetDate + 'T00:00:00').getTime()
  for (let delta = 1; delta <= 3; delta++) {
    const earlier = new Date(targetMs - delta * 86400000)
    const earlierStr = toDateStr(earlier)
    for (let i = prices.length - 1; i >= 0; i--) {
      if (prices[i].date === earlierStr) return i
    }
  }
  return -1
}

/**
 * Fuzzy-match an estimate row to an income statement date.
 * FMP uses non-calendar fiscal periods (e.g. Micron ends in Aug) so estimate
 * dates can differ from income statement dates by several days.
 */
function fuzzyMatchEstimate(estimates: EstimateRow[], targetDate: string, maxDeltaDays = 10): EstimateRow | null {
  const targetMs = new Date(targetDate + 'T00:00:00').getTime()
  let best: EstimateRow | null = null
  let bestDiff = (maxDeltaDays + 1) * 86400000

  for (const row of estimates) {
    const rowMs = new Date(row.date + 'T00:00:00').getTime()
    const diff = Math.abs(rowMs - targetMs)
    if (diff < bestDiff) {
      bestDiff = diff
      best = row
    }
  }
  return best
}

/**
 * Two-pass earnings matcher:
 *  Pass 1 — fuzzy match on fiscalDateEnding within ±10 days (when field is present)
 *  Pass 2 — find the announcement that falls 1–90 days AFTER the period end
 *            (handles tickers where fiscalDateEnding is absent or misaligned)
 */
function matchEarnings(earnings: EarningsRow[], periodEnd: string): EarningsRow | null {
  const periodEndMs = new Date(periodEnd + 'T00:00:00').getTime()

  // Pass 1: fiscalDateEnding fuzzy match
  let best: EarningsRow | null = null
  let bestDiff = 11 * 86400000
  for (const row of earnings) {
    if (!row.fiscalDateEnding) continue
    const diff = Math.abs(new Date(row.fiscalDateEnding + 'T00:00:00').getTime() - periodEndMs)
    if (diff < bestDiff) { bestDiff = diff; best = row }
  }
  if (best) return best

  // Pass 2: announcement that comes 1–90 days after period end
  let bestDelay = 91 * 86400000
  for (const row of earnings) {
    const delay = new Date(row.date + 'T00:00:00').getTime() - periodEndMs
    if (delay > 0 && delay < bestDelay) { bestDelay = delay; best = row }
  }
  return best
}

export async function fetchFinancialsData(symbol: string): Promise<FinancialsData> {
  const key = import.meta.env.VITE_FMP_API_KEY as string
  const today = new Date()
  const from = new Date(today)
  from.setFullYear(from.getFullYear() - 5)
  const fromDate = toDateStr(from)

  const stable = 'https://financialmodelingprep.com/stable'
  const v3 = 'https://financialmodelingprep.com/api/v3'

  const [priceResult, incomeResult, estimatesResult, earningsResult] = await Promise.allSettled([
    // Stable EOD prices — confirmed working
    fetchJson(`${stable}/historical-price-eod/full?symbol=${symbol}&from=${fromDate}&apikey=${key}`),
    // v3 income statement — returns calendarYear + period fields reliably
    fetchJson(`${v3}/income-statement/${symbol}?period=quarter&limit=40&apikey=${key}`),
    // Stable analyst estimates — includes numAnalystsRevenue / numAnalystsEps
    fetchJson(`${stable}/analyst-estimates?symbol=${symbol}&period=quarter&limit=40&apikey=${key}`),
    // Stable earnings — plain array with date (announcement) + fiscalDateEnding
    fetchJson(`${stable}/earnings?symbol=${symbol}&limit=40&apikey=${key}`),
  ])

  const rawPriceArr    = priceResult.status    === 'fulfilled' ? extractArray(priceResult.value)    : []
  const rawIncomeArr   = incomeResult.status   === 'fulfilled' ? extractArray(incomeResult.value)   : []
  const rawEstimatesArr = estimatesResult.status === 'fulfilled' ? extractArray(estimatesResult.value) : []
  const rawEarningsArr = earningsResult.status === 'fulfilled' ? extractArray(earningsResult.value) : []

  // Prices: FMP returns newest→oldest; reverse to oldest→newest for chart rendering.
  const prices: DailyPrice[] = rawPriceArr
    .filter((r): r is { date: string; close: number } =>
      r !== null && typeof r === 'object' && 'date' in r && 'close' in r
    )
    .map((r) => ({ date: r.date, close: r.close }))
    .reverse()

  const incomeRows = rawIncomeArr.filter((r): r is IncomeRow =>
    r !== null && typeof r === 'object' && 'date' in r
  )

  const estimateRows = rawEstimatesArr.filter((r): r is EstimateRow =>
    r !== null && typeof r === 'object' && 'date' in r
  )

  const earningsRows = rawEarningsArr.filter((r): r is EarningsRow =>
    r !== null && typeof r === 'object' && 'date' in r
  )

  // Forward-looking quarters: estimate rows whose period end is after the latest income statement date.
  // FMP returns income rows newest-first, so incomeRows[0].date is the most recent reported period.
  const latestIncomeDate = incomeRows.length > 0 ? incomeRows[0].date : null

  // Derive the last reported fiscal period label so we can project forward correctly
  // (e.g. AAPL Q2 2026 → Q3 2026, Q4 2026) rather than using calendar-month mapping.
  const lastReportedFiscalPeriod: string | null = (() => {
    if (!incomeRows.length) return null
    const inc = incomeRows[0]
    const calYear = typeof inc.calendarYear === 'string' ? inc.calendarYear
      : typeof inc.calendarYear === 'number' ? String(inc.calendarYear) : ''
    const periodStr = typeof inc.period === 'string' ? inc.period : ''
    return periodStr && calYear ? `${periodStr} ${calYear}` : deriveFiscalPeriodFromDate(inc.date)
  })()

  // Sort ascending so index 0 = nearest future quarter (+1), index 1 = next (+2).
  const forwardEstimatesAsc = estimateRows
    .filter((e) => latestIncomeDate === null || e.date > latestIncomeDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2)

  const forwardQuarters: MergedQuarter[] = forwardEstimatesAsc
    .map((est, i) => {
    // Use the stable/earnings data (same source as historical quarters) to find
    // the expected announcement date for this future period.
    const earn = matchEarnings(earningsRows, est.date)
    return {
    periodEnd:        est.date,
    fiscalPeriod:     lastReportedFiscalPeriod
      ? advanceFiscalPeriod(lastReportedFiscalPeriod, i + 1)
      : deriveFiscalPeriodFromDate(est.date),
    reportDate:       earn?.date ?? null,
    actualRevenue:    null,
    actualEbitda:     null,
    actualEbit:       null,
    actualNetIncome:  null,
    actualEps:        null,
    actualSga:        null,
    estRevenueLow:    num(est.revenueLow),
    estRevenueHigh:   num(est.revenueHigh),
    estRevenueAvg:    num(est.revenueAvg),
    estEbitdaLow:     num(est.ebitdaLow),
    estEbitdaHigh:    num(est.ebitdaHigh),
    estEbitdaAvg:     num(est.ebitdaAvg),
    estEbitLow:       num(est.ebitLow),
    estEbitHigh:      num(est.ebitHigh),
    estEbitAvg:       num(est.ebitAvg),
    estNetIncomeLow:  num(est.netIncomeLow),
    estNetIncomeHigh: num(est.netIncomeHigh),
    estNetIncomeAvg:  num(est.netIncomeAvg),
    estEpsLow:        num(est.epsLow),
    estEpsHigh:       num(est.epsHigh),
    estEpsAvg:        num(est.epsAvg),
    estSgaLow:        num(est.sgaExpenseLow),
    estSgaHigh:       num(est.sgaExpenseHigh),
    estSgaAvg:        num(est.sgaExpenseAvg),
    analystCountRevenue: num(est.numAnalystsRevenue),
    analystCountEps:     num(est.numAnalystsEps),
    priceReactionPct: null,
  }
  })
  .reverse() // newest of the 2 at top of table

  const quarters: MergedQuarter[] = incomeRows.map((inc) => {
    // Fuzzy-match analyst estimates (handles non-calendar fiscal year companies)
    const est = fuzzyMatchEstimate(estimateRows, inc.date)

    // Match earnings announcement date (two-pass: fiscalDateEnding then date-range)
    const earn = matchEarnings(earningsRows, inc.date)
    const reportDate = earn?.date ?? null

    // 1-day price reaction: close on report day vs close on previous trading day
    let priceReactionPct: number | null = null
    if (reportDate && prices.length > 0) {
      const idx = findNearestPriceIndex(prices, reportDate)
      if (idx > 0) {
        priceReactionPct = (prices[idx].close / prices[idx - 1].close - 1) * 100
      }
    }

    // Fiscal period label: prefer API fields, fall back to calendar-quarter derivation
    const calYear = typeof inc.calendarYear === 'string' ? inc.calendarYear
      : typeof inc.calendarYear === 'number' ? String(inc.calendarYear) : ''
    const periodStr = typeof inc.period === 'string' ? inc.period : ''
    const fiscalPeriod = periodStr && calYear
      ? `${periodStr} ${calYear}`
      : deriveFiscalPeriodFromDate(inc.date)

    return {
      periodEnd: inc.date,
      fiscalPeriod,
      reportDate,
      // Revenue + EPS: prefer earnings report values — same basis analyst estimates use.
      // EBITDA/EBIT/NetIncome/SGA have no earnings-report equivalent so stay on income stmt.
      actualRevenue:    num(earn?.revenueActual) ?? num(inc.revenue),
      actualEbitda:     num(inc.ebitda),
      actualEbit:       num(inc.operatingIncome),
      actualNetIncome:  num(inc.netIncome),
      actualEps:        num(earn?.epsActual) ?? num(inc.epsdiluted),
      actualSga:        num(inc.sellingGeneralAndAdministrativeExpenses),
      estRevenueLow:    est ? num(est.revenueLow)    : null,
      estRevenueHigh:   est ? num(est.revenueHigh)   : null,
      estRevenueAvg:    est ? num(est.revenueAvg)    : null,
      estEbitdaLow:     est ? num(est.ebitdaLow)     : null,
      estEbitdaHigh:    est ? num(est.ebitdaHigh)    : null,
      estEbitdaAvg:     est ? num(est.ebitdaAvg)     : null,
      estEbitLow:       est ? num(est.ebitLow)       : null,
      estEbitHigh:      est ? num(est.ebitHigh)      : null,
      estEbitAvg:       est ? num(est.ebitAvg)       : null,
      estNetIncomeLow:  est ? num(est.netIncomeLow)  : null,
      estNetIncomeHigh: est ? num(est.netIncomeHigh) : null,
      estNetIncomeAvg:  est ? num(est.netIncomeAvg)  : null,
      estEpsLow:        est ? num(est.epsLow)        : null,
      estEpsHigh:       est ? num(est.epsHigh)       : null,
      estEpsAvg:        est ? num(est.epsAvg)        : null,
      estSgaLow:        est ? num(est.sgaExpenseLow)  : null,
      estSgaHigh:       est ? num(est.sgaExpenseHigh) : null,
      estSgaAvg:        est ? num(est.sgaExpenseAvg)  : null,
      analystCountRevenue: est ? num(est.numAnalystsRevenue) : null,
      analystCountEps:     est ? num(est.numAnalystsEps)     : null,
      priceReactionPct,
    }
  })

  return { prices, quarters: [...forwardQuarters, ...quarters] }
}

/**
 * Fetch annual financials: 4 historical fiscal years + 2 forward estimate years.
 * Returns the same MergedQuarter shape so tables can share rendering logic.
 * No price data — annual table only; prices stay on the quarterly chart.
 */
// Stable income-statement annual response uses fiscalYear + epsDiluted (capital D).
interface AnnualIncomeRow {
  date: string
  fiscalYear: unknown   // "2025" — stable endpoint field name
  calendarYear: unknown // v3 fallback
  period: unknown
  revenue: unknown
  ebitda: unknown
  operatingIncome: unknown
  netIncome: unknown
  epsDiluted: unknown   // capital D — stable endpoint field name
  epsdiluted: unknown   // lowercase fallback for v3
  sellingGeneralAndAdministrativeExpenses: unknown
}

export async function fetchAnnualFinancialsData(symbol: string): Promise<MergedQuarter[]> {
  const key    = import.meta.env.VITE_FMP_API_KEY as string
  const stable = 'https://financialmodelingprep.com/stable'

  const [incomeResult, estimatesResult, earningsResult] = await Promise.allSettled([
    // Use stable endpoint — field names match what we map below
    fetchJson(`${stable}/income-statement?symbol=${symbol}&period=annual&limit=4&apikey=${key}`),
    fetchJson(`${stable}/analyst-estimates?symbol=${symbol}&period=annual&limit=10&apikey=${key}`),
    fetchJson(`${stable}/earnings?symbol=${symbol}&limit=20&apikey=${key}`),
  ])

  const rawIncome    = incomeResult.status    === 'fulfilled' ? extractArray(incomeResult.value)    : []
  const rawEstimates = estimatesResult.status === 'fulfilled' ? extractArray(estimatesResult.value) : []
  const rawEarnings  = earningsResult.status  === 'fulfilled' ? extractArray(earningsResult.value)  : []

  const incomeRows = rawIncome.filter((r): r is AnnualIncomeRow =>
    r !== null && typeof r === 'object' && 'date' in r
  )
  const estimateRows = rawEstimates.filter((r): r is EstimateRow =>
    r !== null && typeof r === 'object' && 'date' in r
  )
  const earningsRows = rawEarnings.filter((r): r is EarningsRow =>
    r !== null && typeof r === 'object' && 'date' in r
  )

  // Derive fiscal period label — prefer fiscalYear (stable), fall back to calendarYear (v3)
  function annualFiscalPeriod(inc: AnnualIncomeRow): string {
    const yearField = typeof inc.fiscalYear === 'string' ? inc.fiscalYear
      : typeof inc.fiscalYear === 'number' ? String(inc.fiscalYear)
      : typeof inc.calendarYear === 'string' ? inc.calendarYear
      : typeof inc.calendarYear === 'number' ? String(inc.calendarYear) : ''
    const periodStr = typeof inc.period === 'string' ? inc.period : 'FY'
    return yearField ? `${periodStr} ${yearField}` : `FY ${new Date(inc.date + 'T00:00:00').getFullYear()}`
  }

  // Forward annual estimates (2 years ahead of last reported)
  const latestIncomeDate = incomeRows.length > 0 ? incomeRows[0].date : null
  const lastReportedFiscalPeriod: string | null = incomeRows.length > 0
    ? annualFiscalPeriod(incomeRows[0])
    : null

  const forwardEstimatesAsc = estimateRows
    .filter((e) => latestIncomeDate === null || e.date > latestIncomeDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2)

  const forwardAnnual: MergedQuarter[] = forwardEstimatesAsc
    .map((est, i) => {
      const earn = matchEarnings(earningsRows, est.date)
      return {
        periodEnd:        est.date,
        fiscalPeriod:     lastReportedFiscalPeriod
          ? advanceFiscalPeriod(lastReportedFiscalPeriod, i + 1)
          : `FY ${new Date(est.date + 'T00:00:00').getFullYear()}`,
        reportDate:       earn?.date ?? null,
        actualRevenue: null, actualEbitda: null, actualEbit: null,
        actualNetIncome: null, actualEps: null, actualSga: null,
        estRevenueLow:    num(est.revenueLow),
        estRevenueHigh:   num(est.revenueHigh),
        estRevenueAvg:    num(est.revenueAvg),
        estEbitdaLow:     num(est.ebitdaLow),
        estEbitdaHigh:    num(est.ebitdaHigh),
        estEbitdaAvg:     num(est.ebitdaAvg),
        estEbitLow:       num(est.ebitLow),
        estEbitHigh:      num(est.ebitHigh),
        estEbitAvg:       num(est.ebitAvg),
        estNetIncomeLow:  num(est.netIncomeLow),
        estNetIncomeHigh: num(est.netIncomeHigh),
        estNetIncomeAvg:  num(est.netIncomeAvg),
        estEpsLow:        num(est.epsLow),
        estEpsHigh:       num(est.epsHigh),
        estEpsAvg:        num(est.epsAvg),
        estSgaLow:        num(est.sgaExpenseLow),
        estSgaHigh:       num(est.sgaExpenseHigh),
        estSgaAvg:        num(est.sgaExpenseAvg),
        analystCountRevenue: num(est.numAnalystsRevenue),
        analystCountEps:     num(est.numAnalystsEps),
        priceReactionPct: null,
      }
    })
    .reverse()

  const historical: MergedQuarter[] = incomeRows.map((inc) => {
    const est  = fuzzyMatchEstimate(estimateRows, inc.date)
    const earn = matchEarnings(earningsRows, inc.date)
    const reportDate = earn?.date ?? null

    const fiscalPeriod = annualFiscalPeriod(inc)

    // Annual actuals come straight from the annual income statement. Do NOT
    // substitute the /earnings endpoint values here — those are QUARTERLY
    // (matchEarnings resolves each fiscal year to its Q4 release), which would
    // overwrite full-year revenue/EPS with just Q4. epsDiluted is the stable
    // endpoint's field name (capital D); epsdiluted is the v3 fallback.
    return {
      periodEnd: inc.date,
      fiscalPeriod,
      reportDate,
      actualRevenue:    num(inc.revenue),
      actualEbitda:     num(inc.ebitda),
      actualEbit:       num(inc.operatingIncome),
      actualNetIncome:  num(inc.netIncome),
      actualEps:        num(inc.epsDiluted) ?? num(inc.epsdiluted),
      actualSga:        num(inc.sellingGeneralAndAdministrativeExpenses),
      estRevenueLow:    est ? num(est.revenueLow)    : null,
      estRevenueHigh:   est ? num(est.revenueHigh)   : null,
      estRevenueAvg:    est ? num(est.revenueAvg)    : null,
      estEbitdaLow:     est ? num(est.ebitdaLow)     : null,
      estEbitdaHigh:    est ? num(est.ebitdaHigh)    : null,
      estEbitdaAvg:     est ? num(est.ebitdaAvg)     : null,
      estEbitLow:       est ? num(est.ebitLow)       : null,
      estEbitHigh:      est ? num(est.ebitHigh)      : null,
      estEbitAvg:       est ? num(est.ebitAvg)       : null,
      estNetIncomeLow:  est ? num(est.netIncomeLow)  : null,
      estNetIncomeHigh: est ? num(est.netIncomeHigh) : null,
      estNetIncomeAvg:  est ? num(est.netIncomeAvg)  : null,
      estEpsLow:        est ? num(est.epsLow)        : null,
      estEpsHigh:       est ? num(est.epsHigh)       : null,
      estEpsAvg:        est ? num(est.epsAvg)        : null,
      estSgaLow:        est ? num(est.sgaExpenseLow)  : null,
      estSgaHigh:       est ? num(est.sgaExpenseHigh) : null,
      estSgaAvg:        est ? num(est.sgaExpenseAvg)  : null,
      analystCountRevenue: est ? num(est.numAnalystsRevenue) : null,
      analystCountEps:     est ? num(est.numAnalystsEps)     : null,
      priceReactionPct: null,
    }
  })

  return [...forwardAnnual, ...historical]
}
