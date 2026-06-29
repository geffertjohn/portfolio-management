import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchPortfolioReviewSchedulesFor,
  isOverdue,
  isDueSoon,
  PORTFOLIO_CADENCES,
  CADENCE_LABELS,
  type PortfolioCadence,
  type PortfolioReviewSchedule,
} from '@/lib/portfolioReviews'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { PortfolioReviewModal } from '@/components/PortfolioReviewModal'
import { PortfolioReviewLog } from '@/components/PortfolioReviewLog'
import { formatDate } from '@/lib/fundFormat'
import type { BandModel } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

interface PortfolioReviewsPanelProps {
  portfolioId: string
  positions: PortfolioPosition[]
  modelPortfolio: BandModel
}

function statusBadge(s: PortfolioReviewSchedule | undefined) {
  if (!s) return null
  if (isOverdue(s.next_review_at)) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Overdue</span>
  }
  if (isDueSoon(s.next_review_at)) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Due soon</span>
  }
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">On track</span>
}

export function PortfolioReviewsPanel({ portfolioId, positions, modelPortfolio }: PortfolioReviewsPanelProps) {
  const [activeCadence, setActiveCadence] = useState<PortfolioCadence | null>(null)

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.portfolioReviewSchedulesFor(portfolioId),
    queryFn: () => fetchPortfolioReviewSchedulesFor(portfolioId),
  })

  const byCadence = (c: PortfolioCadence) => schedules.find((s) => s.cadence === c)
  const active = activeCadence ? byCadence(activeCadence) : undefined

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Review Cadence</h2>
        <p className="mt-1 text-xs text-gray-400">
          Monthly, quarterly, and annual reviews run on independent schedules.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PORTFOLIO_CADENCES.map((c) => {
            const s = byCadence(c)
            return (
              <div key={c} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{CADENCE_LABELS[c]}</h3>
                  {statusBadge(s)}
                </div>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Last reviewed</dt>
                    <dd className="text-gray-700">
                      {s?.last_reviewed_at ? formatDate(s.last_reviewed_at) : 'Never'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Next due</dt>
                    <dd className="text-gray-700">
                      {s?.next_review_at ? formatDate(s.next_review_at) : '—'}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => setActiveCadence(c)}
                  disabled={isLoading}
                  className="mt-4 w-full rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  Start Review
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Review History</h2>
        <div className="mt-4">
          <PortfolioReviewLog portfolioId={portfolioId} />
        </div>
      </div>

      <PortfolioReviewModal
        open={activeCadence !== null}
        onClose={() => setActiveCadence(null)}
        portfolioId={portfolioId}
        cadence={activeCadence}
        dueDate={active?.next_review_at ?? null}
        positions={positions}
        modelPortfolio={modelPortfolio}
      />
    </div>
  )
}
