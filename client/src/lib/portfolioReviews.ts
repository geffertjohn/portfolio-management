/**
 * portfolioReviews.ts
 *
 * Cadence-driven portfolio reviews. Distinct from per-security review_log entries.
 *
 * Each portfolio carries three INDEPENDENT review timers (monthly / quarterly /
 * annual) in `portfolio_review_schedules`. Completing a review of one cadence
 * advances only that cadence's `next_review_at` and appends a structured,
 * checklist-bearing record to `portfolio_review_log` (frozen for audit defense).
 */
import type { AttributionWindow } from './portfolioPerformance'
import { supabase } from './supabase'
import { isCashTicker } from './positionBands'
import type { PortfolioPosition } from '@/types/position'
import type { Json } from '@/types/database.types'

/**
 * The holdings a review section asks questions about: everything but cash.
 *
 * Cash is a residual, not a position anyone reviews — it has no scorecard, no
 * thesis and no conviction tier — so every per-holding section drops it. The
 * predicate is here rather than inlined because the SCORECARD step now writes:
 * the set the advisor is shown and the set the automatic flag considers have
 * to be the same set, and two copies of a filter is how they stop being.
 *
 * Six other review sections still inline the same three-clause test
 * (`ConvictionRankingSection`, `WatchlistStatusSection`, `DeepReviewSection`,
 * `PortfolioConstructionSection`, `HoldingMonitorGrid` and `ConsiderationsSection`).
 * They are display-only, so they were left alone rather than swept up here.
 */
export function reviewableHoldings(positions: PortfolioPosition[]): PortfolioPosition[] {
  return positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId))
}
// Date helpers shared with the per-security review schedule.
export { isOverdue, isDueSoon } from './reviewSchedules'

export type PortfolioCadence = 'monthly' | 'quarterly' | 'annual'

export const PORTFOLIO_CADENCES: PortfolioCadence[] = ['monthly', 'quarterly', 'annual']

/**
 * The review cadences that apply to a portfolio, driven by its strategy.
 * Monthly reviews are reserved for individual-stock (Equity) strategies; the
 * fund/ETF strategic models (Foundation, Hybrid, ETF, Fixed Income) run on
 * quarterly + annual only. Mirrors the DB seed trigger
 * (`seed_portfolio_review_schedules`), which seeds monthly for Equity only.
 */
export function cadencesForStrategy(strategy: string | null | undefined): PortfolioCadence[] {
  return strategy === 'Equity'
    ? ['monthly', 'quarterly', 'annual']
    : ['quarterly', 'annual']
}

export const CADENCE_LABELS: Record<PortfolioCadence, string> = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  annual:    'Annual',
}

/** One checklist item the advisor works through during a review of a given cadence. */
export interface ReviewTaskDef {
  key: string
  label: string
}

/**
 * The fixed task list per cadence — the documented process surfaced in the
 * review modal and frozen into each log row's `checklist`.
 */
export const PORTFOLIO_REVIEW_TASKS: Record<PortfolioCadence, ReviewTaskDef[]> = {
  monthly: [
    { key: 'performance_attribution', label: 'Review performance attribution' },
    { key: 'position_sizing',         label: 'Review position sizing' },
  ],
  quarterly: [
    { key: 'full_monitoring',    label: 'Full monitoring review on every holding' },
    { key: 'thesis_scorecards',  label: 'Update thesis scorecards' },
    { key: 'watchlist_status',   label: 'Update watchlist status' },
    { key: 'valuation_changes',  label: 'Check valuation changes' },
  ],
  annual: [
    { key: 'deep_review',             label: 'Deep review of every holding' },
    { key: 'conviction_rankings',     label: 'Rebuild conviction rankings' },
    { key: 'portfolio_construction',  label: 'Reassess portfolio construction' },
    { key: 'valuation_changes',       label: 'Check valuation changes' },
  ],
}

/** The position-sizing check (actual-vs-target from an uploaded allocation file). */
const POSITION_SIZING_TASK: ReviewTaskDef = { key: 'position_sizing', label: 'Review position sizing' }
/** Trailing 30-day top-5 / bottom-5 movers. */
const PERFORMANCE_ATTRIBUTION_TASK: ReviewTaskDef = { key: 'performance_attribution', label: 'Review performance attribution' }

