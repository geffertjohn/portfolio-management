/**
 * reviewSchedules.ts
 *
 * Manages per-security review schedules.
 * A schedule stores the cadence, last reviewed date, and next review date.
 * `markReviewed()` updates the schedule and appends a record to `review_log`.
 * `calcNextReview()` computes the next date from a base date + cadence.
 */
import { supabase } from './supabase'
import { isFundOrEtfSecurity } from './securities'
import type { ReviewOutcome, Recommendation, Conviction, ReviewMetricsSnapshot } from './reviewLog'

export type ReviewCadence = 'quarterly' | 'semi_annual' | 'annual'

export interface ReviewSchedule {
  id: number
  security_id: string
  cadence: ReviewCadence
  last_reviewed_at: string | null
  next_review_at: string
  created_at: string
  updated_at: string
}

export interface ReviewScheduleWithSecurity extends ReviewSchedule {
  symbol: string
  name: string | null
  broad_asset_class: string | null
  /** The integer `securities2.id` — used for URL-based navigation (/security/:id). */
  security_numeric_id: number | null
  last_earnings_release: string | null
  next_earnings_release: string | null
  /** Classifier inputs, so callers can use `isFundOrEtfSecurity` rather than guessing. */
  detailed_security_type: string | null
  peer_group_name: string | null
  fund_company_name: string | null
  fund_family: string | null
  expense_ratio_generic: number | null
}

