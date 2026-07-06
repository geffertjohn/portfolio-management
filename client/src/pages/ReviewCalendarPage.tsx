import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchReviewSchedules, isOverdue, isDueSoon, type ReviewCadence } from '@/lib/reviewSchedules'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { MarkReviewedModal } from '@/components/MarkReviewedModal'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate } from '@/lib/fundFormat'

type Filter = 'all' | 'overdue' | 'due_soon'

export function ReviewCalendarPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [reviewing, setReviewing] = useState<{
    securityId: string; symbol: string; cadence: ReviewCadence
    lastEarnings: string | null; nextEarnings: string | null
  } | null>(null)

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.reviewSchedules,
    queryFn: fetchReviewSchedules,
  })

  const filtered = schedules.filter((s) => {
    if (filter === 'overdue') return isOverdue(s.next_review_at)
    if (filter === 'due_soon') return isDueSoon(s.next_review_at) && !isOverdue(s.next_review_at)
    return true
  })

  const overdueCount = schedules.filter((s) => isOverdue(s.next_review_at)).length
  const dueSoonCount = schedules.filter((s) => isDueSoon(s.next_review_at) && !isOverdue(s.next_review_at)).length

  function rowStatus(nextReview: string) {
    if (isOverdue(nextReview)) return 'overdue'
    if (isDueSoon(nextReview)) return 'due_soon'
    return null
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Review Calendar</h1>
          <p className="mt-1 text-gray-600">
            Complete quarterly, semi-annual, and annual security reviews.{' '}
            <a href="/actions" className="text-blue-600 hover:underline">See all actions →</a>
          </p>
        </div>
        <div className="flex gap-2">
          {(['all', 'overdue', 'due_soon'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                filter === f ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}>
              {f === 'all' ? `All (${schedules.length})` :
               f === 'overdue' ? `Overdue (${overdueCount})` :
               `Due Soon (${dueSoonCount})`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="mt-8 text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-gray-500">
            {filter === 'all'
              ? 'No review schedules set. Open a security and set a review cadence from the monitoring tab.'
              : `No ${filter === 'overdue' ? 'overdue' : 'upcoming'} reviews.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Security</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Cadence</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Last Reviewed</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Next Review</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((s) => {
                const status = rowStatus(s.next_review_at)
                return (
                  <tr key={s.id} className={status === 'overdue' ? 'bg-red-50' : status === 'due_soon' ? 'bg-amber-50' : ''}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        onClick={() => { if (s.security_numeric_id != null) navigate(`/security/${s.security_numeric_id}`) }}
                        className="font-medium text-blue-600 hover:underline"
                        disabled={s.security_numeric_id == null}
                      >
                        {s.symbol}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{s.name ?? '—'}</td>
                    <td className="px-4 py-3 capitalize text-gray-700">{s.cadence.replace('_', '-')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {s.last_reviewed_at ? formatDate(s.last_reviewed_at) : <span className="text-gray-400">Never</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(s.next_review_at)}</td>
                    <td className="px-4 py-3">
                      {status ? <StatusBadge variant={status} /> : <span className="text-xs text-gray-400">On track</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => setReviewing({ securityId: s.security_id, symbol: s.symbol, cadence: s.cadence, lastEarnings: s.last_earnings_release, nextEarnings: s.next_earnings_release })}
                        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
                        Mark Reviewed
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {reviewing && (
        <MarkReviewedModal
          open={true}
          onClose={() => setReviewing(null)}
          securityId={reviewing.securityId}
          securitySymbol={reviewing.symbol}
          currentCadence={reviewing.cadence}
          mode="review"
          lastEarnings={reviewing.lastEarnings}
          nextEarnings={reviewing.nextEarnings}
        />
      )}
    </div>
  )
}