/**
 * The fund/ETF QUARTERLY review.
 *
 * Its own list, not the Equity one with extras bolted on. The shared sections
 * ask a fund holder stock questions it cannot answer: `full_monitoring` wants a
 * Business Trend and a Valuation call of attractive/fair/expensive,
 * `thesis_scorecards` wants a thesis when `security_theses` is stocks-only by
 * design, and the annual `deep_review` asks whether the moat is intact and
 * whether "there is a better STOCK for the same role". Four fund reviews were
 * opened under that list and none was ever completed.
 *
 * A fund is hired for a mandate at a cost, so the evidence is its cohort
 * scorecard — the same `buildFundScorecard` the fund detail page and the
 * per-security review PDF already use. Summary is appended by the workspace
 * and carries the At-Risk list.
 */
const FUND_QUARTERLY_TASKS: ReviewTaskDef[] = [
  POSITION_SIZING_TASK,
  PERFORMANCE_ATTRIBUTION_TASK,
  { key: 'scorecard_review', label: 'Scorecard review on every holding' },
]

/**
 * The fund/ETF ANNUAL review.
 *
 * The quarterly's three evidence steps, then the committee handoff and back.
 * The ORDER carries the meaning: the advisor records what they are inclined to
 * do BEFORE the committee looks, the committee answers the portfolio on its own
 * terms, and the advisor decides last. A proposal written after reading the
 * committee's view is not an independent one, and the record could not show
 * that it was.
 *
 * The committee runs in Claude Code, not the browser, so `considerations` ends
 * by stamping a queue and `committee_review` waits on it. See
 * `lib/portfolioReviewMemos.ts`.
 */
const FUND_ANNUAL_TASKS: ReviewTaskDef[] = [
  POSITION_SIZING_TASK,
  PERFORMANCE_ATTRIBUTION_TASK,
  { key: 'scorecard_review',  label: 'Scorecard review on every holding' },
  { key: 'considerations',    label: 'Considerations for the committee' },
  { key: 'committee_review',  label: 'Committee review' },
  { key: 'final_decision',    label: 'Final decision' },
]

/**
 * The task list for a review, given cadence + portfolio strategy.
 *
 * Fund/ETF portfolios (Foundation/Hybrid/ETF/Fixed Income) have no monthly
 * review, so their quarterly & annual reviews lead with the same position-size
 * check and performance attribution that Equity portfolios run monthly.
 * Equity portfolios keep the base lists (they do those in their monthly review).
 *
 * Both fund lists are now their own. The stock `deep_review` and
 * `conviction_rankings` sections are gone from the fund annual: the tier bands
 * never fitted a book of five funds at twenty to forty percent each, which
 * `hasConvictionTiers` already says in the model editor.
 */
/**
 * Which trailing windows the attribution section shows.
 *
 * **The fund ANNUAL review reads over 3 Month, YTD and 1 Year**; every other
 * review keeps 1 Month and 3 Month. A fund book has no monthly review at all,
 * so its annual is the one sitting furthest from the last look at the numbers,
 * and ranking a year's decisions against a thirty-day window measures noise —
 * a bond sleeve's month says nothing about whether holding it for the year was
 * right. The shorter pair stays everywhere else: an Equity monthly is a
 * thirty-day check by definition, and the quarterly that absorbs it inherits
 * that job (see `advanceSchedule`).
 *
 * The authoritative resolver, beside `reviewTasksFor` and for the same reason:
 * a rule about what a cadence shows belongs in one place, not spread across
 * the page that renders it.
 */
export function attributionWindowsFor(
  cadence: PortfolioCadence,
  strategy: string | null | undefined,
): AttributionWindow[] {
  const isFundBook = strategy !== 'Equity'
  return isFundBook && cadence === 'annual' ? ['3m', 'ytd', '1y'] : ['1m', '3m']
}

