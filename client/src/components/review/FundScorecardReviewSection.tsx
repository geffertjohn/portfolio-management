import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  buildFundScorecard, fmtScorecardValue, type ScorecardCohort, type ScorecardRow,
} from '@/lib/fundScorecard'
import { fetchSecurityDetailsByIds, type SecurityDetail } from '@/lib/securities'
import { failingScorecardRows } from '@/lib/fundAtRisk'
import { isCashTicker } from '@/lib/positionBands'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fmtDecimalPct } from '@/lib/formatters'
import type { PortfolioPosition } from '@/types/position'
import type { AtRiskEntry } from '@/lib/atRisk'

/**
 * The quarterly fund review's evidence step: every holding's cohort scorecard,
 * with the flag decision beside it.
 *
 * **The decision sits with the evidence on purpose.** The alternative was to
 * read scorecards here and flag in the summary, which asks the advisor to
 * decide away from the numbers they are deciding on.
 *
 * The cohort shown is the one `securities2.scorecard_cohort` names for that
 * fund — the same default the per-security review modal uses, so the two
 * surfaces cannot show a holding a different scorecard. A fund with no cohort
 * set is said so rather than quietly defaulted, because which cohort a fund is
 * judged against is a governed choice.
 */
export function FundScorecardReviewSection({
  positions,
  atRisk,
  flagging,
  onFlag,
}: {
  positions: PortfolioPosition[]
  /** Live At-Risk entries, so a holding already flagged is not offered again. */
  atRisk: AtRiskEntry[]
  /** securityId currently being written, for the button's pending state. */
  flagging: string | null
  onFlag: (args: {
    securityId: string
    cohort: ScorecardCohort
    rows: ScorecardRow[]
    note: string
  }) => void
}) {
  const holdings = useMemo(
    () => positions.filter((p) => p.ticker && !isCashTicker(p.ticker) && !isCashTicker(p.securityId)),
    [positions],
  )
  const ids = useMemo(() => holdings.map((h) => h.securityId), [holdings])

  const { data: details = {}, isLoading } = useQuery({
    queryKey: QUERY_KEYS.securityDetails(ids),
    queryFn: () => fetchSecurityDetailsByIds(ids),
    enabled: ids.length > 0,
  })

  const flaggedIds = useMemo(
    () => new Set(atRisk.filter((a) => !a.removed_at).map((a) => a.security_id)),
    [atRisk],
  )

  if (isLoading) return <p className="text-sm text-gray-500">Loading scorecards…</p>
  if (holdings.length === 0) {
    return <p className="text-sm text-gray-500">This portfolio has no non-cash holdings.</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Each holding against the cohort it is judged on. A metric in the bottom tier is the
        evidence for flagging it At-Risk; the readings that failed are frozen onto the entry
        so next quarter can ask whether they have improved.
      </p>

      {holdings.map((h) => (
        <HoldingScorecard
          key={h.securityId}
          position={h}
          security={details[h.securityId] ?? null}
          alreadyFlagged={flaggedIds.has(h.securityId)}
          flagging={flagging === h.securityId}
          onFlag={onFlag}
        />
      ))}
    </div>
  )
}

