import { useQuery } from '@tanstack/react-query'
import { fetchPortfolioReviews, CADENCE_LABELS, type PortfolioCadence } from '@/lib/portfolioReviews'
import { fetchHoldingReviewsByPortfolio, ACTION_LABELS, type HoldingReviewRow } from '@/lib/holdingReviews'
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

/** "Hold 8 · Trim 2 · Watchlist 1" — action breakdown for a review's holding assessments. */
function actionBreakdown(rows: HoldingReviewRow[]): string {
  const counts = new Map<string, number>()
  for (const r of rows) if (r.action) counts.set(r.action, (counts.get(r.action) ?? 0) + 1)
  return [...counts.entries()].map(([a, n]) => `${ACTION_LABELS[a as keyof typeof ACTION_LABELS] ?? a} ${n}`).join(' · ')
}

export function PortfolioReviewLog({ portfolioId }: PortfolioReviewLogProps) {
  const { data: reviews = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.portfolioReviews(portfolioId),
    queryFn: () => fetchPortfolioReviews(portfolioId),
  })

  const { data: holdingReviews = [] } = useQuery({
    queryKey: QUERY_KEYS.holdingReviews(portfolioId),
    queryFn: () => fetchHoldingReviewsByPortfolio(portfolioId),
  })
  const holdingsByLog = new Map<number, HoldingReviewRow[]>()
  for (const hr of holdingReviews) {
    const list = holdingsByLog.get(hr.review_log_id) ?? []
    list.push(hr)
    holdingsByLog.set(hr.review_log_id, list)
  }

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
        const holdings = holdingsByLog.get(r.id) ?? []
        const atRisk = holdings.filter((h) => h.thesisStatus === 'at_risk' || h.thesisStatus === 'broken').length
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

            {holdings.length > 0 && (
              <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs">
                <span className="font-medium text-gray-700">{holdings.length} holdings assessed</span>
                {actionBreakdown(holdings) && <span className="text-gray-500"> — {actionBreakdown(holdings)}</span>}
                {atRisk > 0 && <span className="ml-1 font-medium text-amber-700">· {atRisk} thesis at-risk/broken</span>}
              </div>
            )}

            {r.notes && <p className="mt-3 text-sm text-gray-600">{r.notes}</p>}
          </div>
        )
      })}
    </div>
  )
}
