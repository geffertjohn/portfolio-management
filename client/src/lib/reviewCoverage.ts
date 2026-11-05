/**
 * reviewCoverage.ts
 *
 * **Which earnings calls were reviewed, and which were never answered.**
 *
 * The companion question to `outstandingCallReviewDay` in `reviewSchedules.ts`,
 * and deliberately a different one. That rule answers *what is owed now*: it
 * names the MOST RECENT unreviewed call, so a stock that reports again while
 * still unreviewed moves its obligation to the new print and the older miss
 * stops being counted. Nothing then records that the earlier call went
 * unanswered — which is exactly the question an examiner asks, because the
 * regulatory claim is that the firm reviewed each holding after each print.
 *
 * So this walks the full call history against `review_log` and reports every
 * gap. It is a READ-ONLY report: it writes nothing, stores nothing, and is
 * assembled on demand from the call history and the review log, which are both
 * already the records of fact. A stored coverage table would be a third copy
 * of what those two already say, and the three would drift — the same argument
 * that keeps the Change Log and the quarterly brief derived.
 *
 * **The window is the whole design.** A report that charges the firm for calls
 * before it held a security, or before this tool recorded reviews at all, is
 * worse than no report: it is an audit artifact full of findings nobody could
 * have acted on, and a reader learns to discount the whole thing. Coverage
 * therefore begins at the LATER of two floors, and the report names which one
 * it used:
 *
 * - **`process_start`** — the first review this system ever recorded. Derived
 *   from `review_log`, never hardcoded, so it stays true as the record grows.
 *   On the live book that is 13 Apr 2026, and every one of the 55 held stocks
 *   was already held by then, so today this floor is the binding one for all
 *   of them.
 * - **`first_held`** — the earliest dated evidence the firm owned it. It binds
 *   for nothing today and will bind for everything bought from now on, which
 *   is the point: you cannot owe a review for a print you did not own through.
 *
 * **A fresh print is `pending`, not `missed`.** A call is only answerable once
 * its review date has actually passed — `release + 1 day`, the same date
 * `MarkReviewedModal` schedules and the same "due today is not overdue"
 * boundary `isOverdue` draws. DUK reported on the morning this was built; a
 * report calling that an unreviewed call would be wrong by a day and would
 * have put a false finding at the top of the list.
 */

import { supabase } from './supabase'
import { isFundOrEtfSecurity } from './securities'
import { fetchEarningsReleaseDates } from './fmpMarket'

/** Whether a call was answered, is still answerable, or was missed. */
export type CallStatus = 'reviewed' | 'missed' | 'pending'

export interface CoverageCall {
  /** The earnings release day, `YYYY-MM-DD`. */
  date: string
  /** When its review fell due — release + 1 day, as the review modal schedules. */
  reviewDueOn: string
  status: CallStatus
  /** The review that answered it, if one did. */
  reviewedAt: string | null
  /** Days between the call and the review that answered it. */
  daysToReview: number | null
}

/** Why coverage starts where it does. Named in the report, never implied. */
export type CoverageBasis = 'process_start' | 'first_held'

export interface SecurityCoverage {
  securityId: string
  /** First day a missed review would be a real finding, or null when none is. */
  coverageFrom: string | null
  coverageBasis: CoverageBasis | null
  /** Calls inside the window, newest first. */
  calls: CoverageCall[]
  reviewed: number
  missed: number
  pending: number
  /** The oldest unanswered call — the row that leads the report. */
  oldestMissed: string | null
  /**
   * FMP would not serve this security's call history.
   *
   * Reported rather than dropped: a security missing from an audit report reads
   * as a security with nothing to answer for, which is the opposite of what an
   * unreadable history means.
   */
  callsUnreadable?: boolean
}

export interface CoverageInput {
  securityId: string
  /** Release dates from FMP `/stable/earnings`, any order; scheduled ones are dropped. */
  callDates: string[]
  /** Every `review_log.reviewed_at` for this security, any order. */
  reviewedAt: string[]
  /** Earliest dated evidence the firm held it, or null when unknown. */
  firstHeld: string | null
  /** The first review this system ever recorded, or null when it recorded none. */
  processStart: string | null
  today: string
}

const day = (v: string) => v.slice(0, 10)

/** A bare `YYYY-MM-DD` shifted by whole days, in UTC so it cannot slip one. */
function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * Where coverage legitimately begins, and which floor decided it.
 *
 * Exported because it is the claim the report rests on: a reader who disagrees
 * with a finding will ask why the window starts there, and the answer has to
 * be a value, not a paragraph.
 */
export function coverageWindowStart(
  firstHeld: string | null,
  processStart: string | null,
): { from: string | null; basis: CoverageBasis | null } {
  // No review was ever recorded, so there is no process to measure against and
  // no honest finding to make. Not a zero — an absence.
  if (!processStart) return { from: null, basis: null }
  if (!firstHeld) return { from: day(processStart), basis: 'process_start' }
  const held = day(firstHeld)
  const start = day(processStart)
  return held > start ? { from: held, basis: 'first_held' } : { from: start, basis: 'process_start' }
}

