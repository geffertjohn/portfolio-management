import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchAllocationChanges, type AllocationChangeType } from '@/lib/allocationChanges'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'

const CHANGE_LABELS: Record<AllocationChangeType, string> = {
  add: 'Added',
  remove: 'Removed',
  weight_change: 'Reweighted',
}

const CHANGE_COLORS: Record<AllocationChangeType, string> = {
  add: 'text-green-700 bg-green-50',
  remove: 'text-red-700 bg-red-50',
  weight_change: 'text-blue-700 bg-blue-50',
}

const pct = (v: number | null) => (v != null ? `${v.toFixed(2)}%` : '—')

/**
 * Every change between consecutive allocation snapshots, newest first.
 *
 * Derived on read from `portfolio_allocations` (see `lib/allocationChanges.ts`),
 * so it cannot disagree with the History grid and it covers snapshots imported
 * long before this existed.
 */
export function AllocationChangeLog({ portfolioId }: { portfolioId: string }) {
  const navigate = useNavigate()
  const { data: changes = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.allocationChanges(portfolioId),
    queryFn: () => fetchAllocationChanges(portfolioId),
  })

  if (isLoading) return <p className="py-4 text-sm text-gray-500">Loading change log…</p>
  if (error) {
    return (
      <p className="py-4 text-sm text-red-600">
        Could not load the change log: {error instanceof Error ? error.message : String(error)}
      </p>
    )
  }

  if (changes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-10 text-center">
        <p className="text-sm text-gray-500">No allocation history yet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Import an allocations file on the History tab and every change between dates appears here.
        </p>
      </div>
    )
  }

  const dates = new Set(changes.map((c) => c.effectiveDate)).size

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        {changes.length} change{changes.length === 1 ? '' : 's'} across {dates} allocation
        date{dates === 1 ? '' : 's'} · derived from the History grid
      </p>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-900">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-900">Security</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-900">Change</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-900">From</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-900">To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {changes.map((c) => (
              <tr key={c.key}>
                <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">{formatDate(c.effectiveDate)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">
                  {c.numericId != null ? (
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => { if (c.numericId != null) navigate(`/security/${c.numericId}`) }}
                    >
                      {c.securityId}
                    </button>
                  ) : (
                    c.securityId
                  )}
                  {/* A sold holding may no longer be in securities2 at all — that
                      is exactly the row a change log exists to show, so it is
                      rendered without a name rather than dropped. */}
                  {c.name && <span className="ml-2 text-xs text-gray-400">{c.name}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CHANGE_COLORS[c.changeType]}`}>
                    {CHANGE_LABELS[c.changeType]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-600">{pct(c.oldWeight)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-600">{pct(c.newWeight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
