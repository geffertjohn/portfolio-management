import { useQuery } from '@tanstack/react-query'
import { fetchFundPeerComparison, type FundPeerRow } from '@/lib/fundPeers'
import { getBroadAssetClass, type SecurityDetail } from '@/lib/securities'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fmtNum, fmtDecimalPct, EMPTY } from '@/lib/formatters'

/**
 * This fund against the others in its category — held and watched.
 *
 * SPLIT IN TWO ON PURPOSE. The Nov 2026 Foundation Conservative review turned
 * on a disagreement the committee kept rather than resolved: the portfolio
 * manager found VBILX and VBTLX are NOT one sleeve because their holdings
 * differ, while the risk manager found they ARE one position because their
 * realised returns sit 31bp apart over three years. Both were right about
 * different things, and a single blended table would have hidden that. So
 * BEHAVIOUR and COMPOSITION are shown separately: the first says how a fund has
 * done, the second whether it is the same bet.
 */

const ROLE_LABEL: Record<FundPeerRow['role'], string> = {
  subject: 'This fund', held: 'Held', watchlist: 'Watchlist', benchmark: 'Benchmark',
}
const ROLE_CLASS: Record<FundPeerRow['role'], string> = {
  subject: 'bg-gray-900 text-white',
  held: 'bg-indigo-50 text-indigo-700',
  watchlist: 'bg-teal-50 text-teal-700',
  benchmark: 'bg-amber-50 text-amber-800',
}

/**
 * Column headers for the eleven sectors.
 *
 * Taking the first word printed "CONSUMER" TWICE — cyclical and defensive are
 * different bets and the table gave them the same heading — and clipped "Basic
 * materials" to "Basic". The full label is on the cell's title.
 */
const SECTOR_ABBREV: Record<string, string> = {
  'Basic materials': 'Materials',
  'Communication services': 'Comms',
  'Consumer cyclical': 'Cons cyc',
  'Consumer defensive': 'Cons def',
  Energy: 'Energy',
  'Financial services': 'Financials',
  Healthcare: 'Health',
  Industrials: 'Indust',
  'Real estate': 'Real est',
  Technology: 'Tech',
  Utilities: 'Utils',
}

function pct(v: number | null) { return v == null ? EMPTY : fmtDecimalPct(v) }

/**
 * One book's weight, or the RANGE across several — never a total.
 *
 * VBILX sits in four portfolios between 3% and 33%; summing those printed
 * "91%", which is not a weight of anything.
 */
function weightLabel(r: FundPeerRow): string {
  if (r.books.length === 0) return EMPTY
  if (r.books.length === 1) return `${fmtNum(r.books[0].pct)}%`
  const lo = r.books[r.books.length - 1].pct
  const hi = r.books[0].pct
  return `${fmtNum(lo)}–${fmtNum(hi)}%`
}

