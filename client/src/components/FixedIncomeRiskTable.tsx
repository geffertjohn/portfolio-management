import { fmtNum, fmtDecimalPct } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'

type Row = {
  label: string
  fund3y: string
  peer3y: string
  fund5y: string
  peer5y: string
}

function buildRows(s: SecurityDetail): Row[] {
  return [
    {
      label: 'Sharpe ratio',
      fund3y: fmtNum(s.historical_sharpe_3y),
      peer3y: '—',
      fund5y: fmtNum(s.historical_sharpe_5y),
      peer5y: '—',
    },
    {
      label: 'Sortino ratio',
      fund3y: fmtNum(s.historical_sortino_3y),
      peer3y: '—',
      fund5y: fmtNum(s.historical_sortino_5y),
      peer5y: '—',
    },
    {
      label: 'Max drawdown',
      fund3y: fmtDecimalPct(s.max_drawdown_3y),
      peer3y: '—',
      fund5y: fmtDecimalPct(s.max_drawdown_5y),
      peer5y: '—',
    },
    {
      label: 'Standard deviation',
      fund3y: fmtDecimalPct(s.quarterly_standard_deviation_annualized_3y),
      peer3y: '—',
      fund5y: fmtDecimalPct(s.quarterly_standard_deviation_annualized_5y),
      peer5y: '—',
    },
    {
      label: 'Beta (vs category)',
      fund3y: fmtNum(s.beta_3y_vs_category),
      peer3y: '—',
      fund5y: fmtNum(s.beta_5y_vs_category),
      peer5y: '—',
    },
  ]
}

function Cell({ value }: { value: string }) {
  const empty = value === '—'
  return (
    <td
      className={`px-4 py-2.5 text-right tabular-nums text-sm ${empty ? 'text-gray-400' : 'text-gray-900'}`}
    >
      {value}
    </td>
  )
}

export function FixedIncomeRiskTable({ security }: { security: SecurityDetail }) {
  const rows = buildRows(security)

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-40 px-4 py-2.5" />
            <th
              colSpan={2}
              className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-600 border-b border-gray-200"
            >
              3Y
            </th>
            <th
              colSpan={2}
              className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-600 border-b border-gray-200"
            >
              5Y
            </th>
          </tr>
          <tr className="bg-gray-50/80">
            <th className="px-4 py-2.5" />
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
              {security.security_id}
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
              Peer Group
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
              {security.security_id}
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
              Peer Group
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="whitespace-nowrap px-4 py-2.5 text-left text-sm font-medium text-gray-800"
              >
                {row.label}
              </th>
              <Cell value={row.fund3y} />
              <Cell value={row.peer3y} />
              <Cell value={row.fund5y} />
              <Cell value={row.peer5y} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
