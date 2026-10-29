/**
 * commentaryTimeline.ts
 *
 * Assembles the Commentary tab's per-quarter timeline: one row per earnings
 * call, carrying the documents written around it — the pre-earnings brief, the
 * post-earnings brief, the committee's call summary, and the transcript itself.
 *
 * Pure and React-free, because what counts as a row is a judgement about the
 * record rather than about layout:
 *
 * - **Transcript dates are the backbone**, not the briefs. Most quarters have no
 *   brief (56 pre-briefs span three months of a holding's history), so keying
 *   off briefs would hide every quarter whose transcript we can still serve.
 * - **A period with only a pre-brief still gets a row.** A pre-brief is written
 *   days BEFORE the call, so for the newest quarter there is no transcript yet;
 *   dropping that row would hide the forward-looking document at exactly the
 *   moment it is the only one that exists.
 * - **Rows are ordered by FISCAL PERIOD, never by call date.** FMP stamps the
 *   wrong calendar year on some Q4/Q1 dates — it dates Alphabet's FY2024 Q4 call
 *   `2024-02-04` and its FY2025 Q1 call `2024-04-24`, both a year early, though
 *   the transcripts themselves say "Fourth Quarter 2024" and "First Quarter
 *   2025". Sorting by date pushed those two below 2024's calls, and the
 *   eight-row cut then dropped them: GOOGL's table jumped Q2 2025 -> Q3 2024.
 *   2 of 42 held symbols carry the defect (also APP's FY2023 Q4). The period is
 *   the identity every row is keyed on anyway, so ordering by it is both correct
 *   and immune.
 * - **Several briefs of one type in one period is normal and is not collapsed.**
 *   The pre-earnings job's dedupe guard has slipped before (TJX carries three
 *   pre-briefs for Q2 2027), and showing one icon while silently dropping two
 *   would misreport the record. Each gets its own icon.
 */
import type { ResearchReport } from './researchReports'
import type { EarningsCallSummary } from './earningsCallSummaries'
import type { TranscriptDate } from './fmpTranscripts'

/** How many quarters the timeline shows; older ones drop off. */
export const TIMELINE_QUARTERS = 8

export interface CommentaryRow {
  /** `${fiscalYear}-Q${quarter}` — unique per row. */
  key: string
  fiscalYear: number
  quarter: number
  /** The call date, or null when the call has not happened or is not transcribed. */
  callDate: string | null
  /**
   * FMP's date for this call contradicts its own fiscal period — it falls before
   * a call of an EARLIER period. The date is shown but not asserted; see the
   * ordering note above.
   */
  dateSuspect: boolean
  pre: ResearchReport[]
  post: ResearchReport[]
  summary: EarningsCallSummary | null
}

/** `initial` / `update` reports — standing research, belonging to no quarter. */
export function standingReports(reports: ResearchReport[]): ResearchReport[] {
  return reports.filter((r) => r.fiscal_year == null || r.quarter == null)
}

const periodKey = (fy: number, q: number) => `${fy}-Q${q}`

/**
 * Newest fiscal period first. No date sentinel is needed for an upcoming
 * quarter: it is simply the highest period, so it sorts to the top on its own.
 */
function byPeriodDesc(a: CommentaryRow, b: CommentaryRow): number {
  return b.fiscalYear - a.fiscalYear || b.quarter - a.quarter
}

/**
 * Flag any row whose date falls before a call of an earlier period.
 *
 * Compares against the running MAX of all lower periods, not just the previous
 * one — on GOOGL the bad FY2024 Q4 date drags the (also wrong) FY2025 Q1 date
 * back above it, so a neighbour-only check would clear the second of the pair.
 */
function markSuspectDates(ascending: CommentaryRow[]): void {
  let highest: string | null = null
  for (const r of ascending) {
    if (!r.callDate) continue
    if (highest && r.callDate < highest) r.dateSuspect = true
    else highest = r.callDate
  }
}

export function buildCommentaryTimeline(
  dates: TranscriptDate[],
  reports: ResearchReport[],
  summaries: EarningsCallSummary[],
  limit: number = TIMELINE_QUARTERS,
): CommentaryRow[] {
  const rows = new Map<string, CommentaryRow>()

  const row = (fy: number, q: number): CommentaryRow => {
    const key = periodKey(fy, q)
    let r = rows.get(key)
    if (!r) {
      r = { key, fiscalYear: fy, quarter: q, callDate: null, dateSuspect: false, pre: [], post: [], summary: null }
      rows.set(key, r)
    }
    return r
  }

  for (const d of dates) row(d.fiscalYear, d.quarter).callDate = d.date

  for (const rep of reports) {
    if (rep.fiscal_year == null || rep.quarter == null) continue
    const r = row(rep.fiscal_year, rep.quarter)
    if (rep.report_type === 'pre_earnings') r.pre.push(rep)
    else if (rep.report_type === 'post_earnings') r.post.push(rep)
  }

  for (const s of summaries) row(s.fiscalYear, s.quarter).summary = s

  // Newest brief first within a period, so the icons read left-to-right in the
  // order they were written and the first one is the operative document.
  for (const r of rows.values()) {
    const newestFirst = (a: ResearchReport, b: ResearchReport) => b.created_at.localeCompare(a.created_at)
    r.pre.sort(newestFirst)
    r.post.sort(newestFirst)
  }

  const ordered = [...rows.values()].sort(byPeriodDesc)
  markSuspectDates([...ordered].reverse())
  return ordered.slice(0, limit)
}
