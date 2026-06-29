import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  markPortfolioReviewed,
  nextReviewDateFor,
  PORTFOLIO_REVIEW_TASKS,
  CADENCE_LABELS,
  type PortfolioCadence,
  type ReviewChecklistItem,
} from '@/lib/portfolioReviews'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { AttributionMovers } from '@/components/AttributionMovers'
import { PositionSizingCheck } from '@/components/PositionSizingCheck'
import { HoldingMonitorGrid } from '@/components/HoldingMonitorGrid'
import { saveHoldingReviews, type HoldingAssessment } from '@/lib/holdingReviews'
import type { BandModel } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

const EMPTY_ASSESSMENT: Omit<HoldingAssessment, 'securityId'> = {
  thesisStatus: null, businessTrend: null, valuation: null, conviction: null, action: null,
}

interface PortfolioReviewModalProps {
  open: boolean
  onClose: () => void
  portfolioId: string
  cadence: PortfolioCadence | null
  /** The schedule's current next_review_at — logged as the review_date this review addressed. */
  dueDate: string | null
  /** Current target positions — for the position-sizing band check. */
  positions: PortfolioPosition[]
  /** Resolved model portfolio — supplies drift/cash limits for derived bands. */
  modelPortfolio: BandModel
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function PortfolioReviewModal({ open, onClose, portfolioId, cadence, dueDate, positions, modelPortfolio }: PortfolioReviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()

  const [items, setItems] = useState<ReviewChecklistItem[]>([])
  const [notes, setNotes] = useState('')
  const [reviewDate, setReviewDate] = useState(toDateInputValue(new Date()))
  const [nextDate, setNextDate] = useState('')
  // Per-holding monitoring assignments (quarterly full-monitoring), keyed by securityId.
  const [holdingAssessments, setHoldingAssessments] = useState<Record<string, HoldingAssessment>>({})

  // Re-seed from the cadence each time the modal opens (stable on cadence/open only).
  useEffect(() => {
    if (open && cadence) {
      setItems(
        PORTFOLIO_REVIEW_TASKS[cadence].map((t) => ({
          key: t.key,
          label: t.label,
          done: false,
          notes: null,
        })),
      )
      setNotes('')
      setHoldingAssessments({})
      const today = new Date()
      setReviewDate(toDateInputValue(today))
      setNextDate(nextReviewDateFor(cadence, today).slice(0, 10))
    }
  }, [open, cadence])

  const setHoldingField = (
    securityId: string,
    field: keyof Omit<HoldingAssessment, 'securityId'>,
    value: string,
  ) =>
    setHoldingAssessments((prev) => {
      const current = prev[securityId] ?? { securityId, ...EMPTY_ASSESSMENT }
      return { ...prev, [securityId]: { ...current, [field]: value || null } }
    })

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) d.showModal(); else d.close()
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!cadence) throw new Error('No cadence selected')
      const completedAt = new Date(reviewDate + 'T00:00:00')
      const logId = await markPortfolioReviewed({
        portfolioName: portfolioId,
        cadence,
        checklist: items,
        notes: notes.trim() || null,
        reviewedAt: completedAt,
        reviewDate: dueDate ? new Date(dueDate) : null,
        nextReviewAt: nextDate ? new Date(nextDate + 'T00:00:00') : null,
      })
      // Persist per-holding assessments captured in the full-monitoring grid.
      const assessments = Object.values(holdingAssessments)
      if (assessments.length > 0) {
        await saveHoldingReviews(logId, portfolioId, assessments, completedAt)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolioReviews(portfolioId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolioReviewSchedulesFor(portfolioId) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolioReviewSchedules })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.holdingReviews(portfolioId) })
      onClose()
    },
  })

  const handleClose = () => {
    if (!mutation.isPending) { onClose(); mutation.reset() }
  }

  const toggle = (key: string) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, done: !it.done } : it)))
  const setItemNotes = (key: string, value: string) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, notes: value || null } : it)))

  const allDone = items.length > 0 && items.every((it) => it.done)
  const doneCount = items.filter((it) => it.done).length
  const canSubmit = !!cadence && !!reviewDate

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className={`w-full ${cadence === 'quarterly' ? 'max-w-4xl' : 'max-w-lg'} rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30`}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate() }}
        className="p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900">
          {cadence ? `${CADENCE_LABELS[cadence]} Review` : 'Portfolio Review'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Work through the {cadence ? CADENCE_LABELS[cadence].toLowerCase() : ''} checklist for{' '}
          <span className="font-medium text-gray-700">{portfolioId}</span>. The completed checklist is
          frozen into the review record.
        </p>

        {/* Checklist */}
        <div className="mt-5 space-y-3">
          {items.map((it) => (
            <div key={it.key} className="rounded-md border border-gray-200 p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={() => toggle(it.key)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                />
                <span className={`text-sm font-medium ${it.done ? 'text-gray-900' : 'text-gray-700'}`}>
                  {it.label}
                </span>
              </label>
              {it.key === 'performance_attribution' && (
                <AttributionMovers portfolioId={portfolioId} days={30} />
              )}
              {it.key === 'full_monitoring' && (
                <HoldingMonitorGrid
                  positions={positions}
                  assessments={holdingAssessments}
                  onChange={setHoldingField}
                />
              )}
              {(it.key === 'position_sizing' || it.key === 'full_monitoring') && (
                <PositionSizingCheck positions={positions} modelPortfolio={modelPortfolio} />
              )}
              <input
                type="text"
                value={it.notes ?? ''}
                onChange={(e) => setItemNotes(it.key, e.target.value)}
                placeholder="Notes (optional)"
                className="mt-2 block w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          ))}
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {doneCount} of {items.length} complete{allDone ? ' · all items checked' : ''}
        </p>

        {/* Summary + dates */}
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Summary notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Key findings, decisions, follow-ups…"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Date reviewed <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Next review due</label>
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>
        </div>

        {mutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to save'}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={handleClose} disabled={mutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending || !canSubmit}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Complete Review'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
