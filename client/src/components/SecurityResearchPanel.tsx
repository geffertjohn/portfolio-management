/**
 * SecurityResearchPanel
 *
 * The security's documented commentary record: the AI team's standing research
 * reports, then an eight-quarter timeline of the documents written around each
 * earnings call (pre-earnings brief, post-earnings brief, quarterly brief, and
 * the transcript with the committee's read of it).
 *
 * Read-only; the reports are produced by the research analyst in Claude Code.
 *
 * Standing research sits ABOVE the table because `initial` and `update` reports
 * carry no period — an interim note written mid-quarter belongs to no call, and
 * a period-keyed table has nowhere to put it. They are few (most securities have
 * none) and they are the durable view, so they read first.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchResearchReports } from '@/lib/researchReports'
import { fetchTranscriptDates } from '@/lib/fmpTranscripts'
import { fetchCallSummaries } from '@/lib/earningsCallSummaries'
import { buildCommentaryTimeline, standingReports, TIMELINE_QUARTERS } from '@/lib/commentaryTimeline'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { ResearchCard } from '@/components/icReviewCards'
import { CommentaryTimeline } from '@/components/CommentaryTimeline'

export function SecurityResearchPanel({
  securityId,
  companyName = null,
  nextEarningsDate = null,
}: {
  securityId: string
  companyName?: string | null
  nextEarningsDate?: string | null
}) {
  const enabled = !!securityId

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: QUERY_KEYS.researchReports(securityId),
    queryFn: () => fetchResearchReports(securityId),
    enabled,
  })

  const { data: dates = [], isLoading: datesLoading } = useQuery({
    queryKey: QUERY_KEYS.transcriptDates(securityId),
    queryFn: () => fetchTranscriptDates(securityId),
    enabled,
    staleTime: 1000 * 60 * 60 * 6,
    retry: false,
  })

  const { data: summaries = [] } = useQuery({
    queryKey: QUERY_KEYS.callSummaries(securityId),
    queryFn: () => fetchCallSummaries(securityId),
    enabled,
  })

  const standing = standingReports(reports)
  const rows = buildCommentaryTimeline(dates, reports, summaries)
  const byId = new Map(reports.map((r) => [r.id, r.created_at]))

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">AI Research &amp; Briefs</h2>
      <p className="mt-1 text-xs text-gray-400">
        Analyst reports and the last {TIMELINE_QUARTERS} quarters of earnings briefs, call
        summaries and transcripts. Read-only.
      </p>

      {standing.length > 0 && (
        <div className="mt-4 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Standing research
          </h3>
          {standing.map((r) => (
            <ResearchCard
              key={r.id}
              r={r}
              parentDate={r.parent_report_id != null ? byId.get(r.parent_report_id) ?? null : null}
            />
          ))}
        </div>
      )}

      <div className="mt-4">
        <CommentaryTimeline
          securityId={securityId}
          companyName={companyName}
          rows={rows}
          isLoading={reportsLoading || datesLoading}
          nextEarningsDate={nextEarningsDate}
        />
      </div>
    </div>
  )
}
