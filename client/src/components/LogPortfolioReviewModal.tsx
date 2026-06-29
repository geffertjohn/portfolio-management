import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logPortfolioReview } from '@/lib/portfolioReviews'
import { OUTCOME_OPTIONS, OUTCOME_LABELS, type ReviewOutcome } from '@/lib/reviewLog'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface LogPortfolioReviewModalProps {
  open: boolean
  onClose: () => void
  portfolioId: string
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function currentPeriod(): string {
  const now = new Date()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return `Q${q} ${now.getFullYear()}`
}

export function LogPortfolioReviewModal({ open, onClose, portfolioId }: LogPortfolioReviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()

  const [reviewDate, setReviewDate] = useState(toDateInputValue(new Date()))
  const [reviewedBy, setReviewedBy] = useState('')
  const [outcome, setOutcome] = useState<ReviewOutcome | ''>('')
  const [period, setPeriod] = useState(currentPeriod())
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setReviewDate(toDateInputValue(new Date()))
      setReviewedBy('')
      setOutcome('')
      setPeriod(currentPeriod())
      setNotes('')
    }
  }, [open])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) d.showModal(); else d.close()
  }, [open])

  const mutation = useMutation({
    mutationFn: () =>
      logPortfolioReview({
        portfolio_name: portfolioId,
        reviewed_by:    reviewedBy.trim(),
        outcome:        outcome as ReviewOutcome,
        period:         period.trim() || null,
        notes:          notes.trim() || null,
        reviewed_at:    new Date(reviewDate + 'T00:00:00'),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolioReviews(portfolioId) })
      onClose()
    },
  })

  const handleClose = () => {
    if (!mutation.isPending) { onClose(); mutation.reset() }
  }

  const canSubmit = !!reviewDate && !!reviewedBy.trim() && !!outcome

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30"
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate() }}
        className="p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900">Log Portfolio Review</h2>
        <p className="mt-1 text-sm text-gray-500">
          Record a completed periodic review of this portfolio as a whole.
        </p>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Review Date <span className="text-red-500">*</span>
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
              <label className="block text-sm font-medium text-gray-700">Period</label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="e.g. Q2 2025"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Reviewed by <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reviewedBy}
              onChange={(e) => setReviewedBy(e.target.value)}
              required
              placeholder="Advisor name"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Outcome <span className="text-red-500">*</span>
            </label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ReviewOutcome)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value="">Select an outcome</option>
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Key findings, action items, decisions made…"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
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
            {mutation.isPending ? 'Saving…' : 'Log Review'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
