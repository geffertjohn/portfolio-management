import { useQuery } from '@tanstack/react-query'
import { fetchHoldingsChangeLog, type ChangeType } from '@/lib/holdingsChangeLog'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'

const CHANGE_LABELS: Record<ChangeType, string> = {
  add: 'Added',
  remove: 'Removed',
  weight_change: 'Weight Changed',
}

const CHANGE_COLORS: Record<ChangeType, string> = {
  add: 'text-green-700 bg-green-50',
  remove: 'text-red-700 bg-red-50',
  weight_change: 'text-blue-700 bg-blue-50',
}

export function HoldingsChangeLog({ portfolioId }: { portfolioId: string }) {
  const { data: changes = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.holdingsChangeLog(portfolioId),
    queryFn: () => fetchHoldingsChangeLog(portfolioId),
  })

  if (isLoading) return <p className="text-sm text-gray-500 py-4">Loading change log…</p>

  if (changes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-10 text-center">
        <p className="text-sm text-gray-500">No changes recorded yet. Future position edits will appear here automatically.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-900">Date</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-900">Security</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-900">Change</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-900">From</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-900">To</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {changes.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">{formatDate(c.changed_at)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">
                {c.symbol ?? '—'}
                {c.name && <span className="ml-2 text-xs text-gray-400">{c.name}</span>}
              </td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CHANGE_COLORS[c.change_type]}`}>
                  {CHANGE_LABELS[c.change_type]}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                {c.old_weight != null ? `${c.old_weight.toFixed(1)}%` : '—'}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                {c.new_weight != null ? `${c.new_weight.toFixed(1)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
