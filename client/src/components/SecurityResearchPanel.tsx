import { useQuery } from '@tanstack/react-query'
import { fetchResearchReports } from '@/lib/researchReports'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { ResearchCard } from '@/components/icReviewCards'

/**
 * Security-detail view of the AI team's research_reports for one security —
 * analyst reports plus the scheduled pre- and post-earnings briefs
 * (`report_type` = 'pre_earnings' / 'post_earnings'). Read-only; the reports are
 * produced by the research analyst in Claude Code.
 */
export function SecurityResearchPanel({ securityId }: { securityId: string }) {
  const { data: reports = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.researchReports(securityId),
    queryFn: () => fetchResearchReports(securityId),
    enabled: !!securityId,
  })

  const byId = new Map(reports.map((r) => [r.id, r.created_at]))

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">AI Research &amp; Briefs</h2>
      <p className="mt-1 text-xs text-gray-400">
        Analyst reports and pre/post-earnings briefs from the AI research team. Read-only.
      </p>
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-gray-400">No AI research yet for this security.</p>
        ) : (
          <div className="space-y-4">
            {/* A post-earnings brief names the brief it answers. Both are in this
                same list, so resolve the date here rather than making the card
                fetch its own parent. */}
            {reports.map((r) => (
              <ResearchCard
                key={r.id}
                r={r}
                parentDate={r.parent_report_id != null ? byId.get(r.parent_report_id) ?? null : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
