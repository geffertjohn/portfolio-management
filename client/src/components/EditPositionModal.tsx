import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { updatePosition, deletePosition, updatePositionLimits } from '@/lib/positions'
import { formatPortfolioSecuritySymbol } from '@/lib/positionDisplay'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { PortfolioPosition } from '@/types/position'
import {
  recordTradeSuitability,
  determineTradeAction,
  REASON_OPTIONS_BY_ACTION,
  REASON_OPTIONS_BY_MONITOR_ACTION,
  REASON_LABELS,
} from '@/lib/tradeSuitability'
import type { ReasonCode } from '@/lib/tradeSuitability'
import {
  THESIS_STATUS_OPTIONS, THESIS_STATUS_LABELS,
  BUSINESS_TREND_OPTIONS, BUSINESS_TREND_LABELS,
  VALUATION_OPTIONS, VALUATION_LABELS,
  CONVICTION_OPTIONS, CONVICTION_LABELS,
  ACTION_OPTIONS, ACTION_LABELS,
} from '@/lib/holdingReviews'
import type {
  ThesisStatus, BusinessTrend, ValuationCall, MonitorConviction, HoldingAction,
} from '@/lib/holdingReviews'

interface MonitorAssessment {
  thesisStatus: ThesisStatus | null
  businessTrend: BusinessTrend | null
  valuation: ValuationCall | null
  conviction: MonitorConviction | null
  monitorAction: HoldingAction | null
}

const EMPTY_ASSESSMENT: MonitorAssessment = {
  thesisStatus: null, businessTrend: null, valuation: null, conviction: null, monitorAction: null,
}

// The four categorical assignments mirrored from the full-monitoring review,
// shown above the Action select (which drives the reason options).
const MONITOR_COLUMNS: {
  field: 'thesisStatus' | 'businessTrend' | 'valuation' | 'conviction'
  label: string
  options: readonly string[]
  labels: Record<string, string>
}[] = [
  { field: 'thesisStatus',  label: 'Thesis Status',  options: THESIS_STATUS_OPTIONS,  labels: THESIS_STATUS_LABELS },
  { field: 'businessTrend', label: 'Business Trend', options: BUSINESS_TREND_OPTIONS, labels: BUSINESS_TREND_LABELS },
  { field: 'valuation',     label: 'Valuation',      options: VALUATION_OPTIONS,      labels: VALUATION_LABELS },
  { field: 'conviction',    label: 'Conviction',     options: CONVICTION_OPTIONS,     labels: CONVICTION_LABELS },
]

interface EditPositionModalProps {
  open: boolean
  onClose: () => void
  portfolioId: string
  position: PortfolioPosition | null
}

