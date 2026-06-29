import { useQuery } from '@tanstack/react-query'
import { fetchPortfolioReviews, CADENCE_LABELS, type PortfolioCadence } from '@/lib/portfolioReviews'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'

interface PortfolioReviewLogProps {
  portfolioId: string
}

const CADENCE_BADGE: Record<PortfolioCadence, string> = {
  monthly:   'bg-sky-100 text-sky-700',
  quarterly: 'bg-violet-100 text-violet-700',
  annual:    'bg-amber-100 text-amber-700',
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
        <p className="text-sm text-gray-500">No portfolio reviews completed yet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Start a review above to document a periodic portfolio-level assessment.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => {
        const items = r.checklist ?? []
        const doneCount = items.filter((it) => it.done).length
        return (
          <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {formatDate(r.reviewed_at)}
                </span>
                {r.cadence && (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CADENCE_BADGE[r.cadence]}`}>
                    {CADENCE_LABELS[r.cadence]}
                  </span>
                )}
                {items.length > 0 && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {doneCount}/{items.length} tasks
                  </span>
                )}
              </div>
              {r.reviewed_by && <span className="text-xs text-gray-500">{r.reviewed_by}</span>}
            </div>

            {items.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {items.map((it) => (
                  <li key={it.key} className="flex items-start gap-2 text-sm">
                    <span className={it.done ? 'text-green-600' : 'text-gray-300'}>
                      {it.done ? '✓' : '○'}
                    </span>
                    <span className="text-gray-700">
                      {it.label}
                      {it.notes && <span className="text-gray-500"> — {it.notes}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {r.notes && <p className="mt-3 text-sm text-gray-600">{r.notes}</p>}
          </div>
        )
      })}
    </div>
  )
}
