import { useQuery } from '@tanstack/react-query'
import { fetchResearchReports } from '@/lib/researchReports'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { ResearchCard } from '@/components/icReviewCards'

/**
 * Security-detail view of the AI team's research_reports for one security —
 * analyst reports and the scheduled pre-earnings briefs (report_type='earnings_review').
 * Read-only; the reports are produced by the research analyst in Claude Code.
 */
export function SecurityResearchPanel({ securityId }: { securityId: string }) {
  const { data: reports = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.researchReports(securityId),
    queryFn: () => fetchResearchReports(securityId),
    enabled: !!securityId,
  })

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">AI Research &amp; Briefs</h2>
      <p className="mt-1 text-xs text-gray-400">
        Analyst reports and pre-earnings briefs from the AI research team. Read-only.
      </p>
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-gray-400">No AI research yet for this security.</p>
        ) : (
          <div className="space-y-4">
            {reports.map((r) => <ResearchCard key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
