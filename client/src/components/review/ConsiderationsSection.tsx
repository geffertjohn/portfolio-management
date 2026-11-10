import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  alternativesFor, watchlistAlternativesByCategory,
  type ProspectIdeaLite, type WatchlistAlternative,
} from '@/lib/prospects'
import { reviewableHoldings } from '@/lib/portfolioReviews'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'
import { fmtUtcLongDate, EMPTY } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import type { PortfolioPosition } from '@/types/position'

/**
 * The advisor's handoff to the investment committee.
 *
 * **It asks what each holding should be weighed AGAINST, not what to do with
 * it.** The step used to carry a per-holding Proposal, Target % and Rationale,
 * which asked the advisor to decide the review before the committee had looked
 * at it; the question an annual review actually turns on is whether a holding
 * is still the right fund for its sleeve, and that cannot be answered without
 * naming the alternatives. Those alternatives are the watchlist ideas already
 * recorded in the same `category_name` — the candidates the firm has written
 * down, rather than a universe assembled on the spot.
 *
 * **Still written BEFORE the committee looks**, and the handoff still freezes
 * the section: what the advisor set out for the committee and what the
 * committee answered must not be able to drift, or nothing records which came
 * first.
 */
export function ConsiderationsSection({
  positions,
  details,
  ideas,
  considerations,
  requestedAt,
  busy,
  onConsiderationsChange,
  onRequest,
  onCancelRequest,
}: {
  positions: PortfolioPosition[]
  /** `securities2` rows by ticker, for the category each holding is judged in. */
  details: Record<string, SecurityDetail>
  /**
   * Live watchlist ideas — the source of the alternatives column.
   *
   * `ProspectIdeaLite` because this reads four `securities2` fields; taking the
   * full shape would force the workspace to fetch the whole 93-column row per
   * idea to render a ticker and a name.
   */
  ideas: ProspectIdeaLite[]
  considerations: string
  requestedAt: string | null
  busy: boolean
  onConsiderationsChange: (value: string) => void
  onRequest: () => void
  onCancelRequest: () => void
}) {
  const holdings = useMemo(() => reviewableHoldings(positions), [positions])
  const locked = requestedAt !== null

  // Grouped once for the whole table rather than filtered per row: a Foundation
  // book is seven holdings against eleven ideas, and the shape of the question
  // is "which ideas sit in this sleeve", which is a grouping.
  const byCategory = useMemo(() => watchlistAlternativesByCategory(ideas), [ideas])
  const withAlternatives = holdings.filter(
    (h) => alternativesFor(byCategory, h.securityId, details[h.securityId]?.category_name).length > 0,
  ).length

  return (
    <div>
      <p className="text-sm text-gray-600">
        Every holding against the watchlist ideas that sit in the same category — what the
        committee should weigh it against. Add anything the numbers do not show below.
      </p>

      {locked && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-800">
            Handed to the committee on {fmtUtcLongDate(requestedAt)}. Frozen so their read and
            your proposal cannot drift apart.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onCancelRequest}
            className="shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50"
          >
            Withdraw handoff
          </button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2 font-medium">Holding</th>
              {/*
                The category the holding is JUDGED in, from `securities2`.
                A proposal is a statement about a fund relative to the others
                doing the same job, and the category is what says which those
                are — it is the key the scorecard cohort, the peer comparison
                and the watchlist's fund ideas all hang off. Without it on the
                row the advisor is proposing against a ticker.
              */}
              <th className="py-1 pr-2 font-medium">Category</th>
              <th className="py-1 pr-2 font-medium w-20 text-right">Weight</th>
              <th className="py-1 font-medium">
                Alternatives <span className="font-normal text-gray-400">on the watchlist</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const category = details[h.securityId]?.category_name ?? null
              const alts = alternativesFor(byCategory, h.securityId, category)
              return (
                <tr key={h.securityId} className="border-t border-gray-100">
                  <td className="whitespace-nowrap py-1.5 pr-2 align-top font-medium text-gray-800" title={h.name ?? undefined}>
                    {h.ticker}
                  </td>
                  <td className="py-1.5 pr-2 align-top text-gray-600">
                    <CategoryCell security={details[h.securityId] ?? null} />
                  </td>
                  <td className="py-1.5 pr-2 align-top text-right tabular-nums text-gray-500">
                    {h.weight.toFixed(2)}%
                  </td>
                  <td className="py-1.5 align-top">
                    <AlternativesCell alternatives={alts} hasCategory={!!category?.trim()} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">
          Anything else for the committee <span className="text-gray-400">(optional)</span>
        </label>
        <AutoGrowTextarea
          value={considerations}
          disabled={locked}
          onChange={onConsiderationsChange}
          maxHeightPx={320}
          placeholder="Concerns, constraints, anything you want them to weigh that the numbers do not show…"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-50"
        />
      </div>

      {!locked && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-600">
            {withAlternatives === 0
              ? 'No holding has an alternative on the watchlist — the committee will be asked to judge each one on its own.'
              : `${withAlternatives} of ${holdings.length} holdings have an alternative on the watchlist.`}
            {' '}The committee runs in Claude Code, so this queues the review rather than starting it.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onRequest}
            className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? 'Handing off…' : 'Hand off to committee'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The holding's vendor category, or why there isn't one.
 *
 * A missing category is NOT cosmetic and is called out rather than dashed
 * away: `resolveAssetClass` reads this column, so a fund without one drops out
 * of the allocation rollup as unclassified weight — the gotcha-23 failure,
 * which took weeks to spot on VMSAX because an unclassified holding looks
 * exactly like an unfunded model sleeve. The wording matches the Watchlist's
 * "Category pending", since the cause is the same: a workbook row the next
 * YCharts refresh will fill.
 */
function CategoryCell({ security }: { security: SecurityDetail | null }) {
  if (!security) {
    return (
      <span className="text-xs text-gray-400" title="No securities2 row for this ticker">
        {EMPTY}
      </span>
    )
  }
  const category = security.category_name?.trim()
  if (!category) {
    return (
      <span
        className="text-xs text-amber-700"
        title="No category_name on securities2 — this holding is also dropped from the allocation rollup until the next YCharts refresh fills it."
      >
        Category pending
      </span>
    )
  }
  return <span className="text-xs">{category}</span>
}

/**
 * The watchlist ideas competing with one holding.
 *
 * **An empty cell is three different statements**, and collapsing them would
 * make the most actionable one invisible. No category at all means the holding
 * cannot be matched to anything (the workbook has not filled it); a category
 * with no ideas means the firm has recorded no candidate in that sleeve, which
 * is a finding about the watchlist rather than about the holding; and ideas
 * present is the comparison the committee is being asked to make.
 */
function AlternativesCell({
  alternatives, hasCategory,
}: {
  alternatives: WatchlistAlternative[]
  hasCategory: boolean
}) {
  if (!hasCategory) {
    return (
      <span className="text-xs text-gray-400" title="Without a category this holding cannot be matched to a watchlist idea.">
        no category to match on
      </span>
    )
  }
  if (alternatives.length === 0) {
    return <span className="text-xs text-gray-400">none on the watchlist</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {alternatives.map((a) => (
        <Link
          key={a.securityId}
          to={`/security/${a.numericId}`}
          title={a.name ?? undefined}
          className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
        >
          {a.securityId}
        </Link>
      ))}
    </div>
  )
}