export function FundPeerPanel({ security }: { security: SecurityDetail }) {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.fundPeers(security.security_id),
    queryFn: () => fetchFundPeerComparison(security),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <p className="text-sm text-gray-500">Reading the category…</p>
  if (error) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        Could not load the comparison: {(error as Error).message}
      </p>
    )
  }
  if (!data || data.rows.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        {security.category_name
          ? `No other fund in ${security.category_name} is held or watched.`
          : 'No category set, so there is nothing to compare against.'}
      </p>
    )
  }

  const { rows, categoryName, cohort, cohortIsUnanimous } = data

  // WHICH breakdown is meaningful is a property of the CATEGORY, not of the
  // numbers. Inferring it from the data does not work: PWB is an all-equity ETF
  // and YCharts still reports its bond sleeve as 100% government, so a
  // breakdown that reconciles to 100% says nothing about whether there is
  // anything to break down. The same artefact gives VWEAX, a high-yield bond
  // fund, 100% financial services off a negligible equity sleeve.
  const broad = getBroadAssetClass(security)
  const showBonds = broad === 'fixed income'
  const showSectors = broad === 'equity'

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          Alternatives in {categoryName}
        </h3>
        <span className="text-xs text-gray-400">
          {rows.length} fund{rows.length === 1 ? '' : 's'} · scored on {cohort}
        </span>
      </div>

      {/* Grading sleeve-mates on different yardsticks is what inverted the
          VBILX/VBTLX ranking. One cohort is forced so the totals compare; the
          reader is told where that differs from a fund's own page. */}
      {!cohortIsUnanimous && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          These funds do not all designate the same cohort. Every row is scored on{' '}
          <span className="font-semibold">{cohort}</span> so the totals are comparable —
          which means a fund designating the other one will show a different total here
          than on its own page.
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3 text-left font-medium">Fund</th>
              <th className="py-2 pr-3 text-right font-medium">Weight (by book)</th>
              <th className="py-2 pr-3 text-right font-medium">Score</th>
              <th className="py-2 pr-3 text-right font-medium">Expense</th>
              <th className="py-2 pr-3 text-right font-medium">Max DD 3Y</th>
              <th className="py-2 pr-3 text-right font-medium">Std dev 3Y</th>
              <th className="py-2 pr-3 text-right font-medium">Turnover</th>
              <th className="py-2 text-right font-medium">Holdings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.securityId}
                  className={`border-b border-gray-100 align-top ${
                    r.role === 'benchmark' ? 'border-t-2 border-t-gray-300 bg-gray-50/60' : ''}`}>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-gray-900">{r.securityId}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_CLASS[r.role]}`}>
                      {ROLE_LABEL[r.role]}
                    </span>
                  </div>
                  {r.name && <div className="text-xs text-gray-500">{r.name}</div>}
                  {r.books.length > 0 && (
                    <div className="text-[11px] text-gray-400">
                      {r.books.map((b) => `${b.portfolio} ${fmtNum(b.pct)}%`).join(' · ')}
                    </div>
                  )}
                  {/* Two sources on one line, so the row says which is which:
                      drawdown and volatility are the index's own, composition
                      is the tracking ETF's because YCharts computes none for an
                      index. */}
                  {r.compositionFrom && (
                    <div className="text-[11px] text-amber-700">
                      composition via {r.compositionFrom}
                    </div>
                  )}
                </td>
                {/* A RANGE across books, never a sum: percentages of different
                    portfolios cannot be added. Unheld is EMPTY, never 0% — a
                    zero reads as a position sized at nothing. */}
                <td className="py-2 pr-3 text-right tabular-nums text-gray-900">
                  {weightLabel(r)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums font-semibold text-gray-900">
                  {r.score == null ? EMPTY : fmtNum(r.score)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.expenseRatio)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.maxDrawdown3y)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.stdDev3y)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.turnover)}</td>
                <td className="py-2 text-right tabular-nums">
                  {r.holdings == null ? EMPTY : r.holdings.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showBonds && (
        <>
          <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-600">
            What they hold — bond sleeve
          </h4>
          <p className="mt-1 text-xs text-gray-500">
            Two funds can behave almost identically and still be different bets. VBILX and
            VBTLX sit 31bp apart over three years and 21 percentage points apart on
            mortgages.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3 text-left font-medium">Fund</th>
                  <th className="py-2 pr-3 text-right font-medium">Duration</th>
                  <th className="py-2 pr-3 text-right font-medium">SEC yield</th>
                  <th className="py-2 pr-3 text-right font-medium">Credit</th>
                  <th className="py-2 pr-3 text-right font-medium">Govt</th>
                  <th className="py-2 pr-3 text-right font-medium">Corp</th>
                  <th className="py-2 pr-3 text-right font-medium">Securitized</th>
                  <th className="py-2 pr-3 text-right font-medium">Muni</th>
                  <th className="py-2 pr-3 text-right font-medium">Other</th>
                  <th className="py-2 text-right font-medium">Sleeve</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = r.composition
                  const by = (l: string) => c.fixedIncome.find((f) => f.label === l)?.value ?? null
                  return (
                    <tr key={r.securityId}
                        className={`border-b border-gray-100 ${
                          r.role === 'benchmark' ? 'border-t-2 border-t-gray-300 bg-gray-50/60' : ''}`}>
                      <td className="py-2 pr-3 font-mono font-semibold text-gray-900">{r.securityId}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {c.effectiveDuration == null ? EMPTY : `${fmtNum(c.effectiveDuration)}y`}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(c.secYield)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {c.creditQuality == null ? EMPTY : fmtNum(c.creditQuality)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(by('Government'))}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(by('Corporate'))}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(by('Securitized'))}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(by('Municipal'))}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(by('Other'))}</td>
                      {/* The reconciliation, shown rather than asserted. Cash and
                          derivative sit outside this 100% by measurement. */}
                      <td className={`py-2 text-right tabular-nums ${
                        c.fixedIncomeReconciles === false ? 'font-semibold text-amber-700' : 'text-gray-400'
                      }`}>
                        {c.fixedIncomeSum == null ? EMPTY : pct(c.fixedIncomeSum)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showSectors && (
        <>
          <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-600">
            What they hold — sectors
          </h4>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3 text-left font-medium">Fund</th>
                  {rows[0].composition.sectors.map((s) => (
                    <th key={s.label} className="py-2 pr-3 text-right font-medium"
                        title={s.label}>
                      {SECTOR_ABBREV[s.label] ?? s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.securityId}
                      className={`border-b border-gray-100 ${
                        r.role === 'benchmark' ? 'border-t-2 border-t-gray-300 bg-gray-50/60' : ''}`}>
                    <td className="py-2 pr-3 font-mono font-semibold text-gray-900">{r.securityId}</td>
                    {r.composition.sectors.map((s) => (
                      <td key={s.label} className="py-2 pr-3 text-right tabular-nums">{pct(s.value)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Sector weights are a share of whatever equity sleeve a fund has, so on a bond
            fund they describe a negligible one — VWEAX reads 100% financial services off
            almost nothing. Read them within an equity category.
          </p>
        </>
      )}
    </section>
  )
}
