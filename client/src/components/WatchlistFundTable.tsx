import { Fragment } from 'react'
import {
  PENDING_GROUP_KEY, UNCLASSIFIED_GROUP_KEY,
  type WatchlistFundRow, type WatchlistGroup,
} from '@/lib/watchlistGroups'
import { fmtDecimalPct, fmtNum, EMPTY } from '@/lib/formatters'
import type { ScoreBand } from '@/lib/fundScorecard'

/**
 * Watched funds as one table, grouped by the sleeve each would fill.
 *
 * Replaces the ETF / Mutual Fund card columns. The vehicle was never the
 * question an idea list answers — FELC and ICAFX are both Large Blend and both
 * compete for the same sleeve, and they used to sit in different columns where
 * no comparison between them was possible. Type survives as a column, because
 * it still decides how a thing trades; it just stops organising the page.
 *
 * Deciding WHICH rows appear under which heading belongs to
 * `lib/watchlistGroups.ts`, which is pure and tested. This file only renders.
 */

/** Matches `lib/scorecardColor.ts`'s vocabulary; the band itself is decided there. */
const SCORE_CLASS: Record<ScoreBand, string> = {
  green: 'text-emerald-700',
  yellow: 'text-amber-700',
  red: 'text-red-700',
}

const COL_COUNT = 8

