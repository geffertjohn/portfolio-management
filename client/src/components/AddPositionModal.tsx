import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { createPosition } from '@/lib/positions'
import { formatPortfolioSecuritySymbol } from '@/lib/positionDisplay'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import {
  recordTradeSuitability,
  REASON_OPTIONS_BY_ACTION,
  REASON_LABELS,
} from '@/lib/tradeSuitability'
import type { ReasonCode } from '@/lib/tradeSuitability'

interface AddPositionModalProps {
  open: boolean
  onClose: () => void
  portfolioId: string
}

export function AddPositionModal({
  open,
  onClose,
  portfolioId,
}: AddPositionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [securityId, setSecurityId] = useState('')
  const [weight, setWeight] = useState('')
  const [reasonCode, setReasonCode] = useState<ReasonCode | ''>('')
  const [rationale, setRationale] = useState('')

  const { data: securities = [] } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      await createPosition(portfolioId, securityId, Number(weight))
      await recordTradeSuitability({
        portfolio_name: portfolioId,
        security_id: securityId,
        action: 'add',
        reason_code: reasonCode as ReasonCode,
        rationale: rationale || null,
        old_weight: null,
        new_weight: Number(weight),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.positions(portfolioId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tradeSuitability(portfolioId) })
      onClose()
      setSecurityId('')
      setWeight('')
      setReasonCode('')
      setRationale('')
    },
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numWeight = Number(weight)
    if (!securityId || Number.isNaN(numWeight) || numWeight <= 0 || numWeight > 100) return
    if (!reasonCode) return
    mutation.mutate()
  }

  const handleClose = () => {
    if (!mutation.isPending) {
      onClose()
      setSecurityId('')
      setWeight('')
      setReasonCode('')
      setRationale('')
      mutation.reset()
    }
  }

  const reasonOptions = REASON_OPTIONS_BY_ACTION['add']

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30"
      aria-labelledby="add-position-title"
    >
      <form onSubmit={handleSubmit} className="p-6">
        <h2
          id="add-position-title"
          className="text-lg font-semibold text-gray-900"
        >
          Add position
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose a security and allocation weight for this portfolio.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="add-position-security"
              className="block text-sm font-medium text-gray-700"
            >
              Security
            </label>
            <select
              id="add-position-security"
              value={securityId}
              onChange={(e) => setSecurityId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value="">Select a security</option>
              {securities.map((s) => (
                <option key={s.security_id} value={s.security_id}>
                  {formatPortfolioSecuritySymbol(s.security_id)}{' '}
                  {s.security_name ? `— ${s.security_name}` : ''}
                </option>
              ))}
            </select>
            {securities.length === 0 && open && (
              <p className="mt-1 text-xs text-amber-700">
                No securities in the database. Add securities first.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="add-position-weight"
              className="block text-sm font-medium text-gray-700"
            >
              Weight (%)
            </label>
            <input
              id="add-position-weight"
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required
              placeholder="e.g. 10.5"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Suitability section */}
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Suitability documentation
            </p>

            <div>
              <label
                htmlFor="add-reason-code"
                className="block text-sm font-medium text-gray-700"
              >
                Reason <span className="text-red-500">*</span>
              </label>
              <select
                id="add-reason-code"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as ReasonCode)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                <option value="">Select a reason</option>
                {reasonOptions.map((code) => (
                  <option key={code} value={code}>
                    {REASON_LABELS[code]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="add-rationale"
                className="block text-sm font-medium text-gray-700"
              >
                Rationale <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                id="add-rationale"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={2}
                placeholder="Brief explanation for this trade…"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>
        </div>

        {mutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Failed to add position'}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={mutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              mutation.isPending ||
              !securityId ||
              !weight ||
              Number.isNaN(Number(weight)) ||
              Number(weight) <= 0 ||
              Number(weight) > 100 ||
              !reasonCode
            }
            className="rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {mutation.isPending ? 'Adding…' : 'Add position'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
