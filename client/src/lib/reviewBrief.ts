/**
 * reviewBrief.ts
 *
 * Assembles the quarterly brief that a stock review's evidence PDF carries.
 *
 * A review is earnings-driven — `next_review_at` is the next earnings date
 * plus a day — so the review falls due the same morning the post-earnings
 * brief is written, and the modal already pre-fills its rationale from that
 * brief. This resolves the rest of that quarter's documents so the review's PDF
 * can staple the brief on as its second half.
 *
 * **A null brief is a real answer.** Most quarters carry no post-earnings brief
 * and no call summary, and `canBuildQuarterlyBrief` refuses to build one from
 * expectations alone — a brief written from a pre-brief would describe a
 * quarter nobody has lived through. The review is still recorded; the document
 * says which quarter had nothing rather than omitting the section.
 */
import { buildQuarterlyBrief, type QuarterlyBrief } from './quarterlyBrief'
import { fetchCallSummary } from './earningsCallSummaries'
import { fetchResearchReports, type ResearchReport } from './researchReports'

export interface ReviewBriefSource {
  brief: QuarterlyBrief | null
  /** Why there is no brief — rendered in the PDF in place of one. */
  absentReason: string | null
  /** The report the review was drafted from → `review_log.source_report_id`. */
  sourceReportId: number | null
}

const NO_BRIEF = 'No post-earnings brief has been written for this security, so the review was not drafted from one.'

/**
 * Resolve the brief for the quarter a review addresses.
 *
 * Keyed on the POST-BRIEF's own `(fiscal_year, quarter)` rather than on the
 * review date. The period a review concerns is the one its brief concerns, and
 * the two diverge whenever a review is recorded late — which is exactly when a
 * date-derived guess picks the wrong quarter.
 */
export async function fetchReviewQuarterlyBrief(
  securityId: string,
  companyName: string | null,
  postBrief: ResearchReport | null,
): Promise<ReviewBriefSource> {
  if (!postBrief) return { brief: null, absentReason: NO_BRIEF, sourceReportId: null }

  const { fiscal_year: fy, quarter: q } = postBrief
  if (fy == null || q == null) {
    return {
      brief: null,
      sourceReportId: postBrief.id,
      absentReason:
        'The post-earnings brief this review was drafted from records no fiscal period, so its quarter could not be assembled.',
    }
  }

  // The pre-brief is the one this post-brief answers; a post-brief cannot exist
  // without a parent, but the FK is ON DELETE SET NULL so it may be absent.
  const [reports, summary] = await Promise.all([
    fetchResearchReports(securityId),
    fetchCallSummary(securityId, fy, q),
  ])
  const preBrief = postBrief.parent_report_id != null
    ? reports.find((r) => r.id === postBrief.parent_report_id) ?? null
    : null

  return {
    sourceReportId: postBrief.id,
    absentReason: null,
    brief: buildQuarterlyBrief({
      ticker: securityId,
      companyName,
      fiscalYear: fy,
      quarter: q,
      callDate: summary?.callDate ?? null,
      preBrief,
      postBrief,
      summary,
    }),
  }
}
