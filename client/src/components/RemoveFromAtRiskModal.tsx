/**
 * RemoveFromAtRiskModal
 *
 * Clearing an at-risk flag now requires a reason (CHECK-enforced), so it cannot
 * be a one-click action any more.
 *
 * That is the point rather than friction for its own sake. The committee removes
 * an entry by recording which metrics recovered; when the advisor removes one it
 * is an override of that process, and the list's whole job is to show that a
 * deteriorating position was watched and dealt with — a flag that vanished with
 * no account of why would defeat it.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { removeFromAtRisk, failingMetrics, type AtRiskMetric } from '@/lib/atRisk'
import { QUERY_KEYS } from '@/hooks/queryKeys'

export function RemoveFromAtRiskModal({
  entryId,
  symbol,
  metrics,
  onClose,
}: {
  entryId: number
  symbol: string
  metrics: AtRiskMetric[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const stillRed = failingMetrics(metrics)

  const mutation = useMutation({
    mutationFn: () => removeFromAtRisk(entryId, reason, 'manual'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRisk })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRiskBySecurity(symbol) })
      onClose()
    },
  })

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Remove {symbol} from At-Risk</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          This overrides the committee's monitoring. The reason is kept on the record.
        </p>
      </div>

      <div className="space-y-4 px-6 py-4">
        {stillRed.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium text-amber-800">
              {stillRed.length} metric{stillRed.length === 1 ? ' is' : 's are'} still red
            </p>
            <p className="mt-1 text-xs text-amber-700">
              {stillRed.map((m) => m.label).join(' · ')}
            </p>
          </div>
        )}

        <div>
          <label htmlFor="at-risk-removal-reason" className="block text-sm font-medium text-gray-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id="at-risk-removal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            placeholder={
              stillRed.length > 0
                ? 'Why clear the flag while metrics are still red?'
                : 'Why remove this entry?'
            }
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>

        {mutation.error && (
          <p className="text-xs text-red-600">{(mutation.error as Error).message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={mutation.isPending}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!reason.trim() || mutation.isPending}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {mutation.isPending ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </dialog>
  )
}
