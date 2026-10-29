/**
 * researchReports.ts
 *
 * Data-access layer for the AI investment team's `research_reports` deliverable
 * (see docs/ai-investment-team-charter.md). One row per analyst / devil's-advocate
 * report on a security — thesis, bull/bear cases, a fair-value estimate with its
 * assumptions, a rating, and cited sources. Recommend-only; recorded, never acted on.
 *
 * `security_id` is the text ticker (no FK — a candidate may not be in securities2 yet).
 * Soft-deleted via `deleted_at`.
 */
import { supabase } from './supabase'
import type { Json } from '@/types/database.types'

/**
 * `pre_earnings` was called `earnings_review` until Oct 2026, when the
 * post-earnings counterpart arrived and the old name stopped distinguishing
 * anything. The 30 existing briefs were all pre-earnings and were renamed.
 */
export type ReportType = 'initial' | 'pre_earnings' | 'post_earnings' | 'update'
export type Rating = 'buy' | 'add' | 'hold' | 'trim' | 'sell'
export type Conviction = 'high' | 'medium' | 'low'
export type ReportStatus = 'draft' | 'final'
/** Which agent authored the report — free-form, but these are the expected roles. */
export type AuthorRole = 'research_analyst' | 'devils_advocate' | 'quant_analyst' | (string & {})

export interface Citation { title?: string; url?: string; note?: string }

// ── Earnings briefs — two sections ──────────────────────────────────────────
//
// SECTION 1 "The Street": what the market expects (`estimates`) and what it wants
// answered on the call (`street_questions`).
// SECTION 2 "Thesis Evaluation": the firm's own reasons for owning it
// (`thesis_checks`) and its own bear case (`risk_checks`), carried from the
// security's `security_theses` record.
//
// Every shape is filled from BOTH ends: the pre-brief states the expectation, the
// post-brief copies those fields forward unchanged and appends the outcome. One
// shape per concept, so a card renders either brief without branching and a
// resolved row still shows what was asked.

/** How a figure is rendered. Revenue/EBITDA are raw dollars; margin is a decimal. */
export type EstimateUnit = 'usd' | 'usd_large' | 'pct'

/** One row of the Section 1 estimates table. */
export interface EstimateRow {
  key: 'eps' | 'revenue' | 'ebitda' | 'ebitda_margin' | (string & {})
  label: string
  unit: EstimateUnit
  /** PRE: consensus (or the company's own guide — say which in `source`). */
  estimate: number | null
  low?: number | null
  high?: number | null
  analysts?: number | null
  /** Where the estimate came from, e.g. 'FMP consensus (24 analysts)' or 'company guide'. */
  source?: string | null
  /** POST: what was actually printed. */
  actual?: number | null
  /** POST: (actual − estimate) / |estimate|, as a decimal. */
  surprisePct?: number | null
  note?: string | null
}

/** Did the call answer it? */
export type AnswerState = 'yes' | 'partial' | 'no'

/** A question the street wants settled on this call (Section 1). */
export interface StreetQuestion {
  key: string
  question: string
  /** Why the street cares — what turns on the answer. */
  why?: string | null
  /** POST: */
  answered?: AnswerState | null
  answer?: string | null
}

/** How the print bore on one thesis reason or bear point. */
export type CheckStatus = 'supported' | 'mixed' | 'undermined' | 'not_addressed'

/**
 * One Section 2 item, used for BOTH halves — `thesis_checks` (why we own it) and
 * `risk_checks` (what would break it). Carried from `security_theses`, so `test`
 * is that document's own break test verbatim and an earnings call becomes a
 * re-measurement of the thesis of record rather than a fresh opinion.
 */
export interface ThesisCheck {
  /** The thesis reason / bull metric / bear point key it came from. */
  key: string
  title: string
  /** The named series the thesis says to re-measure. */
  metric?: string | null
  /** The thesis's own `breaksIf` (bull) or worsens-if (bear), verbatim. */
  test: string
  /** PRE: what in THIS print bears on that test. */
  watchFor?: string | null
  /** POST: */
  status?: CheckStatus | null
  finding?: string | null
}

