import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAllocationGrid, upsertAllocation, addSnapshotDate, deleteSnapshotDate,
  normalizeSymbol, syncPositionForGridEdit, type GridEditPositionSync,
} from '@/lib/portfolioAllocations'
import {
  comparePositionsToSnapshot, driftCount, isCurrentTargetDate, DERIVED_BLEND_PORTFOLIOS,
} from '@/lib/positionsDrift'
import { usePositions } from '@/hooks/usePortfolio'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { ImportAllocationsModal } from './ImportAllocationsModal'

const fmtW = (w: number) => (w === 0 ? '' : w.toFixed(2))

/** What the edit did to Positions — said out loud, because it writes to the DB. */
function noteFor(sym: string, result: GridEditPositionSync): string {
  switch (result) {
    case 'inserted': return `${sym} added to Positions.`
    case 'updated':  return `${sym} updated in Positions.`
    case 'removed':  return `${sym} removed from Positions.`
    // Not a failure — the history edit stands. `positions.security_id` has an
    // FK to securities2 and this grid deliberately stages symbols that do not.
    case 'unknown_security':
      return `History updated. ${sym} is not in the securities list, so Positions was left unchanged.`
  }
}

export function AllocationHistoryPanel({ portfolioName }: { portfolioName: string }) {
  const queryClient = useQueryClient()
  const [importing, setImporting] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTicker, setNewTicker] = useState('')
  const [syncNote, setSyncNote] = useState<string | null>(null)

  const { data: grid, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.allocationGrid(portfolioName),
    queryFn: () => fetchAllocationGrid(portfolioName),
  })
  const { data: positions } = usePositions(portfolioName)

  /**
   * Does Positions still say what the newest snapshot says? Reported, never
   * resolved — see `lib/positionsDrift.ts` for why an automatic re-point is
   * unsafe. A derived blend is skipped: its positions are computed from its
   * parents, so its history disagreeing is expected rather than a defect.
   */
  const drift = useMemo(() => {
    if (!grid || !positions || DERIVED_BLEND_PORTFOLIOS.has(portfolioName)) return null
    const latest = grid.dates.at(-1)
    if (!latest) return null
    const weights = new Map(
      grid.rows.map((r) => [r.security_id, r.weights[latest] ?? 0] as const),
    )
    const d = comparePositionsToSnapshot(
      positions.map((p) => ({ security_id: p.securityId, allocation_pct: p.weight })),
      { effectiveDate: latest, weights },
    )
    return d && driftCount(d) > 0 ? d : null
  }, [grid, positions, portfolioName])

  /**
   * Everything a grid edit can change.
   *
   * `allocationChanges` and `positions` were both missing, and the Change Log's
   * own docstring says it is derived "so it cannot disagree with the History
   * grid" — with its cache unbusted the two sibling sub-tabs disagreed for the
   * rest of the session. `portfolioPeriodReturns` went the other way: it is a
   * dead key, left behind when the buy-and-hold performance engine was deleted
   * in Sep 2026, with no reader anywhere in the app.
   */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allocationGrid(portfolioName) })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allocationChanges(portfolioName) })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.positions(portfolioName) })
  }

  /**
   * A cell edit on the NEWEST date is an edit to the current target, so it is
   * pushed through to that one position. An edit to an older column is history
   * and writes nothing.
   */
  const cellMut = useMutation({
    mutationFn: async (v: { date: string; sym: string; weight: number }) => {
      await upsertAllocation(portfolioName, v.date, v.sym, v.weight)
      if (!isCurrentTargetDate(v.date, grid?.dates ?? [])) return null
      return { sym: v.sym, result: await syncPositionForGridEdit(portfolioName, v.sym, v.weight) }
    },
    onSuccess: (synced) => {
      setSyncNote(synced ? noteFor(synced.sym, synced.result) : null)
      invalidate()
    },
  })
  /**
   * Adding or deleting a date does NOT re-point positions, and that is the
   * deliberate half of this. Adding clones the previous column, so the current
   * weights do not move; deleting the newest column changes which snapshot is
   * current, but re-pointing a whole book off a destructive click is not a
   * decision to make silently. The drift banner below reports it instead.
   */
  const addDateMut = useMutation({
    mutationFn: (d: string) => addSnapshotDate(portfolioName, d, grid?.dates.at(-1)),
    onSuccess: () => { setNewDate(''); setSyncNote(null); invalidate() },
  })
  const delDateMut = useMutation({
    mutationFn: (d: string) => deleteSnapshotDate(portfolioName, d),
    onSuccess: () => { setSyncNote(null); invalidate() },
  })
  // A new ticker enters at weight 0 — not held yet, so nothing to write to
  // Positions until it is given a weight.
  const addTickerMut = useMutation({
    mutationFn: (sym: string) => upsertAllocation(portfolioName, grid!.dates.at(-1)!, normalizeSymbol(sym), 0),
    onSuccess: () => { setNewTicker(''); setSyncNote(null); invalidate() },
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
          {/* An explicit, labelled DATA import — not a document upload. It
              previews before it writes, because it replaces every date below
              and re-points the Positions tab. */}
          <button type="button" onClick={() => setImporting(true)}
            className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800">Import allocations</button>
        </div>
      </div>
      {importing && (
        <ImportAllocationsModal portfolioName={portfolioName} onClose={() => { setImporting(false); invalidate() }} />
      )}

      {/* What the last cell edit did to Positions. It writes to the database,
          so it says so rather than leaving the advisor to find out later. */}
      {syncNote && (
        <p className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {syncNote}
        </p>
      )}

      {/* Positions IS meant to be the newest snapshot. Where it is not, say so
          and name the fix — never re-point a whole book on its own. */}
      {drift && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Positions does not match the newest snapshot ({drift.effectiveDate}).</span>{' '}
          {[
            drift.missing.length && `${drift.missing.length} in the snapshot but not held`,
            drift.extra.length && `${drift.extra.length} held but not in the snapshot`,
            drift.reweighted.length && `${drift.reweighted.length} at a different weight`,
          ].filter(Boolean).join(', ')}.{' '}
          Import an allocations file to re-point Positions to this history.
          {(drift.missing.length > 0 || drift.extra.length > 0) && (
            <span className="mt-1 block text-amber-800">
              {drift.missing.length > 0 && <>Not held: {drift.missing.join(', ')}. </>}
              {drift.extra.length > 0 && <>Not in snapshot: {drift.extra.join(', ')}.</>}
            </span>
          )}
        </div>
      )}

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
