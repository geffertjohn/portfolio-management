import { useQuery } from '@tanstack/react-query'
import { fetchRiskReports } from '@/lib/riskReports'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { RiskCard } from '@/components/icReviewCards'

/**
 * Portfolio-detail view of the AI team's portfolio-scope risk reports — the weekly
 * risk snapshot (concentration + factor drift) produced by the risk manager in Claude
 * Code. Candidate-scoped risk assessments live in the candidate workspace, so this
 * filters to scope='portfolio'. Read-only.
 */
export function PortfolioRiskPanel({ portfolioName }: { portfolioName: string }) {
  const { data: all = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.riskReports(portfolioName),
    queryFn: () => fetchRiskReports(portfolioName),
    enabled: !!portfolioName,
  })
  const reports = all.filter((r) => r.scope === 'portfolio')

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">AI Risk Reports</h2>
      <p className="mt-1 text-xs text-gray-400">
        Weekly concentration + factor-risk snapshots of the current book, from the AI risk manager. Read-only.
      </p>
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-gray-400">No AI risk reports yet for this portfolio.</p>
        ) : (
          <div className="space-y-4">
            {reports.map((r) => <RiskCard key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
