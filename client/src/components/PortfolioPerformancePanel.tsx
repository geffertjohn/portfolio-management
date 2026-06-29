import { useQuery } from '@tanstack/react-query'
import { computePortfolioPeriodReturns } from '@/lib/portfolioPerformance'
import { QUERY_KEYS } from '@/hooks/queryKeys'

const COLS: { key: keyof ReturnsRow; label: string }[] = [
  { key: 'oneDay', label: '1 Day' },
  { key: 'fiveDay', label: '5 Day' },
  { key: 'oneMonth', label: '1 Mo' },
  { key: 'threeMonth', label: '3 Mo' },
  { key: 'ytd', label: 'YTD' },
  { key: 'oneYear', label: '1 Yr' },
  { key: 'threeYear', label: '3 Yr' },
  { key: 'fiveYear', label: '5 Yr' },
  { key: 'tenYear', label: '10 Yr' },
  { key: 'allTime', label: 'All Time' },
]

type ReturnsRow = {
  oneDay: number | null; fiveDay: number | null; oneMonth: number | null; threeMonth: number | null
  ytd: number | null; oneYear: number | null; threeYear: number | null; fiveYear: number | null
  tenYear: number | null; allTime: number | null
}

const cell = (v: number | null) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`

export function PortfolioPerformancePanel({ portfolioName }: { portfolioName: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.portfolioPeriodReturns(portfolioName),
    queryFn: () => computePortfolioPeriodReturns(portfolioName),
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Performance</h3>
        <span className="text-xs text-gray-400">
          Buy-and-hold drift over dated allocations · stocks only · gross
          {data?.asOf ? ` · as of ${data.asOf}` : ''}
        </span>
      </div>

      {isLoading && <p className="px-4 py-6 text-sm text-gray-500">Pulling prices and computing returns…</p>}

      {error && (
        <p className="px-4 py-6 text-sm text-red-600">
          {error instanceof Error ? error.message : 'Failed to compute performance.'}
        </p>
      )}

      {data && !isLoading && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0f2d4d] text-white">
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-4 py-2 text-left font-semibold">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-900">{portfolioName}</td>
                  {COLS.map((c) => {
                    const v = data[c.key]
                    return (
                      <td key={c.key} className={`px-4 py-3 font-medium tabular-nums ${
                        v == null ? 'text-gray-400' : v >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {cell(v)}
                        {c.key === 'allTime' && data.inception && (
                          <div className="text-[10px] font-normal text-gray-400 tabular-nums">
                            {new Date(data.inception + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {data.notes.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-gray-500">
                {data.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