/**
 * One security's review coverage. Pure.
 *
 * **A review answers the call it FOLLOWS, up to the next one.** Matching is by
 * window rather than by proximity: a review recorded between call *n* and call
 * *n+1* answers call *n*. Nearest-call matching would let a review recorded
 * weeks late be credited to the call it was closest to rather than the one it
 * actually addressed, and on a name that reports every 90 days the two differ
 * whenever the advisor runs more than 45 days behind — which, on this book, is
 * most of them.
 *
 * **Same-day counts, earlier does not.** Earnings land pre-market or
 * post-close and the review is scheduled for the day after, so a review on the
 * call day is reviewing that print. A review the day BEFORE cannot be, and
 * crediting it would turn the report into a rubber stamp. NVDA is the live case
 * on the right side of that line: reviewed 21 May against a call on the 20th.
 */
export function buildSecurityCoverage(input: CoverageInput): SecurityCoverage {
  const { from, basis } = coverageWindowStart(input.firstHeld, input.processStart)
  const today = day(input.today)

  const empty: SecurityCoverage = {
    securityId: input.securityId,
    coverageFrom: from,
    coverageBasis: basis,
    calls: [],
    reviewed: 0,
    missed: 0,
    pending: 0,
    oldestMissed: null,
  }
  if (!from) return empty

  // Scheduled releases are dropped outright rather than shown as pending: a
  // call that has not happened is not a gap in anything.
  const calls = [...new Set(input.callDates.map(day))]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= today)
    .sort()
  if (calls.length === 0) return empty

  const reviews = [...new Set(input.reviewedAt.map(day))].sort()

  const out: CoverageCall[] = calls.map((date, i) => {
    const nextCall = calls[i + 1] ?? null
    const answering = reviews.find((r) => r >= date && (nextCall === null || r < nextCall)) ?? null
    const reviewDueOn = addUtcDays(date, 1)
    const status: CallStatus = answering
      ? 'reviewed'
      // Due today is not overdue — the same boundary `isOverdue` draws, and the
      // reason a print from this morning is not a finding.
      : reviewDueOn >= today
        ? 'pending'
        : 'missed'
    return {
      date,
      reviewDueOn,
      status,
      reviewedAt: answering,
      daysToReview: answering ? daysBetween(date, answering) : null,
    }
  })

  const missed = out.filter((c) => c.status === 'missed')
  return {
    securityId: input.securityId,
    coverageFrom: from,
    coverageBasis: basis,
    calls: [...out].reverse(),
    reviewed: out.filter((c) => c.status === 'reviewed').length,
    missed: missed.length,
    pending: out.filter((c) => c.status === 'pending').length,
    oldestMissed: missed[0]?.date ?? null,
  }
}

/**
 * The report, worst first.
 *
 * Ordered by the OLDEST unanswered call, not by the miss count: one call
 * unanswered for a year is a worse finding than three unanswered last quarter,
 * and an examiner reads the list from the top. Securities with no gap sort
 * after every security that has one, keeping their own order.
 */
export function sortCoverageByGap(rows: SecurityCoverage[]): SecurityCoverage[] {
  return [...rows].sort((a, b) => {
    if (a.oldestMissed && b.oldestMissed) return a.oldestMissed.localeCompare(b.oldestMissed)
    if (a.oldestMissed) return -1
    if (b.oldestMissed) return 1
    return a.securityId.localeCompare(b.securityId)
  })
}

export interface CoverageTotals {
  securities: number
  /** Securities carrying at least one unanswered call. */
  withGaps: number
  calls: number
  reviewed: number
  missed: number
  pending: number
  /** Reviewed as a share of ANSWERABLE calls — pending ones are excluded. */
  rate: number | null
}

/**
 * Firm-wide totals.
 *
 * **`rate` divides by answerable calls, not by all of them.** Counting a print
 * from this morning against the firm would make the figure drift down and back
 * up on its own every quarter, for a reason that has nothing to do with
 * whether anyone did the work. It is null when nothing is answerable yet,
 * rather than 0% or 100%, both of which would be a claim.
 */
export function coverageTotals(rows: SecurityCoverage[]): CoverageTotals {
  const reviewed = rows.reduce((n, r) => n + r.reviewed, 0)
  const missed = rows.reduce((n, r) => n + r.missed, 0)
  const pending = rows.reduce((n, r) => n + r.pending, 0)
  const answerable = reviewed + missed
  return {
    securities: rows.length,
    withGaps: rows.filter((r) => r.missed > 0).length,
    calls: reviewed + missed + pending,
    reviewed,
    missed,
    pending,
    rate: answerable === 0 ? null : reviewed / answerable,
  }
}

/**
 * The report as CSV, one row per CALL rather than per security.
 *
 * Per call, because the artifact has to stand on its own in an examination: a
 * row saying "DUK, 2 of 3" invites the next question, while a row naming the
 * 4 Aug call and the date its review fell due answers it. Built here beside
 * the rule, the way `buildActionsCsv` sits beside `actionLabel`, so the export
 * and the screen cannot disagree about what a gap is.
 */