function HoldingScorecard({
  position, security, alreadyFlagged, flagging, onFlag,
}: {
  position: PortfolioPosition
  security: SecurityDetail | null
  alreadyFlagged: boolean
  flagging: boolean
  onFlag: (args: { securityId: string; cohort: ScorecardCohort; rows: ScorecardRow[]; note: string }) => void
}) {
  // `scorecard_cohort` is the governed choice; the toggle is for looking, and
  // whichever cohort is on screen is the one a flag is recorded against.
  const designated = (security?.scorecard_cohort === 'peer' ? 'peer' : 'category') as ScorecardCohort
  const [cohort, setCohort] = useState<ScorecardCohort>(designated)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)

  const scorecard = useMemo(
    () => (security ? buildFundScorecard(security, cohort) : null),
    [security, cohort],
  )
  const failing = scorecard ? failingScorecardRows(scorecard.rows) : []

  if (!security) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm font-medium text-gray-900">{position.ticker}</p>
        <p className="mt-0.5 text-xs text-amber-800">
          No <code>securities2</code> row, so there is no scorecard to show. The holding is in
          the book but not in the securities table.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {position.ticker}
            <span className="ml-2 font-normal text-gray-500">{security.security_name ?? position.name}</span>
          </p>
          <p className="text-xs text-gray-400">
            {fmtDecimalPct(position.weight / 100)} of the book
            {!security.scorecard_cohort && ' · no cohort set — showing category'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-gray-300 text-xs">
            {(['category', 'peer'] as ScorecardCohort[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCohort(c)}
                className={`px-2 py-1 ${cohort === c ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} ${c === 'category' ? 'rounded-l-md' : 'rounded-r-md'}`}
              >
                {c === 'category' ? 'Category' : 'Peer group'}
                {designated === c && <span className="ml-1 opacity-60">•</span>}
              </button>
            ))}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-400">Score</p>
            <p className="text-sm font-semibold tabular-nums text-gray-900">
              {scorecard?.hasData ? scorecard.total.toFixed(1) : '—'}
            </p>
          </div>
        </div>
      </div>

      {!scorecard?.hasData ? (
        <p className="px-3 py-2 text-xs text-amber-800">
          No ranks on file for this cohort, so nothing can be graded. Check the YCharts import.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="px-3 py-1.5 text-left font-medium">Metric</th>
                  <th className="px-2 py-1.5 text-right font-medium">Rank / Value</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cohort</th>
                  <th className="px-2 py-1.5 text-center font-medium">Tier</th>
                  <th className="px-2 py-1.5 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.rows.map((r) => (
                  <tr key={r.label} className="border-t border-gray-100">
                    <td className="px-3 py-1 text-gray-700">{r.label}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-900">
                      {fmtScorecardValue(r.displayVal, r.valueType)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-400">{r.size ?? '—'}</td>
                    <td className="px-2 py-1 text-center">
                      {r.tier == null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className={`inline-flex min-w-[1.25rem] justify-center rounded px-1 py-0.5 font-medium ${TIER_CLASS[r.tier]}`}>
                          {r.tier}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-500">
                      {r.score == null ? '—' : r.score.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-100 px-3 py-2">
            {alreadyFlagged ? (
              <p className="text-xs text-gray-600">
                <span className="font-medium text-amber-700">Already At-Risk.</span>{' '}
                Shown in the summary, where it can be cleared.
              </p>
            ) : failing.length === 0 ? (
              <p className="text-xs text-green-700">
                No bottom-tier metric against this cohort — nothing to flag.
              </p>
            ) : !open ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-600">
                  <span className="font-medium text-red-700">
                    {failing.length} bottom-tier {failing.length === 1 ? 'metric' : 'metrics'}
                  </span>{' '}
                  — {failing.map((r) => r.label).join(', ')}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Flag At-Risk
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-600">
                  Flagging records these {failing.length} readings and opens a sell timer sized on
                  how many failed:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
                  {failing.map((r) => (
                    <li key={r.label}>
                      {r.label} — {fmtScorecardValue(r.displayVal, r.valueType)}
                      {r.size != null && ` of ${r.size}`}
                    </li>
                  ))}
                </ul>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Why this one, in your words (optional)…"
                  className="mt-2 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={flagging}
                    onClick={() => { setOpen(false); setNote('') }}
                    className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={flagging}
                    onClick={() => onFlag({ securityId: position.securityId, cohort, rows: scorecard.rows, note })}
                    className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {flagging ? 'Flagging…' : `Flag At-Risk vs ${cohort === 'category' ? 'category' : 'peer group'}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const TIER_CLASS: Record<number, string> = {
  1: 'bg-green-100 text-green-800',
  2: 'bg-green-50 text-green-700',
  3: 'bg-amber-100 text-amber-800',
  4: 'bg-red-100 text-red-800',
}