/**
 * What the review should do about the position, per portfolio.
 *
 * No `buy` — a security under review is already held, so adding to it is `add`.
 * Mirrors `Recommendation` in lib/reviewLog.ts and the review_log CHECK.
 */
export type ReviewAction = 'add' | 'hold' | 'trim' | 'sell'

/**
 * One portfolio's recommendation, produced by the post-earnings job.
 *
 * Reviews are earnings-driven, so the brief is written the day the review falls
 * due — which is why it carries this rather than a separate job. Add/trim is an
 * ALLOCATION act, so there is one entry per portfolio holding the security: the
 * same print can mean trim at a 7% weight and hold at 3%.
 *
 * `openQuestions` is the field that earns its place. A recommendation that a
 * deteriorating metric is explained is only as good as the question it leaves
 * open — on META, operating and FCF margin both fell hard, one because of a
 * one-time legal charge and the other because capex ran to 43% of revenue, and
 * the thing worth recording is "is that capex building revenue or a treadmill?"
 */
export interface ReviewRecommendation {
  portfolioName: string
  /** Target weight in that portfolio at the time the brief was written. */
  weightPct: number | null
  recommendation: ReviewAction
  /**
   * How firmly the committee holds that recommendation, same vocabulary as
   * `review_log.conviction`. Per-portfolio like the recommendation it qualifies:
   * the same call can be firm at one weight and marginal at another. Optional,
   * because briefs written before Oct 2026 carry no conviction.
   */
  conviction?: Conviction | null
  /** Why — reconciling the scorecard against the thesis and this print. */
  rationale: string
  /** How the Monitor scorecard read, and which moves the print explains. */
  scorecardRead?: string | null
  /** What would change the call, and is not settled by this print. */
  openQuestions?: string[] | null
}

/**
 * How a post-earnings brief judged one of the pre-brief's watch-items.
 * @deprecated Superseded by the two-section shapes above (Oct 2026).
 */
export type WatchVerdict = 'hit' | 'miss' | 'unclear'

/**
 * One "what actually matters this print" item, carried across both briefs.
 *
 * The PRE brief sets `key`/`title`/`detail` — what to watch and what the bar is.
 * The POST brief copies those forward unchanged and adds `verdict`/`actual`/
 * `note`. Same shape from both ends, so the card renders either without
 * branching on report type, and a resolved item still shows what was asked.
 */
export interface WatchItem {
  key: string
  title: string
  detail?: string | null
  verdict?: WatchVerdict | null
  actual?: string | null
  note?: string | null
}

/** Post-earnings verdict. Same vocabulary as `holding_reviews.thesis_status`. */
export type ThesisStatus = 'intact' | 'at_risk' | 'broken'

export interface ResearchReport {
  id: number
  security_id: string
  portfolio_name: string | null
  addition_id: number | null
  author_role: AuthorRole
  report_type: ReportType
  /** The pre-earnings brief a post-earnings brief answers. Required for `post_earnings`. */
  parent_report_id: number | null
  /** Which `security_theses` version Section 2 was graded against. */
  thesis_id: number | null
  /**
   * The earnings call this brief concerns — the same identity as
   * `earnings_call_summaries`, so briefs, the committee's call summary and the
   * transcript all line up on one key in the Commentary timeline.
   *
   * Null for `initial` / `update` reports: standing research belongs to no
   * quarter. A CHECK keeps the pair whole (both set or both null), and a
   * pre-brief written for a call that has not happened yet carries the UPCOMING
   * period — otherwise the brief would be invisible until the transcript landed,
   * which is exactly when it is most wanted.
   */
  fiscal_year: number | null
  quarter: number | null
  /** Section 1 — the street. */
  estimates: EstimateRow[] | null
  street_questions: StreetQuestion[] | null
  /** Section 2 — thesis evaluation. */
  thesis_checks: ThesisCheck[] | null
  risk_checks: ThesisCheck[] | null
  /** Per-portfolio review recommendations; pre-fills the stock review modal. */
  review_recommendations: ReviewRecommendation[] | null
  /** @deprecated superseded by the four fields above. */
  watch_items: WatchItem[] | null
  thesis_status: ThesisStatus | null
  thesis: string | null
  bull_case: string | null
  bear_case: string | null
  rating: Rating | null
  conviction: Conviction | null
  fair_value: number | null
  current_price: number | null
  dcf_inputs: Record<string, unknown> | null
  valuation_summary: Record<string, unknown> | null
  sources: Citation[] | null
  status: ReportStatus
  created_at: string
  deleted_at: string | null
}

