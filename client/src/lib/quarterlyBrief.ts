/**
 * quarterlyBrief.ts
 *
 * The quarter's story for ONE security, assembled from the three documents
 * written around its earnings call: the pre-earnings brief (what was expected),
 * the committee's call summary (what was said), and the post-earnings brief
 * (what it meant). Nothing new is researched here — this is a RENDERING of the
 * record, which is why it needs no table of its own and can never go stale.
 *
 * Pure and React-free: it is the single source for both the on-screen view and
 * the PDF, the same split `lib/fundScorecard.ts` uses. Re-deriving any of this
 * inside a component is how the document and the page start disagreeing.
 *
 * **This is shaped to be safe to hand to a client**, which is the whole reason
 * it is not simply the internal brief with a different cover. Deliberately left
 * OUT, and not by oversight:
 *
 * - **`review_recommendations`** — per-portfolio add/trim/sell calls with target
 *   weights. This is our allocation decision, not the company's quarter, and it
 *   is the one thing in the record that must never reach a client document.
 * - **`openQuestions`** and conviction — internal; they describe how firmly WE
 *   hold a view, not what happened.
 * - **The thesis break tests** (`ThesisCheck.test` / `watchFor`) — process
 *   mechanics in our own vocabulary. The `finding` they produced is plain
 *   English and is kept; the tripwire behind it is not.
 * - **Estimate ranges and analyst counts** — the consensus figure and the
 *   surprise carry the point; the distribution is detail a reader does not need.
 * - **`street_questions`** — what the market wanted asked. Interesting
 *   internally, but it is the single largest block in the internal brief and
 *   reads as inside baseball.
 */
import type {
  EstimateRow, ResearchReport, ThesisCheck, ThesisStatus,
} from './researchReports'
import type { CallPoint, CallSentiment, EarningsCallSummary } from './earningsCallSummaries'

/** One line of "what was expected, what was printed". */
export interface ResultRow {
  label: string
  unit: EstimateRow['unit']
  expected: number | null
  actual: number | null
  surprisePct: number | null
}

/** One reading on the thesis, stripped of the test that produced it. */
export interface ViewPoint {
  title: string
  status: ThesisCheck['status']
  finding: string
}

export interface QuarterlyBrief {
  ticker: string
  companyName: string | null
  fiscalYear: number
  quarter: number
  callDate: string | null
  /** The quarter in a paragraph. */
  headline: string | null
  sentiment: CallSentiment | null
  results: ResultRow[]
  /** True once anything has printed; before that the table is expectations only. */
  hasActuals: boolean
  guidance: string | null
  highlights: CallPoint[]
  lowlights: CallPoint[]
  thesisStatus: ThesisStatus | null
  view: ViewPoint[]
  /** Which documents this was drawn from — the provenance line in the footer. */
  sources: string[]
}

export interface QuarterlyBriefInput {
  ticker: string
  companyName: string | null
  fiscalYear: number
  quarter: number
  callDate: string | null
  preBrief: ResearchReport | null
  postBrief: ResearchReport | null
  summary: EarningsCallSummary | null
}

/**
 * A quarter can only be written up once there is something to report.
 *
 * A pre-brief ALONE is not enough: it is a statement of expectations for a call
 * that has not happened, so a "brief" built from it would describe a quarter
 * nobody has lived through yet.
 */
export function canBuildQuarterlyBrief(row: {
  post: ResearchReport[]
  summary: EarningsCallSummary | null
}): boolean {
  return row.post.length > 0 || !!row.summary
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso.split(/[\sT]/)[0] + 'T12:00:00')
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Merge the two briefs' estimate rows into one results table.
 *
 * The post-brief carries the pre-brief's rows forward unchanged and appends the
 * actuals, so it is preferred outright where it exists; the pre-brief only fills
 * a row the post one never carried.
 */
function buildResults(pre: ResearchReport | null, post: ResearchReport | null): ResultRow[] {
  const byKey = new Map<string, EstimateRow>()
  for (const r of pre?.estimates ?? []) byKey.set(r.key, r)
  for (const r of post?.estimates ?? []) byKey.set(r.key, r)
  return [...byKey.values()].map((r) => ({
    label: r.label,
    unit: r.unit,
    expected: r.estimate ?? null,
    actual: r.actual ?? null,
    surprisePct: r.surprisePct ?? null,
  }))
}

/**
 * The readings on the thesis, from both halves of Section 2.
 *
 * `not_addressed` is dropped: "the quarter did not speak to this" is a
 * legitimate internal outcome but it is noise in a document meant to say what
 * happened. A check with no finding is dropped for the same reason.
 */
function buildView(post: ResearchReport | null): ViewPoint[] {
  const all: ThesisCheck[] = [...(post?.thesis_checks ?? []), ...(post?.risk_checks ?? [])]
  return all
    .filter((c) => c.finding?.trim() && c.status && c.status !== 'not_addressed')
    .map((c) => ({ title: c.title, status: c.status ?? null, finding: (c.finding ?? '').trim() }))
}

export function buildQuarterlyBrief(input: QuarterlyBriefInput): QuarterlyBrief {
  const { ticker, companyName, fiscalYear, quarter, callDate, preBrief, postBrief, summary } = input

  const results = buildResults(preBrief, postBrief)
  const sources: string[] = []
  if (preBrief) sources.push(`pre-earnings brief of ${fmtDateShort(preBrief.created_at)}`)
  if (summary) sources.push(`committee call summary${summary.callDate ? ` of ${fmtDateShort(summary.callDate)}` : ''}`)
  if (postBrief) sources.push(`post-earnings brief of ${fmtDateShort(postBrief.created_at)}`)

  return {
    ticker,
    companyName,
    fiscalYear,
    quarter,
    callDate,
    // The post-brief's commentary is the account of the print; the call summary's
    // read of the call stands in when no post-brief was written.
    headline: postBrief?.thesis?.trim() || summary?.sentimentSummary?.trim() || null,
    sentiment: summary?.sentiment ?? null,
    results,
    hasActuals: results.some((r) => r.actual != null),
    guidance: summary?.guidance?.trim() || null,
    highlights: summary?.highlights ?? [],
    lowlights: summary?.lowlights ?? [],
    thesisStatus: postBrief?.thesis_status ?? null,
    view: buildView(postBrief),
    sources,
  }
}

/** Display label for a results figure, by the unit the brief recorded. */
export const SENTIMENT_LABEL: Record<CallSentiment, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
}

export const THESIS_STATUS_LABEL: Record<ThesisStatus, string> = {
  intact: 'Intact',
  at_risk: 'At risk',
  broken: 'Broken',
}

export const VIEW_STATUS_LABEL: Record<'supported' | 'mixed' | 'undermined', string> = {
  supported: 'Supported',
  mixed: 'Mixed',
  undermined: 'Undermined',
}