export function reviewTasksFor(
  cadence: PortfolioCadence,
  strategy: string | null | undefined,
): ReviewTaskDef[] {
  const base = PORTFOLIO_REVIEW_TASKS[cadence]
  const isEquity = strategy === 'Equity'
  if (isEquity) {
    // A quarterly or annual ABSORBS the monthly slot it lands on (see
    // `advanceSchedule`), so it has to carry the monthly's two checks or that
    // month loses them. Fund books already had these for the mirror-image
    // reason — they have no monthly at all — so every quarterly and annual in
    // the app now opens with the same two portfolio-level checks.
    if (cadence === 'quarterly' || cadence === 'annual') {
      return [POSITION_SIZING_TASK, PERFORMANCE_ATTRIBUTION_TASK, ...base]
    }
    return base
  }
  if (cadence === 'quarterly') return FUND_QUARTERLY_TASKS
  if (cadence === 'annual') return FUND_ANNUAL_TASKS
  return base
}

/** A single checklist item's captured state, frozen into the log row. */
export interface ReviewChecklistItem {
  key: string
  label: string
  done: boolean
  notes: string | null
}

export interface PortfolioReviewSchedule {
  id: number
  portfolio_name: string
  cadence: PortfolioCadence
  last_reviewed_at: string | null
  next_review_at: string
  created_at: string
  updated_at: string
}

export interface PortfolioReview {
  id: number
  portfolio_name: string
  cadence: PortfolioCadence | null
  reviewed_at: string
  /** Scheduled date the review was due. */
  review_date: string | null
  /** Next due date set when this review was completed. */
  next_review_at: string | null
  reviewed_by: string | null
  period: string | null
  notes: string | null
  /** Frozen per-task capture (audit evidence). */
  checklist: ReviewChecklistItem[] | null
  created_at: string
}

/** An in-progress (draft) review loaded into the workspace for editing/resuming. */
export interface ReviewDraft {
  id: number
  cadence: PortfolioCadence
  checklist: ReviewChecklistItem[]
  notes: string | null
  /** Due date the review addresses. */
  reviewDate: string | null
  /** Next due date (set in the Summary section; defaults at completion). */
  nextReviewAt: string | null
  reviewedAt: string
  /** Fund annual: the advisor's standing thoughts handed to the committee. */
  considerations: string | null
  /** Fund annual: set when handed off. Null means not yet requested. */
  committeeRequestedAt: string | null
}

