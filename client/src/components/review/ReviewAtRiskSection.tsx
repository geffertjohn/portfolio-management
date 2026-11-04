import { useMemo, useState } from 'react'
import {
  failingMetrics, gradeAtRiskMetric, isBreached,
  type AtRiskEntry,
} from '@/lib/atRisk'
import { fmtUtcLongDate } from '@/lib/formatters'
import { isCashTicker } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'

/**
 * The At-Risk list for this book, at the top of the review's summary.
 *
 * **Scoped to the portfolio's own holdings.** `at_risk` is keyed by security,
 * not by portfolio, so the fourteen names on the firm-wide list are mostly
 * stocks in the Equity books and have no business in a Foundation review.
 *
 * Entries flagged during THIS review are badged. Judged on `date_added`
 * against the draft's own timestamp rather than tracked in component state, so
 * the badge survives a reload — the draft does.
 *
 * Clearing requires a reason: `removal_reason` is CHECK-enforced precisely
 * because a flag that vanishes with no account of why defeats the list.
 */
export function ReviewAtRiskSection({
  positions,
  atRisk,
  draftStartedAt,
  clearing,
  onClear,
}: {
  positions: PortfolioPosition[]
  atRisk: AtRiskEntry[]
  /** The draft's `reviewedAt` — anything added since counts as flagged here. */
  draftStartedAt: string
  clearing: string | null
  onClear: (entryId: number, securityId: string, reason: string) => void
}) {
  const held = useMemo(() => {
    const ids = new Set(
      positions
        .filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId))
        .map((p) => p.securityId),
    )
    return atRisk.filter((a) => !a.removed_at && ids.has(a.security_id))
  }, [positions, atRisk])

  const flaggedHere = useMemo(() => {
    const started = new Date(draftStartedAt).getTime()
    return new Set(
      held.filter((a) => a.date_added && new Date(a.date_added).getTime() >= started)
        .map((a) => a.security_id),
    )
  }, [held, draftStartedAt])

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">At-Risk</h3>
        <span className="text-xs text-gray-400">
          {held.length === 0 ? 'none in this portfolio' : `${held.length} holding${held.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {held.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500">
          No holding in this portfolio is on the At-Risk list. Flag one from the scorecard
          review if its cohort ranks warrant it.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {held.map((entry) => (
            <AtRiskRow
              key={entry.id}
              entry={entry}
              flaggedHere={flaggedHere.has(entry.security_id)}
              clearing={clearing === entry.security_id}
              onClear={onClear}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function AtRiskRow({
  entry, flaggedHere, clearing, onClear,
}: {
  entry: AtRiskEntry
  flaggedHere: boolean
  clearing: boolean
  onClear: (entryId: number, securityId: string, reason: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const metrics = entry.metrics_detail ?? []
  const stillRed = failingMetrics(metrics)
  const breached = isBreached(entry)

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {entry.security_id}
            {flaggedHere && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                Flagged in this review
              </span>
            )}
            {breached && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Timer expired
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Added {fmtUtcLongDate(entry.date_added)}
            {entry.removal_date && ` · timer runs to ${fmtUtcLongDate(entry.removal_date)}`}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>

      {metrics.length === 0 ? (
        <p className="mt-1.5 text-xs text-amber-800">
          No metrics recorded against this entry, so there is nothing to re-measure and the
          sell timer took the longest rung by default. Entries flagged from the scorecard
          review carry their failing readings.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {metrics.map((m) => {
            const colour = gradeAtRiskMetric(m)
            return (
              <li key={m.key} className="flex items-baseline gap-2 text-xs">
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[colour] ?? 'bg-gray-300'}`} />
                <span className="text-gray-600">{m.label}</span>
                <span className="tabular-nums text-gray-500">
                  {m.currentValue ?? m.flaggedValue ?? '—'}
                  {m.flaggedBenchmark != null && (
                    <span className="text-gray-400"> · clears at {round(m.flaggedBenchmark)}</span>
                  )}
                </span>
              </li>
            )
          })}
          <li className="pt-0.5 text-xs text-gray-400">
            {stillRed.length === 0
              ? 'Every flagged reading has recovered to amber or better.'
              : `${stillRed.length} of ${metrics.length} still in the bottom tier.`}
          </li>
        </ul>
      )}

      {open && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
          <label className="block text-xs font-medium text-gray-700">
            Why is this being cleared? <span className="text-gray-400">(required)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Sharpe and alpha both back inside the category's top half for two quarters."
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={clearing}
              onClick={() => { setOpen(false); setReason('') }}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={clearing || reason.trim() === ''}
              onClick={() => onClear(entry.id, entry.security_id, reason.trim())}
              className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {clearing ? 'Clearing…' : 'Clear from At-Risk'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

const DOT: Record<string, string> = {
  red: 'bg-red-500', yellow: 'bg-amber-400', green: 'bg-green-500', none: 'bg-gray-300',
}

function round(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}