const COLS =
  'id, security_id, portfolio_name, addition_id, author_role, report_type, parent_report_id, thesis_id, fiscal_year, quarter, estimates, street_questions, thesis_checks, risk_checks, review_recommendations, watch_items, thesis_status, thesis, bull_case, bear_case, rating, conviction, fair_value, current_price, dcf_inputs, valuation_summary, sources, status, created_at, deleted_at'

function mapRow(r: Record<string, unknown>): ResearchReport {
  return {
    id: r.id as number,
    security_id: r.security_id as string,
    portfolio_name: (r.portfolio_name as string | null) ?? null,
    addition_id: (r.addition_id as number | null) ?? null,
    author_role: r.author_role as AuthorRole,
    report_type: r.report_type as ReportType,
    parent_report_id: (r.parent_report_id as number | null) ?? null,
    thesis_id: (r.thesis_id as number | null) ?? null,
    fiscal_year: (r.fiscal_year as number | null) ?? null,
    quarter: (r.quarter as number | null) ?? null,
    estimates: (r.estimates as EstimateRow[] | null) ?? null,
    street_questions: (r.street_questions as StreetQuestion[] | null) ?? null,
    thesis_checks: (r.thesis_checks as ThesisCheck[] | null) ?? null,
    risk_checks: (r.risk_checks as ThesisCheck[] | null) ?? null,
    review_recommendations: (r.review_recommendations as ReviewRecommendation[] | null) ?? null,
    watch_items: (r.watch_items as WatchItem[] | null) ?? null,
    thesis_status: (r.thesis_status as ThesisStatus | null) ?? null,
    thesis: (r.thesis as string | null) ?? null,
    bull_case: (r.bull_case as string | null) ?? null,
    bear_case: (r.bear_case as string | null) ?? null,
    rating: (r.rating as Rating | null) ?? null,
    conviction: (r.conviction as Conviction | null) ?? null,
    fair_value: (r.fair_value as number | null) ?? null,
    current_price: (r.current_price as number | null) ?? null,
    dcf_inputs: (r.dcf_inputs as Record<string, unknown> | null) ?? null,
    valuation_summary: (r.valuation_summary as Record<string, unknown> | null) ?? null,
    sources: (r.sources as Citation[] | null) ?? null,
    status: r.status as ReportStatus,
    created_at: r.created_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** All non-deleted reports for a security, newest first. */
export async function fetchResearchReports(securityId: string): Promise<ResearchReport[]> {
  const { data, error } = await supabase
    .from('research_reports')
    .select(COLS)
    .eq('security_id', securityId.toUpperCase())
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

/** All non-deleted reports tied to a specific candidate (new-buy) draft, newest first. */
/**
 * The most recent post-earnings brief for a security — what the stock review
 * pre-fills from.
 *
 * Reviews are earnings-driven (`next_review_at` = `next_earnings_release + 1
 * day`), so the newest post-brief is normally the one written for the print the
 * review is about. No age filter: a hard cutoff would blank the field on exactly
 * the names that go longest between prints, and the caller shows the brief's own
 * date so staleness is visible rather than guessed at.
 */
export async function fetchLatestPostEarningsBrief(securityId: string): Promise<ResearchReport | null> {
  const { data, error } = await supabase
    .from('research_reports')
    .select(COLS)
    .eq('security_id', securityId)
    .eq('report_type', 'post_earnings')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data as Record<string, unknown>) : null
}

/**
 * Turn the per-portfolio recommendations into the review's rationale text.
 *
 * Kept here rather than in the modal because it is pure and it is a judgement
 * about the record, not about layout: where every portfolio agrees the advisor
 * reads one rationale, and where they differ each book is named with its weight,
 * because that disagreement IS the finding. Open questions follow, de-duplicated
 * — on META the same capex question applies at every weight.
 */
export function composeReviewRationale(
  recs: ReviewRecommendation[],
  briefDate: string,
): string {
  if (recs.length === 0) return ''
  const when = new Date(briefDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const unanimous = recs.every((r) => r.recommendation === recs[0].recommendation)

  const body = unanimous
    ? recs[0].rationale
    : recs
        .map((r) => `${r.portfolioName} (${r.weightPct ?? '—'}%) — ${r.recommendation.toUpperCase()}: ${r.rationale}`)
        .join('\n\n')

  const scorecard = recs.find((r) => r.scorecardRead)?.scorecardRead
  const questions = [...new Set(recs.flatMap((r) => r.openQuestions ?? []))]

  return [
    body,
    scorecard ? `Scorecard: ${scorecard}` : null,
    questions.length ? `Open questions:\n${questions.map((q) => `• ${q}`).join('\n')}` : null,
    `(Drafted from the post-earnings brief of ${when}. Edit before recording.)`,
  ].filter(Boolean).join('\n\n')
}

export async function fetchResearchReportsForAddition(additionId: number): Promise<ResearchReport[]> {
  const { data, error } = await supabase
    .from('research_reports')
    .select(COLS)
    .eq('addition_id', additionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

export interface NewResearchReport {
  security_id: string
  author_role: AuthorRole
  portfolio_name?: string | null
  addition_id?: number | null
  report_type?: ReportType
  parent_report_id?: number | null
  thesis_id?: number | null
  fiscal_year?: number | null
  quarter?: number | null
  estimates?: EstimateRow[] | null
  street_questions?: StreetQuestion[] | null
  thesis_checks?: ThesisCheck[] | null
  risk_checks?: ThesisCheck[] | null
  review_recommendations?: ReviewRecommendation[] | null
  watch_items?: WatchItem[] | null
  thesis_status?: ThesisStatus | null
  thesis?: string | null
  bull_case?: string | null
  bear_case?: string | null
  rating?: Rating | null
  conviction?: Conviction | null
  fair_value?: number | null
  current_price?: number | null
  dcf_inputs?: Record<string, unknown> | null
  valuation_summary?: Record<string, unknown> | null
  sources?: Citation[] | null
  status?: ReportStatus
}

export async function insertResearchReport(input: NewResearchReport): Promise<number> {
  const { data, error } = await supabase
    .from('research_reports')
    .insert({
      security_id: input.security_id.toUpperCase(),
      author_role: input.author_role,
      portfolio_name: input.portfolio_name ?? null,
      addition_id: input.addition_id ?? null,
      report_type: input.report_type ?? 'initial',
      parent_report_id: input.parent_report_id ?? null,
      thesis_id: input.thesis_id ?? null,
      fiscal_year: input.fiscal_year ?? null,
      quarter: input.quarter ?? null,
      estimates: (input.estimates ?? null) as unknown as Json,
      street_questions: (input.street_questions ?? null) as unknown as Json,
      thesis_checks: (input.thesis_checks ?? null) as unknown as Json,
      risk_checks: (input.risk_checks ?? null) as unknown as Json,
      review_recommendations: (input.review_recommendations ?? null) as unknown as Json,
      watch_items: (input.watch_items ?? null) as unknown as Json,
      thesis_status: input.thesis_status ?? null,
      thesis: input.thesis ?? null,
      bull_case: input.bull_case ?? null,
      bear_case: input.bear_case ?? null,
      rating: input.rating ?? null,
      conviction: input.conviction ?? null,
      fair_value: input.fair_value ?? null,
      current_price: input.current_price ?? null,
      dcf_inputs: (input.dcf_inputs ?? null) as unknown as Json,
      valuation_summary: (input.valuation_summary ?? null) as unknown as Json,
      sources: (input.sources ?? null) as unknown as Json,
      status: input.status ?? 'final',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function softDeleteResearchReport(id: number): Promise<void> {
  const { error } = await supabase
    .from('research_reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