export function WatchlistFundTable({
  groups,
  onOpen,
  onRemove,
  removePending,
}: {
  groups: WatchlistGroup[]
  onOpen: (row: WatchlistFundRow) => void
  onRemove: (row: WatchlistFundRow) => void
  removePending: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 pl-4 pr-2 font-medium">Ticker</th>
            <th className="py-2 pr-2 font-medium">Name</th>
            <th className="py-2 pr-2 font-medium">Type</th>
            <th className="py-2 pr-2 text-right font-medium">Score</th>
            <th className="py-2 pr-2 text-right font-medium">Expense</th>
            <th className="py-2 pr-2 text-right font-medium">3 Yr</th>
            <th className="py-2 pr-2 text-right font-medium">5 Yr</th>
            <th className="py-2 pr-4 font-medium" />
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <GroupHeader group={group} />
              {group.subGroups
                ? group.subGroups.map((sub) => (
                    <Fragment key={sub.key}>
                      <SubGroupHeader label={sub.label} empty={sub.funds.length === 0} />
                      {sub.funds.map((f) => (
                        <FundRow
                          key={f.securityId}
                          row={f}
                          indented
                          onOpen={onOpen}
                          onRemove={onRemove}
                          removePending={removePending}
                        />
                      ))}
                    </Fragment>
                  ))
                : group.funds.map((f) => (
                    <FundRow
                      key={f.securityId}
                      row={f}
                      onOpen={onOpen}
                      onRemove={onRemove}
                      removePending={removePending}
                    />
                  ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A sleeve heading.
 *
 * **An empty sleeve is greyed, not hidden.** "Nothing good is available" and
 * "nobody has looked" are different states of an idea list and only one of
 * them is visible if the row is dropped — which is the whole reason for
 * grouping by the firm's own fourteen classes rather than by what happens to
 * be on the list. The two trailing groups say what is wrong instead: see
 * `watchlistGroups.ts` on why they are separate.
 */
function GroupHeader({ group }: { group: WatchlistGroup }) {
  const empty = group.count === 0
  const special = group.key === UNCLASSIFIED_GROUP_KEY || group.key === PENDING_GROUP_KEY
  return (
    <tr className={special ? 'bg-amber-50' : 'bg-gray-50'}>
      <td colSpan={COL_COUNT} className="border-y border-gray-200 py-1.5 pl-4 pr-4">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-xs font-semibold uppercase tracking-wide ${
              special ? 'text-amber-800' : empty ? 'text-gray-400' : 'text-gray-700'
            }`}
          >
            {group.label}
          </span>
          <span className="text-xs text-gray-400">
            {group.key === PENDING_GROUP_KEY
              ? 'Added to the next YCharts refresh — categories arrive tomorrow morning'
              : group.key === UNCLASSIFIED_GROUP_KEY
                ? 'Vendor category not in the asset-class map — these are excluded from allocation rollups'
                : empty
                  ? 'No ideas recorded'
                  : `${group.count}`}
          </span>
        </div>
      </td>
    </tr>
  )
}

/** Blend / Growth / Value under US Large Cap — the only nested level. */
function SubGroupHeader({ label, empty }: { label: string; empty: boolean }) {
  return (
    <tr>
      <td colSpan={COL_COUNT} className="border-b border-gray-100 py-1 pl-8 pr-4">
        <span className={`text-xs font-medium ${empty ? 'text-gray-400' : 'text-gray-600'}`}>
          {label}
          {empty && <span className="ml-2 text-gray-400">— no ideas recorded</span>}
        </span>
      </td>
    </tr>
  )
}

function FundRow({
  row,
  indented,
  onOpen,
  onRemove,
  removePending,
}: {
  row: WatchlistFundRow
  indented?: boolean
  onOpen: (row: WatchlistFundRow) => void
  onRemove: (row: WatchlistFundRow) => void
  removePending: boolean
}) {
  const openable = row.numericId != null
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className={`py-2 pr-2 font-medium text-gray-900 ${indented ? 'pl-8' : 'pl-4'}`}>
        {openable ? (
          <button
            type="button"
            onClick={() => onOpen(row)}
            className="text-indigo-700 hover:underline"
          >
            {row.securityId}
          </button>
        ) : (
          row.securityId
        )}
      </td>
      <td className="max-w-[22rem] truncate py-2 pr-2 text-gray-600" title={row.name ?? undefined}>
        {row.name ?? EMPTY}
      </td>
      <td className="py-2 pr-2">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {row.type === 'ETF' ? 'ETF' : 'Fund'}
        </span>
      </td>
      <td className="py-2 pr-2 text-right tabular-nums">
        <ScoreCell row={row} />
      </td>
      <td className="py-2 pr-2 text-right tabular-nums text-gray-700">
        {row.expenseRatio != null ? fmtDecimalPct(row.expenseRatio) : EMPTY}
      </td>
      <td className="py-2 pr-2 text-right tabular-nums text-gray-700">
        {row.return3y != null ? fmtDecimalPct(row.return3y) : EMPTY}
      </td>
      <td className="py-2 pr-2 text-right tabular-nums text-gray-700">
        {row.return5y != null ? fmtDecimalPct(row.return5y) : EMPTY}
      </td>
      <td className="py-2 pl-2 pr-4 text-right">
        <button
          type="button"
          disabled={removePending}
          onClick={() => onRemove(row)}
          className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          Remove
        </button>
      </td>
    </tr>
  )
}

/**
 * The scorecard total, banded, with the cohort it was graded in.
 *
 * **An unset cohort is marked.** `designatedCohort` reads a null as `category`,
 * so a fund with no cohort still produces a number — and that number looks
 * exactly like one somebody chose the basis for. The dagger says it is a
 * default, which is the earliest point it can be fixed, while the idea is
 * still an idea rather than a holding under review. (The same argument as the
 * "No cohort" badge the cards carried.)
 */
function ScoreCell({ row }: { row: WatchlistFundRow }) {
  if (row.score == null) return <span className="text-gray-300">{EMPTY}</span>
  return (
    <span
      className={`font-semibold ${row.band ? SCORE_CLASS[row.band] : 'text-gray-700'}`}
      title={
        row.cohortSet
          ? `Graded against its ${row.cohort === 'peer' ? 'peer group' : 'Morningstar category'}`
          : 'No scorecard cohort set — graded against its Morningstar category by default. Open the security to choose one.'
      }
    >
      {fmtNum(row.score)}
      {!row.cohortSet && <span className="ml-0.5 font-normal text-amber-600">†</span>}
    </span>
  )
}
