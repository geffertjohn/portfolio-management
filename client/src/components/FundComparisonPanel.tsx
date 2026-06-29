/**
 * FundComparisonPanel
 *
 * Fund analog of the stock AlternativesPanel. Shows the fund alongside its
 * related/alternative funds (from security_related_securities) across two
 * tables — Risk & Ratios and Trailing Returns. Unlike stocks, fund metrics
 * have no on-demand source, so they're read from the stored securities2 columns
 * (populated from the YCharts template's "Related" sheet).
 */
import { useQuery } from '@tanstack/react-query'
import { fmtDecimalPct, fmtNum, EMPTY } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import { fetchFundComparison, type FundComparisonRow } from '@/lib/securities'
import { QUERY_KEYS } from '@/hooks/queryKeys'

type Col = { label: string; key: keyof FundComparisonRow; fmt: (v: number | null) => string }

const pct = (v: number | null) => (v != null && Number.isFinite(v) ? fmtDecimalPct(v) : EMPTY)
const num = (v: number | null) => (v != null && Number.isFinite(v) ? fmtNum(v) : EMPTY)

const RISK_COLS: Col[] = [
  { label: 'Expense Ratio', key: 'expense_ratio_generic', fmt: pct },
  { label: 'Sharpe 3Y', key: 'historical_sharpe_3y', fmt: num },
  { label: 'Sortino 3Y', key: 'historical_sortino_3y', fmt: num },
  { label: 'Std Dev 3Y', key: 'quarterly_standard_deviation_annualized_3y', fmt: pct },
  { label: 'Max Drawdown 3Y', key: 'max_drawdown_3y', fmt: pct },
]

const RETURN_COLS: Col[] = [
  { label: '1M', key: 'one_month_total_return_nav', fmt: pct },
  { label: '3M', key: 'three_month_total_return_nav', fmt: pct },
  { label: 'YTD', key: 'ytd_total_return_nav', fmt: pct },
  { label: '1Y', key: 'one_year_total_return_nav', fmt: pct },
  { label: '3Y', key: 'annualized_three_year_total_return_nav', fmt: pct },
  { label: '5Y', key: 'annualized_five_year_total_return_nav', fmt: pct },
]

const CELL = 'whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900'

export function FundComparisonPanel({ security }: { security: SecurityDetail }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.fundComparison(security.security_id),
    queryFn: () => fetchFundComparison(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })

  if (isLoading || rows.length <= 1) return null // nothing to compare against

  function renderTable(title: string, columns: Col[]) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100">
                <th className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Position</th>
                <th className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Ticker</th>
                {columns.map((c) => (
                  <th key={c.label} className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-gray-700">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={r.security_id} className={i === 0 ? 'bg-white' : i % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                  <th scope="row" className={`max-w-[16rem] truncate py-2 pl-3 pr-4 text-left ${i === 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                    {r.security_name ?? r.security_id}
                  </th>
                  <td className="whitespace-nowrap py-2 pl-3 pr-4 text-left text-gray-600">{r.security_id}</td>
                  {columns.map((c) => (
                    <td key={c.label} className={CELL}>{c.fmt(r[c.key] as number | null)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Alternatives</h2>
      <div className="mt-6 space-y-6">
        {renderTable('Risk & Ratios', RISK_COLS)}
        {renderTable('Trailing Returns', RETURN_COLS)}
      </div>
    </div>
  )
}