export function buildCoverageCsv(rows: SecurityCoverage[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const head = [
    'Security', 'Earnings call', 'Review due', 'Status', 'Reviewed on',
    'Days to review', 'Coverage from', 'Coverage basis',
  ]
  const lines = [head.join(',')]
  for (const r of sortCoverageByGap(rows)) {
    for (const c of r.calls) {
      lines.push([
        r.securityId, c.date, c.reviewDueOn, c.status, c.reviewedAt ?? '',
        c.daysToReview == null ? '' : String(c.daysToReview),
        r.coverageFrom ?? '', r.coverageBasis ?? '',
      ].map((v) => esc(String(v))).join(','))
    }
  }
  return lines.join('\n')
}

// ── Assembly ────────────────────────────────────────────────────────────────

/**
 * The report for every held stock.
 *
 * Four reads plus one FMP request per symbol, run on demand. Nothing is
 * persisted: the call history and the review log are already the records of
 * fact, and a stored coverage table would be a third copy that drifts from
 * both.
 *
 * **Held stocks only**, through the shared classifier: a fund review is
 * cadence-driven and has no call to be behind on, and `$Cash` is excluded the
 * same way the seeding path excludes it — there is nothing to review.
 *
 * **`first_held` is the earliest of two signals, not one.**
 * `portfolio_allocations` is the dated target history and is the better
 * evidence, but two books' positions are not driven by their own history (a
 * derived blend, and one whose newest snapshot is sixteen months stale), so
 * `positions.created_at` is taken alongside it and the earlier wins. Reaching
 * for whichever is earlier can only widen the window, never narrow it — the
 * safe direction, since narrowing it would hide a real gap.
 */
export async function fetchReviewCoverage(): Promise<SecurityCoverage[]> {
  const [held, reviews, allocFirst] = await Promise.all([
    supabase
      .from('positions')
      // ONE literal — the client is schema-typed and infers the row shape from
      // this string, so a `+` concatenation degrades it to GenericStringError[].
      .select('security_id, created_at, securities2!inner(detailed_security_type, peer_group_name, fund_company_name, fund_family, expense_ratio_generic)')
      .is('deleted_at', null),
    // No soft-delete filter: `review_log` carries no `deleted_at` at all. It is
    // insert/read/delete only, so the rows that exist ARE the review record.
    supabase.from('review_log').select('security_id, reviewed_at'),
    supabase.from('portfolio_allocations').select('security_id, effective_date'),
  ])
  if (held.error) throw held.error
  if (reviews.error) throw reviews.error
  if (allocFirst.error) throw allocFirst.error

  // The first review this system ever recorded. Derived, never hardcoded, so
  // it stays true as the record grows — and null when nothing was recorded,
  // which makes every row report "no claim" rather than "all missed".
  const processStart = (reviews.data ?? [])
    .map((r) => r.reviewed_at)
    .filter((v): v is string => !!v)
    .sort()[0] ?? null

  const reviewedBy = new Map<string, string[]>()
  for (const r of reviews.data ?? []) {
    if (!r.security_id || !r.reviewed_at) continue
    const list = reviewedBy.get(r.security_id) ?? []
    list.push(r.reviewed_at)
    reviewedBy.set(r.security_id, list)
  }

  const earliest = new Map<string, string>()
  const note = (id: string | null, v: string | null | undefined) => {
    if (!id || !v) return
    const d = v.slice(0, 10)
    const have = earliest.get(id)
    if (!have || d < have) earliest.set(id, d)
  }
  for (const r of allocFirst.data ?? []) note(r.security_id, r.effective_date)

  const stocks: string[] = []
  for (const row of held.data ?? []) {
    const s = row.securities2
    if (!row.security_id || row.security_id === '$Cash') continue
    if (s && isFundOrEtfSecurity(s)) continue
    note(row.security_id, row.created_at)
    if (!stocks.includes(row.security_id)) stocks.push(row.security_id)
  }

  const today = new Date().toISOString().slice(0, 10)
  const out: SecurityCoverage[] = []
  const queue = [...stocks].sort()

  // Bounded concurrency, and a symbol whose history cannot be read is REPORTED
  // rather than dropped: a security missing from an audit report reads as a
  // security with nothing to answer for.
  async function worker(): Promise<void> {
    for (;;) {
      const symbol = queue.shift()
      if (!symbol) return
      let callDates: string[] = []
      let unreadable = false
      try {
        callDates = await fetchEarningsReleaseDates(symbol)
      } catch {
        // `fmpFetch` throws on a non-OK status, so this catches a real refusal.
        unreadable = true
      }
      // A 200 carrying an empty array is the SAME hole by another route: every
      // public company reports, so no release dates at all for a held stock is
      // a gap in the feed, not an answer. Without this the row would read 0
      // missed and 0 reviewed — a holding with nothing to answer for.
      if (callDates.length === 0) unreadable = true
      const built = buildSecurityCoverage({
        securityId: symbol,
        callDates,
        reviewedAt: reviewedBy.get(symbol) ?? [],
        firstHeld: earliest.get(symbol) ?? null,
        processStart,
        today,
      })
      out.push(unreadable ? { ...built, callsUnreadable: true } : built)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))

  return sortCoverageByGap(out)
}