export function EditPositionModal({
  open,
  onClose,
  portfolioId,
  position,
}: EditPositionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [securityId, setSecurityId] = useState('')
  const [weight, setWeight] = useState('')
  const [lowerLimit, setLowerLimit] = useState('')
  const [upperLimit, setUpperLimit] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Suitability
  const [reasonCode, setReasonCode] = useState<ReasonCode | ''>('')
  const [rationale, setRationale] = useState('')
  const [removeRationale, setRemoveRationale] = useState('')
  const [removeReasonCode, setRemoveReasonCode] = useState<ReasonCode | ''>('')

  // Monitoring assessment (mirrors the full-monitoring review)
  const [assessment, setAssessment] = useState<MonitorAssessment>(EMPTY_ASSESSMENT)
  const setAssessmentField = <K extends keyof MonitorAssessment>(field: K, value: MonitorAssessment[K]) => {
    setAssessment((prev) => ({ ...prev, [field]: value }))
  }

  const { data: securities = [] } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
    enabled: open,
  })

  // Pre-populate fields when position changes
  useEffect(() => {
    if (position) {
      setSecurityId(position.securityId)
      setWeight(String(position.weight))
      setLowerLimit(position.lowerLimit != null ? String(position.lowerLimit) : '')
      setUpperLimit(position.upperLimit != null ? String(position.upperLimit) : '')
      setConfirmDelete(false)
      setReasonCode('')
      setRationale('')
      setRemoveReasonCode('')
      setRemoveRationale('')
      setAssessment(EMPTY_ASSESSMENT)
    }
  }, [position])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) dialog.showModal()
    else dialog.close()
  }, [open])

  const handleClose = () => {
    if (!updateMutation.isPending && !deleteMutation.isPending) {
      onClose()
      setConfirmDelete(false)
      updateMutation.reset()
      deleteMutation.reset()
    }
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.positions(portfolioId) })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tradeSuitability(portfolioId) })
  }

  // The weight-derived trade action is recorded for the log badge (increase /
  // decrease / replace), but the reason options are driven by the advisor's
  // monitoring Action call (add / hold / trim / exit / watchlist).
  const derivedAction = position
    ? determineTradeAction(position.securityId, securityId, position.weight, Number(weight) || position.weight)
    : 'increase'
  const reasonOptions = assessment.monitorAction
    ? REASON_OPTIONS_BY_MONITOR_ACTION[assessment.monitorAction]
    : []
  const removeReasonOptions = REASON_OPTIONS_BY_ACTION['remove']

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!position) throw new Error('No position selected')
      const numWeight = Number(weight)
      const action = determineTradeAction(position.securityId, securityId, position.weight, numWeight)
      await updatePosition(position.portfolioId, position.securityId, securityId, numWeight)
      await updatePositionLimits(
        portfolioId,
        securityId,
        lowerLimit !== '' ? Number(lowerLimit) : null,
        upperLimit !== '' ? Number(upperLimit) : null,
      )
      await recordTradeSuitability({
        portfolio_name: portfolioId,
        security_id: securityId,
        action,
        reason_code: reasonCode as ReasonCode,
        rationale: rationale || null,
        old_weight: position.weight,
        new_weight: numWeight,
        thesis_status: assessment.thesisStatus,
        business_trend: assessment.businessTrend,
        valuation: assessment.valuation,
        conviction: assessment.conviction,
        monitor_action: assessment.monitorAction,
      })
    },
    onSuccess: () => { invalidate(); onClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!position) throw new Error('No position selected')
      await deletePosition(position.portfolioId, position.securityId)
      await recordTradeSuitability({
        portfolio_name: portfolioId,
        security_id: position.securityId,
        action: 'remove',
        reason_code: removeReasonCode as ReasonCode,
        rationale: removeRationale || null,
        old_weight: position.weight,
        new_weight: null,
      })
    },
    onSuccess: () => { invalidate(); onClose() },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numWeight = Number(weight)
    if (!securityId || Number.isNaN(numWeight) || numWeight <= 0 || numWeight > 100) return
    if (!assessment.monitorAction || !reasonCode) return
    updateMutation.mutate()
  }

  const isPending = updateMutation.isPending || deleteMutation.isPending

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30"
      aria-labelledby="edit-position-title"
    >
      <form onSubmit={handleSubmit} className="p-6">
        <h2 id="edit-position-title" className="text-lg font-semibold text-gray-900">
          Edit position
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Update the security or allocation weight for this position.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="edit-position-security" className="block text-sm font-medium text-gray-700">
              Security
            </label>
            <select
              id="edit-position-security"
              value={securityId}
              onChange={(e) => {
                setSecurityId(e.target.value)
                setReasonCode('') // reset reason when security changes
              }}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value="">Select a security</option>
              {securities.map((s) => (
                <option key={s.security_id} value={s.security_id}>
                  {formatPortfolioSecuritySymbol(s.security_id)}{s.security_name ? ` — ${s.security_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-position-weight" className="block text-sm font-medium text-gray-700">
              Target Weight (%)
            </label>
            <input
              id="edit-position-weight"
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value)
                setReasonCode('') // reset reason when weight changes
              }}
              required
              placeholder="e.g. 10.5"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-lower-limit" className="block text-sm font-medium text-gray-700">
                Lower Limit (%) <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="edit-lower-limit"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={lowerLimit}
                onChange={(e) => setLowerLimit(e.target.value)}
                placeholder="e.g. 8.0"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
            <div>
              <label htmlFor="edit-upper-limit" className="block text-sm font-medium text-gray-700">
                Upper Limit (%) <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="edit-upper-limit"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={upperLimit}
                onChange={(e) => setUpperLimit(e.target.value)}
                placeholder="e.g. 14.0"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          {/* Suitability section — always shown for saves */}
          {!confirmDelete && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Suitability documentation
                {position && (
                  <span className="ml-1 normal-case font-normal text-gray-400">
                    — {derivedAction === 'replace' ? 'replacing security' : derivedAction}
                  </span>
                )}
              </p>

              {/* Monitoring assessment — mirrors the full-monitoring review */}
              <div className="grid grid-cols-2 gap-3">
                {MONITOR_COLUMNS.map((c) => (
                  <div key={c.field}>
                    <label htmlFor={`edit-${c.field}`} className="block text-sm font-medium text-gray-700">
                      {c.label} <span className="text-gray-400">(optional)</span>
                    </label>
                    <select
                      id={`edit-${c.field}`}
                      value={assessment[c.field] ?? ''}
                      onChange={(e) => setAssessmentField(c.field, (e.target.value || null) as MonitorAssessment[typeof c.field])}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    >
                      <option value="">—</option>
                      {c.options.map((o) => (
                        <option key={o} value={o}>{c.labels[o]}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div>
                <label htmlFor="edit-monitor-action" className="block text-sm font-medium text-gray-700">
                  Action <span className="text-red-500">*</span>
                </label>
                <select
                  id="edit-monitor-action"
                  value={assessment.monitorAction ?? ''}
                  onChange={(e) => {
                    setAssessmentField('monitorAction', (e.target.value || null) as HoldingAction | null)
                    setReasonCode('') // reason options depend on the Action
                  }}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="">Select an action</option>
                  {ACTION_OPTIONS.map((o) => (
                    <option key={o} value={o}>{ACTION_LABELS[o]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-reason-code" className="block text-sm font-medium text-gray-700">
                  Reason <span className="text-red-500">*</span>
                </label>
                <select
                  id="edit-reason-code"
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as ReasonCode)}
                  required
                  disabled={!assessment.monitorAction}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">{assessment.monitorAction ? 'Select a reason' : 'Select an action first'}</option>
                  {reasonOptions.map((code) => (
                    <option key={code} value={code}>{REASON_LABELS[code]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-rationale" className="block text-sm font-medium text-gray-700">
                  Rationale <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="edit-rationale"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  rows={2}
                  placeholder="Brief explanation for this change…"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
            </div>
          )}
        </div>

        {(updateMutation.isError || deleteMutation.isError) && (
          <p className="mt-3 text-sm text-red-600">
            {(updateMutation.error ?? deleteMutation.error) instanceof Error
              ? (updateMutation.error ?? deleteMutation.error as Error).message
              : 'Something went wrong'}
          </p>
        )}

        {/* Delete confirmation with removal suitability */}
        {confirmDelete ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 space-y-3">
            <p className="text-sm font-medium text-red-700">Remove this position from the portfolio?</p>

            <div>
              <label htmlFor="remove-reason-code" className="block text-sm font-medium text-red-700">
                Reason for removal <span className="text-red-500">*</span>
              </label>
              <select
                id="remove-reason-code"
                value={removeReasonCode}
                onChange={(e) => setRemoveReasonCode(e.target.value as ReasonCode)}
                className="mt-1 block w-full rounded-md border border-red-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              >
                <option value="">Select a reason</option>
                {removeReasonOptions.map((code) => (
                  <option key={code} value={code}>{REASON_LABELS[code]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="remove-rationale" className="block text-sm font-medium text-red-700">
                Rationale <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                id="remove-rationale"
                value={removeRationale}
                onChange={(e) => setRemoveRationale(e.target.value)}
                rows={2}
                placeholder="Brief explanation for removing this position…"
                className="mt-1 block w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={isPending || !removeReasonCode}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Removing…' : 'Yes, remove'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={isPending}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending || confirmDelete}
            className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 disabled:opacity-50"
          >
            Remove position
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isPending ||
                confirmDelete ||
                !securityId ||
                !weight ||
                Number.isNaN(Number(weight)) ||
                Number(weight) <= 0 ||
                Number(weight) > 100 ||
                !assessment.monitorAction ||
                !reasonCode
              }
              className="rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  )
}
