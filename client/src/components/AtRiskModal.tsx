import { useEffect, useRef, useState } from 'react'
import { metricsForAssetClass } from '@/lib/atRisk'

interface Props {
  symbol: string
  assetClass: string | null | undefined
  isFund: boolean
  onConfirm: (metrics: string[], notes: string) => void
  onCancel: () => void
  isSubmitting: boolean
}

export function AtRiskModal({
  symbol,
  assetClass,
  isFund,
  onConfirm,
  onCancel,
  isSubmitting,
}: Props) {
  const metricOptions = metricsForAssetClass(isFund ? assetClass : 'stock')
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on backdrop click
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onCancel()
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  function toggleMetric(metric: string) {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric],
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm(selectedMetrics, notes)
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Flag {symbol} as at-risk
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Select the metrics that have deteriorated.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 px-6 py-5">
            {metricOptions.length > 0 ? (
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Scorecard metrics
                </legend>
                <div className="mt-2 space-y-2">
                  {metricOptions.map((metric) => (
                    <label
                      key={metric}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMetrics.includes(metric)}
                        onChange={() => toggleMetric(metric)}
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                      />
                      <span className="text-sm text-gray-800">{metric}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div>
              <label
                htmlFor="at-risk-notes"
                className="text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Notes <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <textarea
                id="at-risk-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Additional context for this flag…"
                className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md border border-transparent bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSubmitting ? 'Adding…' : 'Add to at-risk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
