import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAllocationGrid, upsertAllocation, addSnapshotDate, deleteSnapshotDate,
  normalizeSymbol,
} from '@/lib/portfolioAllocations'
import { QUERY_KEYS } from '@/hooks/queryKeys'

const fmtW = (w: number) => (w === 0 ? '' : w.toFixed(2))

export function AllocationHistoryPanel({ portfolioName }: { portfolioName: string }) {
  const queryClient = useQueryClient()
  const [newDate, setNewDate] = useState('')
  const [newTicker, setNewTicker] = useState('')

  const { data: grid, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.allocationGrid(portfolioName),
    queryFn: () => fetchAllocationGrid(portfolioName),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allocationGrid(portfolioName) })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolioPeriodReturns(portfolioName) })
  }

  const cellMut = useMutation({
    mutationFn: (v: { date: string; sym: string; weight: number }) =>
      upsertAllocation(portfolioName, v.date, v.sym, v.weight),
    onSuccess: invalidate,
  })
  const addDateMut = useMutation({
    mutationFn: (d: string) => addSnapshotDate(portfolioName, d, grid?.dates.at(-1)),
    onSuccess: () => { setNewDate(''); invalidate() },
  })
  const delDateMut = useMutation({
    mutationFn: (d: string) => deleteSnapshotDate(portfolioName, d),
    onSuccess: invalidate,
  })
  const addTickerMut = useMutation({
    mutationFn: (sym: string) => upsertAllocation(portfolioName, grid!.dates.at(-1)!, normalizeSymbol(sym), 0),
    onSuccess: () => { setNewTicker(''); invalidate() },
  })
  if (isLoading) return <p className="mt-4 text-sm text-gray-500">Loading allocation history…</p>
  if (error) return <p className="mt-4 text-sm text-red-600">{error instanceof Error ? error.message : 'Failed to load allocations'}</p>
  if (!grid) return null

  const dates = grid.dates
  const sums = Object.fromEntries(dates.map((d) => [d, grid.rows.reduce((s, r) => s + (r.weights[d] ?? 0), 0)]))

  return (
    <div key={dates.join('|')}>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">Dated target allocations. Each column is a rebalance; the rightmost is current. Edit a cell to update.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          <button type="button" disabled={!newDate || addDateMut.isPending} onClick={() => addDateMut.mutate(newDate)}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">+ Date</button>
        </div>
      </div>

      {dates.length === 0 ? (
        <p className="text-sm text-gray-400">No allocation snapshots yet. Import a YCharts file from Settings → Import / Export, or add a date.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs text-gray-500">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-semibold">Symbol</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                {dates.map((d) => (
                  <th key={d} className="px-2 py-2 text-right font-semibold">
                    <div className="flex items-center justify-end gap-1">
                      <span className="tabular-nums">{d}</span>
                      <button type="button" title="Delete this date" onClick={() => delDateMut.mutate(d)}
                        className="text-gray-300 hover:text-red-500">×</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grid.rows.map((r) => (
                <tr key={r.security_id} className="hover:bg-gray-50">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-900">{r.security_id}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">{r.name ?? '—'}</td>
                  {dates.map((d) => (
                    <td key={d} className="px-1 py-0.5 text-right">
                      <input
                        type="text" inputMode="decimal" defaultValue={fmtW(r.weights[d] ?? 0)}
                        onBlur={(e) => {
                          const w = e.target.value.trim() === '' ? 0 : Number(e.target.value.replace('%', ''))
                          if (Number.isFinite(w) && w !== (r.weights[d] ?? 0)) cellMut.mutate({ date: d, sym: r.security_id, weight: w })
                        }}
                        className="w-16 rounded border border-transparent bg-transparent px-1.5 py-1 text-right tabular-nums text-gray-900 hover:border-gray-200 focus:border-gray-400 focus:bg-white focus:outline-none"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 text-xs">
                <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-semibold text-gray-600">Total</td>
                <td />
                {dates.map((d) => (
                  <td key={d} className={`px-3 py-2 text-right font-semibold tabular-nums ${
                    Math.abs(sums[d] - 100) > 0.5 ? 'text-red-600' : 'text-gray-600'}`}>
                    {sums[d].toFixed(1)}%
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add ticker */}
      {dates.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <input type="text" value={newTicker} onChange={(e) => setNewTicker(e.target.value)} placeholder="Add ticker (current date)"
            className="rounded-md border border-gray-300 px-2 py-1 text-xs uppercase text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          <button type="button" disabled={!newTicker.trim() || addTickerMut.isPending} onClick={() => addTickerMut.mutate(newTicker)}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Add</button>
        </div>
      )}
    </div>
  )
}