function calcNextReview(cadence: PortfolioCadence, from = new Date()): Date {
  const d = new Date(from)
  if (cadence === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (cadence === 'quarterly') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d
}

/** Calendar day in UTC, for comparing two due dates that are really days. */
function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * The quarterly that belongs with an annual due on `annualDueAt`.
 *
 * Nine months before it — so the three quarterlies land at annual −9, −6 and
 * −3, and the annual itself takes the fourth slot. This is the invariant the
 * whole rule rests on, so it has one definition.
 */
export function quarterlyAnchorFor(annualDueAt: Date): Date {
  const d = new Date(annualDueAt)
  d.setMonth(d.getMonth() - 9)
  return d
}

/** What completing one review does to the portfolio's schedule. */
export interface ScheduleAdvance {
  /** New due date for the cadence just completed. */
  nextReviewAt: Date
  /**
   * Set when completing an ANNUAL: the quarterly is re-anchored to it, so the
   * next year's three quarterlies fall at +3, +6 and +9 months and the annual
   * takes the fourth slot.
   */
  quarterlyAt?: Date
}

/**
 * Advance the schedule after a review, so a portfolio runs **three quarterly
 * reviews and one annual**, never two on the same day.
 *
 * The annual REPLACES the fourth quarterly rather than adding to it. Before
 * Nov 2026 the two timers advanced independently — quarterly +3 months,
 * annual +12, each ignorant of the other — which gives four quarterlies and an
 * annual every year, and a guaranteed collision when the fourth quarterly
 * lands on the annual's own date. The seed trigger made it worse by starting
 * both at `now()`, so every portfolio was born colliding.
 *
 * The annual is the anchor. Completing it sets the next annual a year out and
 * drops the quarterly three months after it; completing a quarterly steps
 * three months unless that would reach the annual, in which case the annual
 * covers that slot and the quarterly moves to three months beyond it.
 *
 * `annualDueAt` is the portfolio's current annual due date, or null when it has
 * no annual row — in which case the quarterly simply steps, because there is
 * nothing to collide with.
 */
/**
 * The other cadences' due dates, which the rules below read.
 *
 * Named rather than positional: this is the second time the function has
 * needed more context, and two bare `Date | null` arguments in a row is the
 * shape that let `MarkReviewedModal`'s `isFund` disagree with its `security`.
 */
export interface OtherDueDates {
  annual: Date | null
  quarterly?: Date | null
}

/** How many months a monthly may be pushed before we stop trying. */
const MONTHLY_DODGE_LIMIT = 12

export function advanceSchedule(
  cadence: PortfolioCadence,
  completedAt: Date,
  due: OtherDueDates,
): ScheduleAdvance {
  const annualDueAt = due.annual

  if (cadence === 'monthly') {
    // A larger review ABSORBS the monthly that falls on its date — it carries
    // position sizing and performance attribution itself (`reviewTasksFor`),
    // so the monthly skips that month rather than standing beside it. Eight
    // monthlies, three quarterlies and an annual: twelve sittings, no two on
    // one day.
    //
    // Bounded rather than a single step, because real rows are not always
    // well formed — Foundation Conservative's annual sat overdue for weeks —
    // and a quarterly one month from the annual would otherwise dodge onto it.
    let next = calcNextReview('monthly', completedAt)
    const taken = [due.quarterly, annualDueAt].filter((d): d is Date => d != null)
    for (let i = 0; i < MONTHLY_DODGE_LIMIT && taken.some((t) => dayOf(t) === dayOf(next)); i++) {
      next = calcNextReview('monthly', next)
    }
    return { nextReviewAt: next }
  }

  if (cadence === 'annual') {
    const nextAnnual = calcNextReview('annual', completedAt)
    return { nextReviewAt: nextAnnual, quarterlyAt: quarterlyAnchorFor(nextAnnual) }
  }

  const stepped = calcNextReview('quarterly', completedAt)

  // The annual can only claim a slot it has not already missed. An OVERDUE
  // annual is a pending obligation, not a future review, and letting it claim
  // one pins the quarterly to `annual + 3 months` — a date on or BEFORE the
  // completion, so the quarterly stays due the moment it is completed, or
  // lands already overdue. Foundation Conservative was live in exactly that
  // state: annual overdue 30 Sept 2026, quarterly due 30 Dec; completing the
  // quarterly on its own due date returned that same day.
  const annualStillAhead = annualDueAt != null && dayOf(annualDueAt) > dayOf(completedAt)
  if (annualDueAt && annualStillAhead && dayOf(stepped) >= dayOf(annualDueAt)) {
    // The annual takes this slot; the next quarterly is a quarter past it.
    return { nextReviewAt: calcNextReview('quarterly', annualDueAt) }
  }
  return { nextReviewAt: stepped }
}

/** Next due date for a cadence, as an ISO string — used to pre-fill the modal. */
export function nextReviewDateFor(cadence: PortfolioCadence, from = new Date()): string {
  return calcNextReview(cadence, from).toISOString()
}

const SCHEDULE_COLS =
  'id, portfolio_name, cadence, last_reviewed_at, next_review_at, created_at, updated_at'

/** All portfolio review schedules across every portfolio, soonest-due first (dashboard/calendar). */
export async function fetchPortfolioReviewSchedules(): Promise<PortfolioReviewSchedule[]> {
  const { data, error } = await supabase
    .from('portfolio_review_schedules')
    .select(SCHEDULE_COLS)
    .order('next_review_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PortfolioReviewSchedule[]
}

/** The three cadence schedules for one portfolio. */
export async function fetchPortfolioReviewSchedulesFor(
  portfolioName: string,
): Promise<PortfolioReviewSchedule[]> {
  const { data, error } = await supabase
    .from('portfolio_review_schedules')
    .select(SCHEDULE_COLS)
    .eq('portfolio_name', portfolioName)
  if (error) throw error
  return (data ?? []) as PortfolioReviewSchedule[]
}

/** Completed reviews only (drafts are excluded from history). */
export async function fetchPortfolioReviews(portfolioName: string): Promise<PortfolioReview[]> {
  const { data, error } = await supabase
    .from('portfolio_review_log')
    .select('*')
    .eq('portfolio_name', portfolioName)
    .eq('status', 'completed')
    .order('reviewed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortfolioReview[]
}

const DRAFT_COLS = 'id, cadence, checklist, notes, review_date, next_review_at, reviewed_at, considerations, committee_requested_at'

function mapDraft(row: Record<string, unknown>): ReviewDraft {
  return {
    id: row.id as number,
    cadence: row.cadence as PortfolioCadence,
    checklist: (row.checklist as ReviewChecklistItem[] | null) ?? [],
    notes: (row.notes as string | null) ?? null,
    reviewDate: (row.review_date as string | null) ?? null,
    nextReviewAt: (row.next_review_at as string | null) ?? null,
    reviewedAt: row.reviewed_at as string,
    considerations: (row.considerations as string | null) ?? null,
    committeeRequestedAt: (row.committee_requested_at as string | null) ?? null,
  }
}

/**
 * Reconcile a stored checklist against the current task list: use the expected
 * order/labels, carry over `done`/`notes` for tasks already present, and add any
 * new tasks (e.g. position sizing). Returns null when nothing changed.
 */
function reconcileChecklist(
  stored: ReviewChecklistItem[],
  expected: ReviewTaskDef[],
): ReviewChecklistItem[] | null {
  const byKey = new Map(stored.map((i) => [i.key, i]))
  const merged: ReviewChecklistItem[] = expected.map((t) => {
    const prev = byKey.get(t.key)
    return { key: t.key, label: t.label, done: prev?.done ?? false, notes: prev?.notes ?? null }
  })
  const same =
    merged.length === stored.length &&
    merged.every((m, i) => stored[i]?.key === m.key && stored[i]?.label === m.label)
  return same ? null : merged
}

/**
 * Start a new draft review for a cadence, or resume the existing open draft.
 * At most one draft per (portfolio, cadence) exists (DB partial unique index).
 * A fresh draft seeds the checklist from the cadence's task list; a resumed draft
 * is reconciled against it so newly-added sections appear without losing progress.
 */
export async function startOrResumeDraft(
  portfolioName: string,
  cadence: PortfolioCadence,
  dueDate: string | null,
  strategy: string | null | undefined,
): Promise<ReviewDraft> {
  const { data: existing, error: findErr } = await supabase
    .from('portfolio_review_log')
    .select(DRAFT_COLS)
    .eq('portfolio_name', portfolioName)
    .eq('cadence', cadence)
    .eq('status', 'draft')
    .maybeSingle()
  if (findErr) throw findErr
  if (existing) {
    const draft = mapDraft(existing as Record<string, unknown>)
    const reconciled = reconcileChecklist(draft.checklist, reviewTasksFor(cadence, strategy))
    if (reconciled) {
      const { error: updErr } = await supabase
        .from('portfolio_review_log')
        .update({ checklist: reconciled as unknown as Json })
        .eq('id', draft.id)
      if (updErr) throw updErr
      draft.checklist = reconciled
    }
    return draft
  }

  const checklist: ReviewChecklistItem[] = reviewTasksFor(cadence, strategy).map((t) => ({
    key: t.key, label: t.label, done: false, notes: null,
  }))
  const { data, error } = await supabase
    .from('portfolio_review_log')
    .insert({
      portfolio_name: portfolioName,
      cadence,
      status: 'draft',
      reviewed_at: new Date().toISOString(),
      review_date: dueDate,
      checklist: checklist as unknown as Json,
    })
    .select(DRAFT_COLS)
    .single()
  if (error) throw error
  return mapDraft(data as Record<string, unknown>)
}

export interface SaveDraftFields {
  checklist: ReviewChecklistItem[]
  notes: string | null
  reviewDate?: Date | null
  nextReviewAt?: Date | null
}

/** Persist draft progress (checklist + notes + dates). Per-holding data saves separately. */
export async function saveReviewDraft(reviewLogId: number, fields: SaveDraftFields): Promise<void> {
  const patch: Record<string, unknown> = {
    checklist: fields.checklist as unknown as Json,
    notes: fields.notes?.trim() || null,
  }
  if (fields.reviewDate !== undefined) patch.review_date = fields.reviewDate ? fields.reviewDate.toISOString() : null
  if (fields.nextReviewAt !== undefined) patch.next_review_at = fields.nextReviewAt ? fields.nextReviewAt.toISOString() : null
  const { error } = await supabase.from('portfolio_review_log').update(patch).eq('id', reviewLogId)
  if (error) throw error
}

export interface CompleteReviewOptions {
  reviewLogId: number
  portfolioName: string
  cadence: PortfolioCadence
  checklist: ReviewChecklistItem[]
  notes?: string | null
  /** Completion date the advisor chose. */
  reviewedAt: Date
  reviewDate?: Date | null
  /** Next due date; falls back to the cadence interval from the completion date. */
  nextReviewAt?: Date | null
}

/**
 * Finalize a draft review: stamp it completed and advance the schedule.
 *
 * **Completing an ANNUAL also re-anchors the quarterly**, because the annual
 * replaces the fourth quarterly rather than adding to it — three quarterly
 * reviews and one annual per year, never two on the same day. See
 * `advanceSchedule`. Per-holding assessments are saved separately
 * (`saveHoldingReviews`).
 *
 * An explicit `nextReviewAt` from the Summary section still wins for the
 * cadence being completed: the advisor may know the next one has to move. The
 * re-anchored quarterly follows the date actually used, not the default, so
 * the two cannot end up inconsistent.
 */
export async function completeReview(opts: CompleteReviewOptions): Promise<void> {
  const { reviewLogId, portfolioName, cadence, checklist, notes, reviewedAt } = opts

  // The dates a smaller cadence must not land on: a quarterly dodges the
  // annual, a monthly dodges both. Read before writing anything.
  const { data: otherRows, error: otherError } = await supabase
    .from('portfolio_review_schedules')
    .select('cadence, next_review_at')
    .eq('portfolio_name', portfolioName)
    .in('cadence', ['annual', 'quarterly'])
  if (otherError) throw otherError
  const dueOf = (c: string): Date | null => {
    const raw = otherRows?.find((r) => r.cadence === c)?.next_review_at
    return raw ? new Date(raw) : null
  }
  const annualDueAt = dueOf('annual')

  const advance = advanceSchedule(cadence, reviewedAt, {
    annual: annualDueAt,
    quarterly: dueOf('quarterly'),
  })
  const chosenNext = opts.nextReviewAt ?? advance.nextReviewAt
  const nextReviewAt = chosenNext.toISOString()

  const { error: logError } = await supabase
    .from('portfolio_review_log')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      reviewed_at: reviewedAt.toISOString(),
      review_date: opts.reviewDate ? opts.reviewDate.toISOString() : null,
      next_review_at: nextReviewAt,
      notes: notes?.trim() || null,
      checklist: checklist as unknown as Json,
    })
    .eq('id', reviewLogId)
  if (logError) throw logError

  const { error: schedError } = await supabase
    .from('portfolio_review_schedules')
    .upsert(
      {
        portfolio_name: portfolioName,
        cadence,
        last_reviewed_at: reviewedAt.toISOString(),
        next_review_at: nextReviewAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'portfolio_name,cadence' },
    )
  if (schedError) throw schedError

  // Completing the annual moves the quarterly with it, so next year's three
  // quarterlies fall at +3, +6 and +9 and the annual takes the fourth slot.
  // Anchored on the date actually used for the annual, not the default.
  if (cadence === 'annual') {
    const quarterlyAt = quarterlyAnchorFor(chosenNext)
    const { error: qError } = await supabase
      .from('portfolio_review_schedules')
      .upsert(
        {
          portfolio_name: portfolioName,
          cadence: 'quarterly',
          next_review_at: quarterlyAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'portfolio_name,cadence' },
      )
    if (qError) throw qError
  }
}
