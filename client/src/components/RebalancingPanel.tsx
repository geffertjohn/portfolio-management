import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { calcDrift, logRebalance, updateTargetWeights } from '@/lib/rebalancing'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { PortfolioPosition } from '@/types/position'

interface RebalancingPanelProps {
  portfolioId: string
  positions: PortfolioPosition[]
}

export function RebalancingPanel({ portfolioId, positions }: RebalancingPanelProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [targets, setTargets] = useState<Record<string, { target: string; threshold: string }>>({})
  const [rebalanceNotes, setRebalanceNotes] = useState('')
  const [showRebalancedMsg, setShowRebalancedMsg] = useState(false)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const driftRows = calcDrift(positions)
  const outOfTolerance = driftRows.filter((r) => r.outOfTolerance)

  const saveMutation = useMutation({
    mutationFn: () => updateTargetWeights(
      portfolioId,
      Object.entries(targets).map(([sid, v]) => ({
        securityId: sid,
        targetWeight: v.target === '' ? null : Number(v.target),
        driftThreshold: v.threshold === '' ? 5 : Number(v.threshold),
      }))
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.positions(portfolioId) })
      setEditing(false)
    },
  })

  const logMutation = useMutation({
    mutationFn: () => logRebalance(portfolioId, positions, rebalanceNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rebalanceLog(portfolioId) })
      setRebalanceNotes('')
      setShowRebalancedMsg(true)
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
      successTimerRef.current = setTimeout(() => setShowRebalancedMsg(false), 3000)
    },
  })

  const startEditing = () => {
    const initial: Record<string, { target: string; threshold: string }> = {}
    positions.forEach((p) => {
      initial[p.securityId] = {
        target: p.targetWeight != null ? String(p.targetWeight) : '',
        threshold: p.driftThreshold != null ? String(p.driftThreshold) : '5',
      }
    })
    setTargets(initial)
    setEditing(true)
  }

  return (
    <div className="space-y-4">
      {outOfTolerance.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            {outOfTolerance.length} position{outOfTolerance.length > 1 ? 's' : ''} outside drift tolerance
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            {outOfTolerance.map((r) => r.ticker).join(', ')}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Position Drift</h3>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                  className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                  {saveMutation.isPending ? 'Saving…' : 'Save Targets'}
                </button>
              </>
            ) : (
              <button onClick={startEditing}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                Set Targets
              </button>
            )}
          </div>
        </div>

        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Security</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Current</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Target</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Drift</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Threshold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {driftRows.map((row) => (
              <tr key={row.securityId} className={row.outOfTolerance ? 'bg-amber-50' : ''}>
                <td className="px-4 py-2.5 font-medium text-gray-900">{row.ticker}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-700">{row.currentWeight.toFixed(1)}%</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-700">
                  {editing ? (
                    <input
                      type="number" step="0.1" min="0" max="100"
                      value={targets[row.securityId]?.target ?? ''}
                      onChange={(e) => setTargets((prev) => ({ ...prev, [row.securityId]: { ...prev[row.securityId], target: e.target.value } }))}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-xs"
                      placeholder="—"
                    />
                  ) : (
                    row.targetWeight != null ? `${row.targetWeight.toFixed(1)}%` : <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${
                  row.drift == null ? 'text-gray-400' :
                  row.outOfTolerance ? 'text-amber-700' : 'text-gray-700'
                }`}>
                  {row.drift != null ? `${row.drift > 0 ? '+' : ''}${row.drift.toFixed(1)}%` : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-500">
                  {editing ? (
                    <input
                      type="number" step="0.1" min="0"
                      value={targets[row.securityId]?.threshold ?? '5'}
                      onChange={(e) => setTargets((prev) => ({ ...prev, [row.securityId]: { ...prev[row.securityId], threshold: e.target.value } }))}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-xs"
                    />
                  ) : (
                    `±${row.driftThreshold.toFixed(1)}%`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Log rebalance */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Log Rebalance</h3>
        <p className="mt-1 text-xs text-gray-500">Record that a rebalance was executed. A snapshot of current positions will be saved.</p>
        <textarea value={rebalanceNotes} onChange={(e) => setRebalanceNotes(e.target.value)}
          rows={2} placeholder="Optional notes about this rebalance…"
          className="mt-3 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
        <button onClick={() => logMutation.mutate()} disabled={logMutation.isPending}
          className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {logMutation.isPending ? 'Saving…' : 'Log Rebalance'}
        </button>
        {showRebalancedMsg && <p className="mt-2 text-sm text-green-700">Rebalance logged.</p>}
      </div>
    </div>
  )
}
