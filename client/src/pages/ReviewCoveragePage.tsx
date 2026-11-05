import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchReviewCoverage, coverageTotals, buildCoverageCsv,
  type SecurityCoverage, type CallStatus,
} from '@/lib/reviewCoverage'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'
import { EMPTY } from '@/lib/formatters'

/**
 * Review coverage — which earnings calls were reviewed, and which were never
 * answered.
 *
 * **Read-only, and it writes nothing.** The companion to the Review Calendar:
 * that page answers what is owed now, this one answers what was owed and never
 * done, which is the question an examiner asks. The whole report is assembled
 * on demand from the call history and `review_log`, both already records of
 * fact.
 *
 * It is a separate page rather than a tab on the calendar because it costs one
 * FMP request per holding — the calendar should not pay that to show a worklist
 * — and because the two are read at different times: the calendar weekly, this
 * before a review or an examination.
 */

const STATUS_STYLE: Record<CallStatus, string> = {
  reviewed: 'bg-green-100 text-green-800',
  missed: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-600',
}

const BASIS_LABEL = {
  process_start: 'since this system recorded its first review',
  first_held: 'since the firm first held it',
} as const

export function ReviewCoveragePage() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [onlyGaps, setOnlyGaps] = useState(true)

  const { data: rows, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.reviewCoverage,
    queryFn: fetchReviewCoverage,
    // One FMP request per holding, and the answer moves only when a company
    // reports or a review is recorded. Not worth re-fetching on every focus.
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const all = rows ?? []
  const totals = coverageTotals(all)
  const shown = onlyGaps ? all.filter((r) => r.missed > 0) : all
  const unreadable = all.filter((r) => r.callsUnreadable)

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([buildCoverageCsv(all)], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'review-coverage.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Review Coverage</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every earnings call of every held stock, and whether a review answered it.{' '}
            <Link to="/reviews" className="text-blue-600 hover:underline">Review Calendar →</Link>
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={all.length === 0}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {isLoading && <p className="mt-6 text-sm text-gray-500">Reading call histories…</p>}
      {error && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not build the report: {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Holdings" value={String(totals.securities)} />
            <Stat label="With gaps" value={String(totals.withGaps)} tone={totals.withGaps > 0 ? 'bad' : 'good'} />
            <Stat label="Calls reviewed" value={String(totals.reviewed)} />
            <Stat label="Calls missed" value={String(totals.missed)} tone={totals.missed > 0 ? 'bad' : 'good'} />
            {/* Rate over ANSWERABLE calls — a print from this morning is not
                counted against the firm, or the figure would drift down and
                back up every quarter for reasons unrelated to the work. */}
            <Stat
              label="Coverage"
              value={totals.rate == null ? EMPTY : `${(totals.rate * 100).toFixed(0)}%`}
              hint={`of ${totals.reviewed + totals.missed} answerable`}
            />
          </div>

          {totals.pending > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              {totals.pending} recent call{totals.pending === 1 ? '' : 's'} not yet counted —
              a review is only late once its due date has passed.
            </p>
          )}

          {unreadable.length > 0 && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No call history available for {unreadable.map((r) => r.securityId).join(', ')}.
              Reported rather than omitted — a holding missing from this report would read as
              one with nothing to answer for.
            </p>
          )}

          <label className="mt-5 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={onlyGaps}
              onChange={(e) => setOnlyGaps(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show only holdings with a missed call
          </label>

          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Security</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Oldest gap</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">Missed</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">Reviewed</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Covered from</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      {onlyGaps
                        ? 'Every answerable call has a review against it.'
                        : 'No held stocks to report on.'}
                    </td>
                  </tr>
                )}
                {shown.map((r) => (
                  <CoverageRow
                    key={r.securityId}
                    row={r}
                    open={expanded === r.securityId}
                    onToggle={() => setExpanded(expanded === r.securityId ? null : r.securityId)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* The window is the claim the whole report rests on, so it is stated
              on the page rather than left to be inferred from a column. */}
          <p className="mt-4 text-xs text-gray-500">
            A call counts only once the firm held the security and this system had begun
            recording reviews, whichever is later — the <span className="font-medium">Covered
            from</span> column names which. Funds and ETFs are excluded: their reviews are
            cadence-driven and have no call to answer.
          </p>
        </>
      )}
    </div>
  )
}

function CoverageRow({ row, open, onToggle }: {
  row: SecurityCoverage
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className={row.missed > 0 ? 'bg-red-50/40' : ''}>
        <td className="whitespace-nowrap px-4 py-3">
          <Link to="/reviews" className="font-medium text-gray-900">{row.securityId}</Link>
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          {row.oldestMissed ? (
            <span className="text-red-700">{formatDate(row.oldestMissed)}</span>
          ) : (
            <span className="text-gray-400">{EMPTY}</span>
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
          {row.missed > 0 ? row.missed : <span className="font-normal text-gray-400">0</span>}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.reviewed}</td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
          {row.coverageFrom ? (
            <>
              {formatDate(row.coverageFrom)}
              <span className="block text-gray-400">
                {row.coverageBasis ? BASIS_LABEL[row.coverageBasis] : ''}
              </span>
            </>
          ) : (
            // Not a zero — no review has ever been recorded, so there is no
            // process to measure this holding against.
            <span className="text-gray-400">no review ever recorded</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          <button onClick={onToggle} className="text-xs font-medium text-blue-600 hover:underline">
            {open ? 'Hide calls' : `${row.calls.length} call${row.calls.length === 1 ? '' : 's'}`}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-gray-50 px-4 py-3">
            {row.calls.length === 0 ? (
              <p className="text-xs text-gray-500">No calls inside the covered window.</p>
            ) : (
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 pr-4 font-medium">Earnings call</th>
                    <th className="py-1 pr-4 font-medium">Review due</th>
                    <th className="py-1 pr-4 font-medium">Reviewed</th>
                    <th className="py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {row.calls.map((c) => (
                    <tr key={c.date} className="border-t border-gray-200">
                      <td className="py-1.5 pr-4 text-gray-800">{formatDate(c.date)}</td>
                      <td className="py-1.5 pr-4 text-gray-600">{formatDate(c.reviewDueOn)}</td>
                      <td className="py-1.5 pr-4 text-gray-600">
                        {c.reviewedAt
                          ? `${formatDate(c.reviewedAt)} (${c.daysToReview}d)`
                          : EMPTY}
                      </td>
                      <td className="py-1.5">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[c.status]}`}>
                          {c.status === 'pending' ? 'not yet due' : c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function Stat({ label, value, hint, tone }: {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${
        tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-700' : 'text-gray-900'}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
