/**
 * trackRecord.ts
 *
 * Whether a trailing period is one the portfolio has actually lived through.
 *
 * The Total Returns table offers 1 Mo / 3 Mo / YTD / 1 Yr / 3 Yr / 5 Yr / 10 Yr /
 * All Time, and on every one of the 19 books the 3 Yr, 5 Yr and 10 Yr cells are
 * empty. That was filed as dead schema — three columns "structurally always
 * blank", to be dropped or added to the workbook sheet. Both readings were
 * wrong, and the evidence is the one-year siblings: `historical_sharpe_1y`,
 * `max_drawdown_1y`, `tracking_error_1y`, `market_alpha_12_month` and the rest
 * are populated on 18 of 19 portfolios, while their `_3y` / `_5y` twins are
 * uniformly null. The workbook carries the whole block. **The oldest model is
 * 2.5 years old**, so there is no three-year figure to carry yet.
 *
 * So the columns are not dead, they are PRE-INCEPTION, and they start filling
 * themselves in Apr 2027 when ETF Conservative turns three. Dropping them would
 * have deleted the landing place for that data and — because the importers map
 * sheet header straight to DB column with no whitelist — broken the next
 * workbook import outright (gotcha 7).
 *
 * What was really wrong was the rendering: an em-dash reads as "no data", when
 * the truth is "no track record", and it sat beside a benchmark cell showing a
 * real ten-year figure. In a tool built to defend a process, a cell that invites
 * a comparison nobody can make is the defect.
 *
 * `null` is a third answer, deliberately — a portfolio with no
 * `earliest_performance_date` cannot be placed either way, and saying "cannot
 * tell" beats guessing in both directions (the same lesson as `excel_state`).
 */

/**
 * Has `earliestPerformanceDate` been in existence for at least `years` whole
 * years as of `asOf`?
 *
 * `true` — the period is inside the record; a blank cell means missing data.
 * `false` — the period predates inception; a blank cell is correct and expected.
 * `null` — no inception date on file, so neither can be claimed.
 *
 * All arithmetic is UTC. The column is a calendar DATE, and reading it as a
 * local instant is how a stored day renders as the day before west of
 * Greenwich (gotcha 24).
 */
export function hasTrackRecordFor(
  earliestPerformanceDate: string | null | undefined,
  years: number,
  asOf: Date = new Date(),
): boolean | null {
  if (!earliestPerformanceDate) return null
  const start = new Date(`${earliestPerformanceDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return null
  const cutoff = Date.UTC(asOf.getUTCFullYear() - years, asOf.getUTCMonth(), asOf.getUTCDate())
  return start.getTime() <= cutoff
}

/** Whole years of record, for naming the gap in prose. Null when unknown. */
export function trackRecordYears(
  earliestPerformanceDate: string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (!earliestPerformanceDate) return null
  const start = new Date(`${earliestPerformanceDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return null
  const ms = asOf.getTime() - start.getTime()
  if (ms < 0) return 0
  return Math.floor((ms / 86_400_000) / 365.25 * 10) / 10
}
