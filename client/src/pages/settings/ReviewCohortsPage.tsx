/**
 * ReviewCohortsPage — set, in one pass, which cohort each fund/ETF is reviewed
 * against.
 *
 * The same choice is available per-fund on the security detail page, but that is
 * one page load per fund; this exists because the initial pass is 42 decisions
 * and NULL is deliberately the starting state for all of them.
 *
 * Both scorecard totals are shown. They are one click away on the detail page
 * anyway, and without them the row gives no sense of what the choice implies.
 * The decision itself should rest on which cohort is the fair comparison — the
 * category and peer group NAMES — not on which one scores better.
 *
 * MS category (`category_name`) is shown as REFERENCE only, greyed and marked
 * "(ref)": it is Morningstar's own grouping and nothing ranks against it. The
 * scorecard ranks against `ycharts_benchmark_category`, which is a different and
 * usually broader bucket — three core bond funds can share one MS category and
 * one YCharts category while sitting in three different peer groups. It earns a
 * column because it is often the clearest description of what a fund actually
 * does, which is the question the cohort choice turns on.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fetchFundsForCohorts, setScorecardCohort, type SecurityDetail } from '@/lib/securities'
import { scorecardScore, type ScorecardCohort } from '@/lib/fundScorecard'
import { EMPTY, fmtText } from '@/lib/formatters'

/** Matches the scorecard's own bands — see FundScorecard.tsx. */
function scoreClass(score: number | null): string {
  if (score == null) return 'text-gray-400'
  if (score >= 70) return 'text-green-700'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-700'
}

function fmtScore(score: number | null): string {
  return score == null ? EMPTY : score.toFixed(1)
}

function CohortPicker({
  value, onPick, busy,
}: {
  value: ScorecardCohort | null
  onPick: (c: ScorecardCohort) => void
  busy: boolean
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 bg-gray-100 p-0.5 text-xs font-medium">
      {([['category', 'Category'], ['peer', 'Peer group']] as [ScorecardCohort, string][]).map(([c, label]) => (
        <button
          key={c}
          type="button"
          disabled={busy || value === c}
          onClick={() => onPick(c)}
          className={`rounded px-2.5 py-1 transition-colors disabled:cursor-default ${
            value === c ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function ReviewCohortsPage() {
  const queryClient = useQueryClient()
  const [unsetOnly, setUnsetOnly] = useState(false)
  const [pendingId, setPendingId] = useState<number | null>(null)

  const { data: funds = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.fundCohorts,
    queryFn: fetchFundsForCohorts,
  })

  const mutation = useMutation({
    mutationFn: ({ id, cohort }: { id: number; cohort: ScorecardCohort }) =>
      setScorecardCohort(id, cohort),
    onMutate: ({ id }) => setPendingId(id),
    onSuccess: (_d, { id, cohort }) => {
      // Patch the one row rather than invalidating. This list is 42 funds of
      // select('*'), and setting the whole book means ~40 clicks -- invalidating
      // would refetch every column of every fund each time, and the row would
      // visibly lag behind the click.
      queryClient.setQueryData<SecurityDetail[]>(QUERY_KEYS.fundCohorts, (prev) =>
        prev?.map((f) => (f.id === id ? { ...f, scorecard_cohort: cohort } : f)),
      )
      // The detail page reads the same column; usually unmounted, so this is free.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.security(id) })
    },
    onSettled: () => setPendingId(null),
  })

  // Scores are pure functions of the row, so memoise across re-renders rather
  // than recomputing 84 scorecards on every keystroke of the filter toggle.
  const rows = useMemo(
    () => funds.map((f: SecurityDetail) => ({
      fund: f,
      catScore: scorecardScore(f, 'category'),
      pgScore: scorecardScore(f, 'peer'),
    })),
    [funds],
  )

  const setCount = rows.filter((r) => r.fund.scorecard_cohort != null).length
  const visible = unsetOnly ? rows.filter((r) => r.fund.scorecard_cohort == null) : rows

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Review Cohorts</h1>
        <p className="mt-1 text-sm text-gray-500">
          Which cohort each fund is judged against at review. Unset funds are skipped by
          review automation rather than compared against a cohort that was never chosen.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{setCount}</span> of {rows.length} set
          {setCount < rows.length && (
            <span className="text-amber-700"> · {rows.length - setCount} still unset</span>
          )}
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={unsetOnly}
            onChange={(e) => setUnsetOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Show only unset
        </label>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load funds — {(error as Error).message}
        </p>
      )}
      {mutation.isError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not save that change — {(mutation.error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <th scope="col" className="whitespace-nowrap py-2.5 pl-4 pr-3 text-left">Fund</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left">
                  MS category <span className="font-normal normal-case text-gray-400">(ref)</span>
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left">Category</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right">Score</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left">Peer group</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right">Score</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right">Cohort</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">Loading funds…</td></tr>
              )}
              {!isLoading && visible.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                  {unsetOnly ? 'Every fund has a cohort set.' : 'No funds found.'}
                </td></tr>
              )}
              {visible.map(({ fund, catScore, pgScore }) => (
                <tr key={fund.id} className={fund.scorecard_cohort == null ? 'bg-amber-50/40' : 'bg-white'}>
                  <td className="py-2 pl-4 pr-3">
                    <div className="font-medium text-gray-900">{fund.security_id}</div>
                    <div className="max-w-[18rem] truncate text-xs text-gray-500" title={fund.security_name ?? ''}>
                      {fmtText(fund.security_name)}
                    </div>
                  </td>
                  <td className="max-w-[12rem] truncate px-3 py-2 text-xs italic text-gray-400" title={fund.category_name ?? ''}>
                    {fmtText(fund.category_name)}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-gray-600" title={fund.ycharts_benchmark_category ?? ''}>
                    {fmtText(fund.ycharts_benchmark_category)}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right text-xs font-semibold tabular-nums ${scoreClass(catScore)}`}>
                    {fmtScore(catScore)}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-gray-600" title={fund.peer_group_name ?? ''}>
                    {fmtText(fund.peer_group_name)}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right text-xs font-semibold tabular-nums ${scoreClass(pgScore)}`}>
                    {fmtScore(pgScore)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <CohortPicker
                      value={fund.scorecard_cohort}
                      busy={pendingId === fund.id}
                      onPick={(cohort) => mutation.mutate({ id: fund.id, cohort })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
