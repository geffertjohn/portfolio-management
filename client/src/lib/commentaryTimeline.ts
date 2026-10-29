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
 * Sort newest-first. A row with no call date is an UPCOMING quarter, so it sorts
 * above every dated row — hence the sentinel rather than treating null as empty.
 */
function sortKey(r: CommentaryRow): string {
  return `${r.callDate ?? '9999-12-31'}|${r.fiscalYear}|${r.quarter}`
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
      r = { key, fiscalYear: fy, quarter: q, callDate: null, pre: [], post: [], summary: null }
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

  return [...rows.values()]
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .slice(0, limit)
}