function calcNextReview(cadence: ReviewCadence, from = new Date()): string {
  const d = new Date(from)
  if (cadence === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (cadence === 'semi_annual') d.setMonth(d.getMonth() + 6)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}

export async function fetchReviewSchedules(): Promise<ReviewScheduleWithSecurity[]> {
  const { data, error } = await supabase
    .from('review_schedules')
    .select('*, securities2(id, security_id, security_name, broad_asset_class, last_earnings_release, next_earnings_release, detailed_security_type, peer_group_name, fund_company_name, fund_family, expense_ratio_generic)')
    .order('next_review_at', { ascending: true })
  if (error) throw error
  // DB stores cadence as text; domain type narrows it
  return (data ?? []).map((row) => ({
    ...row,
    symbol: row.securities2?.security_id ?? '',
    name: row.securities2?.security_name ?? null,
    broad_asset_class: row.securities2?.broad_asset_class ?? null,
    security_numeric_id: row.securities2?.id ?? null,
    last_earnings_release: row.securities2?.last_earnings_release ?? null,
    next_earnings_release: row.securities2?.next_earnings_release ?? null,
    detailed_security_type: row.securities2?.detailed_security_type ?? null,
    peer_group_name: row.securities2?.peer_group_name ?? null,
    fund_company_name: row.securities2?.fund_company_name ?? null,
    fund_family: row.securities2?.fund_family ?? null,
    expense_ratio_generic: row.securities2?.expense_ratio_generic ?? null,
  })) as ReviewScheduleWithSecurity[]
}

export async function fetchReviewScheduleBySecurity(securityId: string): Promise<ReviewSchedule | null> {
  const { data, error } = await supabase
    .from('review_schedules')
    .select('*')
    .eq('security_id', securityId)
    .maybeSingle()
  if (error) throw error
  // DB stores cadence as text; domain type narrows it
  return data as ReviewSchedule | null
}

export async function upsertReviewSchedule(
  securityId: string,
  cadence: ReviewCadence,
  nextReviewAt?: Date
): Promise<void> {
  const next_review_at = nextReviewAt ? nextReviewAt.toISOString() : calcNextReview(cadence)
  const { error } = await supabase
    .from('review_schedules')
    .upsert({ security_id: securityId, cadence, next_review_at }, { onConflict: 'security_id' })
  if (error) throw error
}

export interface MarkReviewedOptions {
  securityId: string
  cadence: ReviewCadence
  notes: string
  /** Actual date the review was completed. Defaults to now. */
  reviewedAt?: Date
  /** Scheduled date the review was due (earnings date + 1 day). Logged for the record. */
  reviewDate?: Date | null
  /** Explicit next review date (e.g. next earnings + 1 day). Falls back to cadence-based when omitted. */
  nextReviewAt?: Date | null
  ipsSuitable?: boolean | null
  reviewedBy?: string | null
  /** Process outcome — funds. */
  outcome?: ReviewOutcome | null
  /** Investment recommendation — stocks. */
  recommendation?: Recommendation | null
  conviction?: Conviction | null
  priceAtReview?: number | null
  metricsSnapshot?: ReviewMetricsSnapshot | null
  /** Path of the uploaded review-evidence document (Security Documents bucket). */
  evidenceDocPath?: string | null
  /**
   * The research report this review was drafted from — the post-earnings brief.
   * Makes the pairing structural; it was prose in the rationale before.
   */
  sourceReportId?: number | null
}

/**
 * Record a completed review.
 * Updates `review_schedules` (cadence + next_review_at) and inserts a row into `review_log`.
 * `reviewedAt` is the actual completion date (defaults to now); `reviewDate` is the
 * scheduled due date; `nextReviewAt` sets the next due date explicitly (else cadence-based).
 */
export async function markReviewed(opts: MarkReviewedOptions): Promise<void> {
  const { securityId, cadence, notes, ipsSuitable, reviewedBy, outcome } = opts
  const { recommendation, conviction, priceAtReview, metricsSnapshot, evidenceDocPath } = opts
  const now = opts.reviewedAt ?? new Date()
  const next_review_at = opts.nextReviewAt ? opts.nextReviewAt.toISOString() : calcNextReview(cadence, now)

  // Update schedule
  const { error: schedError } = await supabase
    .from('review_schedules')
    .upsert(
      { security_id: securityId, cadence, last_reviewed_at: now.toISOString(), next_review_at },
      { onConflict: 'security_id' }
    )
  if (schedError) throw schedError

  // Write to log
  const { error: logError } = await supabase
    .from('review_log')
    .insert({
      security_id: securityId,
      notes: notes || null,
      review_date: opts.reviewDate ? opts.reviewDate.toISOString() : null,
      reviewed_at: now.toISOString(),
      ips_suitable: ipsSuitable ?? null,
      reviewed_by: reviewedBy || null,
      outcome: outcome ?? null,
      recommendation: recommendation ?? null,
      conviction: conviction ?? null,
      price_at_review: priceAtReview ?? null,
      metrics_snapshot: metricsSnapshot ?? null,
      evidence_doc_path: evidenceDocPath ?? null,
      source_report_id: opts.sourceReportId ?? null,
    } as never)
  if (logError) throw logError
}

/** Returns true if the next review date is in the past. */
/**
 * Re-dating a stock review whose earnings date has moved.
 *
 * A stock review is due the day after the company reports, and that date is
 * STORED when the review is recorded — nothing re-reads it. FMP routinely moves
 * an estimated date, and when it does the schedule keeps pointing at the old
 * one: MSI was set on 2026-10-28 to Oct 30 from an estimate of ~Oct 29, the call
 * moved to Nov 4, and the row sat 4 days "overdue" for a company that had not
 * reported. The Review Calendar already tops up the stored EARNINGS dates; this
 * carries that correction through to the SCHEDULE, which it never did.
 *
 * THE DANGEROUS CASE IS AN OUTSTANDING REVIEW. A row sitting at
 * `last_earnings + 1` is overdue because the company HAS reported and nobody has
 * reviewed it yet — ABBV and CVX both read exactly that on 2026-11-02. Re-dating
 * those to `next_earnings + 1` would fling a real, pending review three months
 * into the future and silently erase it from every due list. So a row is only
 * moved when it points PAST the last reported call, i.e. when it was aimed at a
 * future call in the first place; an overdue or missed review is never touched.
 *
 * Safe to apply because stock schedules are always derived: `markReviewed`
 * writes `next_earnings + 1` and the modal's manual-override path (`mode:
 * 'schedule'`) has no caller, so there is no hand-set date to clobber. If an
 * override UI is ever reintroduced, this needs a flag to recognise it.
 */
export interface ScheduleRedateInput {
  security_id: string
  next_review_at: string
  last_earnings_release: string | null
  next_earnings_release: string | null
}

export interface ScheduleRedate {
  securityId: string
  /** Current stored day, for logging what moved. */
  from: string
  nextReviewAt: string
}

/**
 * The calendar DAY a `review_schedules.next_review_at` means.
 *
 * The column is a date — earnings date plus one — stored as `timestamptz` by
 * writers that disagree on the time of day: local midnight from the review
 * modal (`2027-01-28T05:00:00Z` in EST), UTC midnight from everything else
 * (`2027-01-28T00:00:00Z`). Formatted in local time a UTC-midnight value renders
 * as the PREVIOUS day west of Greenwich — which is how MSI read "Oct 29" from a
 * row holding Oct 30 (gotcha 24). The UTC date part resolves both, because local
 * midnight in a negative-offset zone falls later on the same UTC day.
 *
 * Pass the result to `formatDate`, which treats a bare date as local noon.
 */
export function reviewDueDay(nextReviewAt: string): string {
  return nextReviewAt.slice(0, 10)
}

/** A bare `YYYY-MM-DD` shifted by whole days, in UTC so it cannot slip one. */
function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Which STOCK schedules disagree with the earnings date they are derived from.
 *
 * Pure — pass it rows already filtered to stocks (funds are cadence-driven and
 * have no earnings date to derive from). Returns only the rows that must change.
 *
 * **A re-date may correct a date; it may never retire a review that has already
 * fallen due.** Two guards do that, and the second was missing until Nov 2026:
 *
 * - An outstanding review for a call that already happened is left alone
 *   (`current <= last_earnings_release + 1`). That covers the ordinary case —
 *   the stock reported, the review is due, and the next earnings date has
 *   already rolled a quarter forward.
 * - But it only covers it when the review date sits at or before that call.
 *   **A schedule dated off a next-earnings ESTIMATE that never happened lands
 *   between the real call and the next one, where the first guard cannot see
 *   it.** HOOD was live proof on 5 Nov 2026: stored `next_earnings_release`
 *   read 4 Nov, so its review was dated 5 Nov, while the call had actually
 *   been held on 27 Oct and was never reviewed (last reviewed 4 May). The FMP
 *   top-up corrected the dates to `last = 27 Oct, next = 9 Feb`; 5 Nov is
 *   after 28 Oct, so the first guard passed and the re-date moved a review due
 *   THAT DAY out to 10 Feb 2027 — silently cancelling the review of the
 *   October call.
 *
 * So a row already due (today or earlier) is never pushed into the future. It
 * stays where it is and stays visible; nothing is moved BACKWARD, because that
 * would assert a missed review from a date no call was held on. Whether the
 * calendar should go further and date such a row from the call it actually
 * missed is a separate question — 27 of 54 stocks currently carry an unreviewed
 * call — and deliberately not decided here.
 */
export function redatedStockSchedules(
  rows: ScheduleRedateInput[],
  today: string,
): ScheduleRedate[] {
  const out: ScheduleRedate[] = []
  for (const r of rows) {
    if (!r.next_earnings_release || !r.next_review_at) continue
    // The same UTC-date-part convention the Actions adapter uses: this column is
    // a calendar day stored as `timestamptz`, by writers that disagree on the
    // time of day (local midnight vs UTC midnight).
    const current = reviewDueDay(r.next_review_at)
    const target = addUtcDays(r.next_earnings_release, 1)
    if (current === target) continue
    // Outstanding review for a call that already happened — leave it alone.
    if (r.last_earnings_release && current <= addUtcDays(r.last_earnings_release, 1)) continue
    // Already due, and the correction would defer it. Leave it on the calendar.
    if (current <= today && target > today) continue
    out.push({ securityId: r.security_id, from: current, nextReviewAt: `${target}T00:00:00Z` })
  }
  return out
}

/**
 * A held stock that carries NO `review_schedules` row.
 *
 * Nothing creates one when a stock is bought: the only live writer is
 * `markReviewed`, so a row appears by completing a review — which you would
 * only think to do if the security appeared on the calendar. HCA and TSM sat
 * held in two books each, never reviewed, visible on no surface, because both
 * the Review Calendar and the Actions hub read `fetchReviewSchedules`.
 * (`upsertReviewSchedule` could have seeded one and has no caller.)
 */
export interface ScheduleSeedInput {
  security_id: string
  next_earnings_release: string | null
  detailed_security_type: string | null
  peer_group_name: string | null
  fund_company_name: string | null
  fund_family: string | null
  expense_ratio_generic: number | null
}

export interface ScheduleSeed {
  securityId: string
  cadence: ReviewCadence
  nextReviewAt: string
}

/**
 * Which held, unscheduled stocks get a schedule, and dated how. Pure.
 *
 * **Dated forward from `next_earnings_release`, and skipped when that date is
 * in the past.** A stale stored date would seed a review that reads
 * overdue for a call nobody has evidence was missed — the position may have
 * been added last week, or reviewed outside the system. Scheduling the NEXT
 * review makes no retrospective claim; manufacturing an overdue one does. TSM's
 * stored date was three weeks past, which is why the caller refreshes from FMP
 * before seeding rather than seeding whatever is stored.
 *
 * `cadence` is required by the table and hidden from the stock review UI, which
 * is earnings-driven — `quarterly` is what all 94 live rows carry.
 */
export function seededStockSchedules(
  candidates: ScheduleSeedInput[],
  today: string,
): ScheduleSeed[] {
  const out: ScheduleSeed[] = []
  for (const c of candidates) {
    if (isFundOrEtfSecurity(c)) continue
    const earnings = c.next_earnings_release
    if (!earnings) continue
    const day = earnings.slice(0, 10)
    // Strictly in the PAST is the disqualifier. A call today gives a review due
    // tomorrow, which is a perfectly good forward date and claims nothing.
    if (day < today) continue
    out.push({
      securityId: c.security_id,
      cadence: 'quarterly',
      nextReviewAt: `${addUtcDays(day, 1)}T00:00:00Z`,
    })
  }
  return out
}

/**
 * Held stocks with no schedule row, for `seededStockSchedules`.
 *
 * Three reads rather than one: `review_schedules` has no FK from `positions`,
 * so there is no embed to lean on, and the set difference is done here. Runs
 * once per calendar mount.
 */
export async function fetchUnscheduledHeldSecurities(): Promise<ScheduleSeedInput[]> {
  const [held, scheduled] = await Promise.all([
    supabase.from('positions').select('security_id').is('deleted_at', null),
    supabase.from('review_schedules').select('security_id'),
  ])
  if (held.error) throw held.error
  if (scheduled.error) throw scheduled.error

  const have = new Set((scheduled.data ?? []).map((r) => r.security_id))
  const want = [...new Set((held.data ?? []).map((r) => r.security_id))].filter((id) => !have.has(id))
  if (want.length === 0) return []

  const { data, error } = await supabase
    .from('securities2')
    // ONE literal, not a concatenation: the client is schema-typed and infers
    // the row shape from this string, so a `+` here loses the columns and the
    // result degrades to GenericStringError[].
    .select('security_id, next_earnings_release, detailed_security_type, peer_group_name, fund_company_name, fund_family, expense_ratio_generic')
    .in('security_id', want)
  if (error) throw error
  return data ?? []
}

/** One schedule to create. `nextReviewAt` null means "use the cadence default". */
export interface NewScheduleWrite {
  securityId: string
  cadence: ReviewCadence
  nextReviewAt: string | null
}

/**
 * Which newly held securities get a schedule, and dated how. Pure.
 *
 * The two asset types are scheduled on different principles and this is the
 * one place that says so:
 *
 * - **A stock is earnings-driven** — `next_earnings_release + 1 day`, via
 *   `seededStockSchedules`, which REFUSES a stale date rather than producing a
 *   schedule born overdue. A stock with no usable date gets nothing here and is
 *   picked up by the calendar's seed, which refreshes from FMP first.
 * - **A fund or ETF is cadence-driven** and has no earnings date to read, so it
 *   takes the cadence default (`nextReviewAt: null`). Quarterly is what all 42
 *   live fund rows carry.
 */
export function newScheduleWrites(
  candidates: ScheduleSeedInput[],
  today: string,
): NewScheduleWrite[] {
  const stocks: NewScheduleWrite[] = seededStockSchedules(candidates, today).map((s) => ({
    securityId: s.securityId,
    cadence: s.cadence,
    nextReviewAt: s.nextReviewAt,
  }))
  const funds: NewScheduleWrite[] = candidates
    .filter((c) => isFundOrEtfSecurity(c))
    .map((c) => ({ securityId: c.security_id, cadence: 'quarterly' as ReviewCadence, nextReviewAt: null }))
  return [...stocks, ...funds]
}

/**
 * Give a review schedule to securities that have just entered a book.
 *
 * **Called from the four paths that put a security into `positions`** —
 * `createPosition`, `updatePosition` (when the ticker changes),
 * `syncPositionsFromLatestSnapshot` and `syncPositionForGridEdit`. Until
 * Nov 2026 none of them did, so a bought stock carried no schedule and showed
 * on no review surface; `ReviewCalendarPage`'s on-mount seed was the only
 * thing that noticed, and only once somebody opened that page.
 *
 * **It is create-only in effect**, by filtering to the unscheduled first.
 * `upsertReviewSchedule` OVERWRITES `next_review_at`, which on this path would
 * be a real defect: the allocation import runs often, and re-importing a book
 * would reset the next review date of every holding, including one reviewed
 * that morning. The filter is what makes using it safe. A row created between
 * the read and the write is the only race, and it is harmless — both writers
 * derive the same date from the same stored column.
 *
 * **A stock with no usable earnings date gets nothing, deliberately**
 * (`seededStockSchedules` refuses a stale date rather than seeding a schedule
 * born overdue). The calendar's seed is the backstop: it refreshes from FMP
 * first, so the row appears there.
 *
 * **It never throws.** The position is already written by the time this runs,
 * so a scheduling failure must not report a completed purchase as failed —
 * the same reasoning as `recordImportRuns`. It warns, and the calendar seed
 * picks up whatever was missed.
 */
export async function ensureReviewSchedules(securityIds: string[]): Promise<number> {
  const want = [...new Set(securityIds.map((s) => s?.trim()).filter(Boolean))] as string[]
  if (want.length === 0) return 0

  try {
    const { data: have, error: hErr } = await supabase
      .from('review_schedules').select('security_id').in('security_id', want)
    if (hErr) throw hErr
    const scheduled = new Set((have ?? []).map((r) => r.security_id))
    const missing = want.filter((id) => !scheduled.has(id))
    if (missing.length === 0) return 0

    const { data: rows, error: sErr } = await supabase
      .from('securities2')
      // ONE literal — the client is schema-typed and infers the row shape from
      // this string, so a `+` concatenation degrades it to GenericStringError[].
      .select('security_id, next_earnings_release, detailed_security_type, peer_group_name, fund_company_name, fund_family, expense_ratio_generic')
      .in('security_id', missing)
    if (sErr) throw sErr

    const writes = newScheduleWrites(rows ?? [], new Date().toISOString().slice(0, 10))
    for (const w of writes) {
      await upsertReviewSchedule(w.securityId, w.cadence, w.nextReviewAt ? new Date(w.nextReviewAt) : undefined)
    }
    return writes.length
  } catch (err) {
    console.warn('ensureReviewSchedules: could not schedule', want, err)
    return 0
  }
}

/**
 * Writes the re-dates. Per-row `update`, not an upsert: a conflict target needs
 * a matching unique constraint (gotcha 8), and these rows all exist already.
 */
export async function applyScheduleRedates(redates: ScheduleRedate[]): Promise<number> {
  for (const r of redates) {
    const { error } = await supabase
      .from('review_schedules')
      .update({ next_review_at: r.nextReviewAt, updated_at: new Date().toISOString() })
      .eq('security_id', r.securityId)
    if (error) throw error
  }
  return redates.length
}

/**
 * A bare `YYYY-MM-DD` is a calendar DAY; anything longer is a real instant.
 *
 * Both forms reach these helpers. A SECURITY review is a day — callers pass it
 * through `reviewDueDay` — while a PORTFOLIO review schedule holds an instant,
 * because its seed trigger writes `now()` with microseconds. Comparing a day as
 * an instant is what made a UTC-midnight date read overdue from 20:00 local the
 * evening before it was due. Same split `formatDate` and `daysUntil` use.
 */
function isCalendarDay(value: string): boolean {
  return value.length <= 10
}

/** Local midnight today — the boundary a calendar day is measured against. */
function startOfToday(): Date {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

export function isOverdue(nextReviewAt: string): boolean {
  if (isCalendarDay(nextReviewAt)) {
    // A review due TODAY is not overdue — it is due.
    return new Date(`${nextReviewAt}T00:00:00`) < startOfToday()
  }
  return new Date(nextReviewAt) < new Date()
}

/** Returns true if the next review date falls within `withinDays` days from today (default 14). */
export function isDueSoon(nextReviewAt: string, withinDays = 14): boolean {
  if (isCalendarDay(nextReviewAt)) {
    const today = startOfToday()
    const soon = new Date(today)
    soon.setDate(soon.getDate() + withinDays)
    const d = new Date(`${nextReviewAt}T00:00:00`)
    return d >= today && d <= soon
  }
  const now = new Date()
  const soon = new Date(now)
  soon.setDate(soon.getDate() + withinDays)
  const d = new Date(nextReviewAt)
  return d >= now && d <= soon
}

/**
 * Which scheduled securities no longer sit in ANY book. Pure.
 *
 * The mirror of `newScheduleWrites`, and the reason it has to exist: the
 * purchase path creates a schedule, and until Nov 2026 nothing retired one.
 * Selling out of every book left the timer standing, so VTABX — gone from the
 * last book in Mar 2026 — was still carrying a review due 9 Dec 2026, and
 * APDFX, sold out of its last book on 1 Oct, one due 29 Dec. Both would have
 * come up on the Review Calendar and in the Actions hub as reviews due for
 * funds the firm does not own. In an audit-defence tool that is worse than
 * noise: a review recorded against an unheld security is a false record of
 * process.
 *
 * **Held in one book is held.** The set of holders is collapsed before the
 * difference is taken, because a security typically sits in several — APDFX
 * was in six — and removing it from one is a rebalance, not a sale. Comparing
 * per-position rather than per-security would retire a live holding's timer on
 * the first book it left.
 *
 * `held` is every *live* position (`deleted_at is null`); the two delete paths
 * disagree on how they remove a row — `deletePosition` soft-deletes for
 * regulatory retention while the allocation import hard-deletes — so the
 * caller filters on that column rather than on the shape of the deletion.
 */
export function retiredSchedules(scheduled: string[], held: string[]): string[] {
  const holding = new Set(held.map((s) => s?.trim()).filter(Boolean))
  return [...new Set(scheduled.map((s) => s?.trim()).filter(Boolean))]
    .filter((id) => !holding.has(id as string))
    .sort() as string[]
}

/**
 * Retire the review schedules of securities that have left every book.
 *
 * **Called from the three paths that take a security out of `positions`** —
 * `deletePosition`, `updatePosition` (the outgoing ticker) and
 * `syncPositionsFromLatestSnapshot` (its `gone` set). Pass the securities whose
 * position was just removed; this re-reads `positions` to confirm none of them
 * is still held elsewhere before deleting anything.
 *
 * **The row is deleted, not flagged.** A schedule is a forward-looking timer,
 * not a record — the reviews themselves live in `review_log` and are untouched,
 * and `review_schedules` is one of the nine tables the `log_audit` trigger
 * covers, so the deletion is itself recorded. Keeping the row and merely hiding
 * it would be worse than either: `ensureReviewSchedules` filters to the
 * *unscheduled*, so a hidden row would block a clean re-seed and a re-purchased
 * fund would come back carrying a date from its previous life — the
 * manufactured-overdue claim `seededStockSchedules` exists to refuse.
 *
 * **It never throws**, for the same reason as `ensureReviewSchedules`: the
 * position is already gone by the time this runs, so a failure here must not
 * report a completed sale as failed. The calendar's sweep is the backstop.
 */
export async function retireReviewSchedules(securityIds: string[]): Promise<number> {
  const candidates = [...new Set(securityIds.map((s) => s?.trim()).filter(Boolean))] as string[]
  if (candidates.length === 0) return 0

  try {
    const [scheduled, held] = await Promise.all([
      supabase.from('review_schedules').select('security_id').in('security_id', candidates),
      supabase.from('positions').select('security_id').in('security_id', candidates).is('deleted_at', null),
    ])
    if (scheduled.error) throw scheduled.error
    if (held.error) throw held.error

    const retire = retiredSchedules(
      (scheduled.data ?? []).map((r) => r.security_id),
      (held.data ?? []).map((r) => r.security_id),
    )
    if (retire.length === 0) return 0

    const { error } = await supabase.from('review_schedules').delete().in('security_id', retire)
    if (error) throw error
    return retire.length
  } catch (err) {
    console.warn('retireReviewSchedules: could not retire', candidates, err)
    return 0
  }
}

/**
 * Every scheduled security that no book holds — the calendar's sweep.
 *
 * The sale-path wiring above cannot reach a row whose position was removed
 * before it existed, and nothing will ever call it for those again. This is the
 * same backstop-beside-the-write-path shape the seeding side already has, and
 * it is what lets the two stranded rows heal without hand-written SQL.
 */
export async function fetchOrphanedSchedules(): Promise<string[]> {
  const [scheduled, held] = await Promise.all([
    supabase.from('review_schedules').select('security_id'),
    supabase.from('positions').select('security_id').is('deleted_at', null),
  ])
  if (scheduled.error) throw scheduled.error
  if (held.error) throw held.error
  return retiredSchedules(
    (scheduled.data ?? []).map((r) => r.security_id),
    (held.data ?? []).map((r) => r.security_id),
  )
}

/** Fields the outstanding-call rule reads. Classifier columns gate it to stocks. */
export interface OutstandingReviewInput {
  next_review_at: string
  last_reviewed_at: string | null
  last_earnings_release: string | null
  detailed_security_type?: string | null
  peer_group_name?: string | null
  fund_company_name?: string | null
  fund_family?: string | null
  expense_ratio_generic?: number | null
}

/**
 * The day a review fell due for a call that has not been reviewed, or null.
 *
 * **A stock's schedule points at its NEXT call, so a review nobody did simply
 * stopped being asked for.** `next_review_at` is `next_earnings_release + 1`,
 * which is a future date; the fact that the PREVIOUS call came and went
 * unreviewed is recorded nowhere the calendar reads. On 5 Nov 2026 that was 27
 * of 54 stocks, twenty of them showing a comfortable future date — including
 * six never reviewed at all (MU, JNJ, JPM, BLK, TSM, HCA), and WMT, NVDA and
 * HD more than seventy days past a call.
 *
 * **Derived, never stored.** The alternative was to re-date those rows
 * backward, and it drifts: the daily FMP top-up moves
 * `last_earnings_release` forward, so a stock that reports again without being
 * reviewed would leave a stored date anchored to the older call while the real
 * obligation moved on. Deriving re-reads both facts every time and always names
 * the most recent unreviewed call — the same reasoning as the derived Change
 * Log and `committeeStage`.
 *
 * **Strictly BEFORE the call is the test.** A review recorded on the call day
 * itself counts as covering it: earnings land pre-market or post-close and the
 * scheduled date is the day after, so the advisor reviewing that same day is
 * plausibly reviewing the print. Claiming otherwise would manufacture an
 * overdue row, and a signal that cries wolf gets dismissed — the lesson
 * `never_run` and the Watchlist's "AI research pending" already cost. No live
 * row sits on that boundary today (strict and lenient both give 27), so the
 * conservative reading costs nothing and cannot be wrong in the direction that
 * matters.
 *
 * **It names the MOST RECENT unreviewed call, not every one ever missed.** If a
 * stock reports again while still unreviewed, the obligation moves to the new
 * print and the older miss stops being counted — so this answers "what is owed
 * now", not "which calls were never reviewed". That second question is a
 * coverage report over `review_log`, which holds the full history; it is a
 * different feature and deliberately not built here.
 *
 * **Funds return null**, via the shared classifier rather than a column test: a
 * fund review is cadence-driven and has no call to be behind on. No fund
 * carries a `last_earnings_release` today, but stocks carry stale
 * `*_total_return_nav` residue from the deleted `fmpSync` and this column is
 * written by the same vanished path, so gating on the classifier rather than on
 * the date being present is the habit that convention asks for.
 */
export function outstandingCallReviewDay(r: OutstandingReviewInput): string | null {
  if (isFundOrEtfSecurity(r)) return null
  if (!r.last_earnings_release) return null
  const call = r.last_earnings_release.slice(0, 10)
  if (r.last_reviewed_at && r.last_reviewed_at.slice(0, 10) >= call) return null
  return addUtcDays(call, 1)
}

/**
 * The day a review is operatively due: its schedule, or an earlier unreviewed
 * call, whichever comes FIRST.
 *
 * The earlier of the two, not the derived one, because both are real
 * obligations and the oldest is the one that should drive the status and the
 * aging line. UBER is the live case that needs it — its schedule reads 4 Nov
 * while the call it has not reviewed was held on the 4th, so the outstanding
 * day derives to the 5th and taking the derived date alone would make a row
 * already overdue read as due tomorrow.
 */
export function effectiveReviewDay(r: OutstandingReviewInput): string {
  const scheduled = reviewDueDay(r.next_review_at)
  const outstanding = outstandingCallReviewDay(r)
  if (!outstanding) return scheduled
  return outstanding < scheduled ? outstanding : scheduled
}

/**
 * Whether a stock's stored earnings dates should be re-read from FMP.
 *
 * **A stored `next_earnings_release` that is WRONG but still in the FUTURE is
 * invisible to a past-only staleness test**, and that cost HOOD its earnings
 * briefs. Its stored date read 4 Nov 2026 while the call was actually held on
 * 27 Oct. Every refresh path tested for null-or-past, so the bad date was
 * never questioned: the Review Calendar's top-up skipped it for six weeks, and
 * `last_earnings_release` sat on 29 July — a whole quarter behind — until
 * somebody happened to open the security page.
 *
 * The consequence was not cosmetic. `pre-earnings-brief` screens candidates on
 * the stored date, so HOOD was never a candidate during its real window; by
 * the time the stored date brought it into view the print was a week past and
 * the job correctly refused to write an expectations document for a call that
 * had already happened. **And `research_reports_post_needs_parent` makes a
 * post-brief impossible without a pre-brief**, so that quarter can never be
 * briefed at all. Eight held stocks were in this state for Q3 FY2026.
 *
 * **There is no way to know a future date is wrong except to ask**, so the
 * trigger is the stored date claiming a call is COMING UP — the only case
 * where being wrong costs anything. Three reasons to check:
 *
 * - **null** — never populated, so there is nothing to schedule from.
 * - **in the past** — the original test, and still right.
 * - **within `horizonDays`** — the new one. A stock reporting soon is a stock
 *   whose date had better be correct, because the pre-earnings window is only
 *   about four days wide and a brief missed is a brief that cannot be written
 *   later.
 *
 * `horizonDays` defaults to 21: it comfortably covers an estimate that moves
 * up by up to three weeks (HOOD's was eight days), while bounding the work to
 * the near-term reporters — six of the fifty-four held stocks on the day this
 * was written, rather than all of them on every calendar mount.
 */
export function needsEarningsCheck(
  nextEarnings: string | null | undefined,
  today: string,
  horizonDays = 21,
): boolean {
  if (!nextEarnings) return true
  const day = nextEarnings.slice(0, 10)
  if (day < today) return true
  return day <= addUtcDays(today, horizonDays)
}

/**
 * A stored next-earnings date that MOVED while still in the future.
 *
 * Reported separately from a routine roll-forward because it is a different
 * fact: a date that merely went past and advanced a quarter is upkeep, while a
 * future date that changed means the window the brief and review jobs were
 * working to was wrong — the HOOD signature. The advisor should know a brief
 * may have been missed, not just that some data was refreshed.
 */
export function correctedFutureEarnings(
  before: Map<string, string | null>,
  after: Array<{ symbol: string; nextEarnings: string | null }>,
  today: string,
): string[] {
  const out: string[] = []
  for (const a of after) {
    const had = before.get(a.symbol)
    if (!had || !a.nextEarnings) continue
    const oldDay = had.slice(0, 10)
    // Only a date that was still AHEAD of us: one already in the past was
    // caught by the old test and advancing it is expected.
    if (oldDay < today) continue
    if (oldDay !== a.nextEarnings.slice(0, 10)) out.push(a.symbol)
  }
  return out.sort()
}

/** A held stock whose call is coming up, with the review it will trigger. */
export interface UpcomingCall {
  symbol: string
  name: string | null
  securityNumericId: number | null
  /** The release day, `YYYY-MM-DD`. */
  callOn: string
  /** The review it will schedule — release + 1 day, as `MarkReviewedModal` does. */
  reviewDueOn: string
  /** Whole days from today; 0 is today. */
  inDays: number
}

/**
 * Held stocks reporting within `days`, soonest first.
 *
 * The forward half of the review calendar. Every other review surface answers
 * what is owed NOW — overdue rows, unanswered calls, coverage gaps — and none
 * of them says what is about to land, though that is what decides whether this
 * week has three reviews in it or none. It is also the window the
 * `pre-earnings-brief` job works to, so a stock listed here with no brief
 * behind it is the gap that cost HOOD its quarter (see `needsEarningsCheck`).
 *
 * **Funds are excluded through the shared classifier**, not a column test: a
 * fund review is cadence-driven and has no call to wait for.
 *
 * Pure, and it reads rows the calendar has already fetched — no new query.
 */
export function upcomingEarnings(
  rows: ReviewScheduleWithSecurity[],
  today: string,
  days = 7,
): UpcomingCall[] {
  const horizon = addUtcDays(today, days)
  return rows
    .filter((r) => !isFundOrEtfSecurity(r))
    .flatMap((r) => {
      const d = r.next_earnings_release?.slice(0, 10)
      // Strictly on or after today: a call that has already happened is the
      // overdue-review surface's business, not this one's.
      if (!d || d < today || d > horizon) return []
      return [{
        symbol: r.symbol,
        name: r.name,
        securityNumericId: r.security_numeric_id,
        callOn: d,
        reviewDueOn: addUtcDays(d, 1),
        inDays: Math.round(
          (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
        ),
      }]
    })
    .sort((a, b) => a.callOn.localeCompare(b.callOn) || a.symbol.localeCompare(b.symbol))
}
