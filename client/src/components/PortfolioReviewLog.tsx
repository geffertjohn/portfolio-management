import { useQuery } from '@tanstack/react-query'
import { fetchPortfolioReviews } from '@/lib/portfolioReviews'
import { OUTCOME_LABELS, OUTCOME_COLORS } from '@/lib/reviewLog'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'

interface PortfolioReviewLogProps {
  portfolioId: string
}

export function PortfolioReviewLog({ portfolioId }: PortfolioReviewLogProps) {
  const { data: reviews = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.portfolioReviews(portfolioId),
    queryFn: () => fetchPortfolioReviews(portfolioId),
  })

  if (isLoading) return <p className="text-sm text-gray-500">Loading review history…</p>

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Failed to load reviews:{' '}
        {error instanceof Error ? error.message : String(error)}
      </p>
    )
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500">No portfolio reviews logged yet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Log a review to document your periodic portfolio-level assessment.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {formatDate(r.reviewed_at)}
              </span>
              {r.period && (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {r.period}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${OUTCOME_COLORS[r.outcome]}`}>
                {OUTCOME_LABELS[r.outcome]}
              </span>
            </div>
            <span className="text-xs text-gray-500">{r.reviewed_by}</span>
          </div>
          {r.notes && (
            <p className="mt-2 text-sm text-gray-600">{r.notes}</p>
          )}
        </div>
      ))}
    </div>
  )
}
