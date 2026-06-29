import type { CrossPortfolioCheck } from '@/lib/firmCompliance'

interface CrossPortfolioSectionProps {
  crossPortfolioChecks: CrossPortfolioCheck[]
  consistencyThreshold: number
  consistencyExpanded: boolean
  setConsistencyExpanded: (updater: (v: boolean) => boolean) => void
}

export function CrossPortfolioSection({
  crossPortfolioChecks,
  consistencyThreshold,
  consistencyExpanded,
  setConsistencyExpanded,
}: CrossPortfolioSectionProps) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Cross-Portfolio Consistency</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Portfolios in the same investment objective should hold the same securities at similar weights.
          Deviations &gt; {consistencyThreshold}% are flagged.
        </p>
      </div>
      <div className="space-y-4">
        {crossPortfolioChecks.filter((g) => g.deviations.length > 0).map(({ objective, names, deviations }) => {
          const hasBreaches = deviations.length > 0
          return (
            <div key={objective} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setConsistencyExpanded((v) => !v)}
                className={`flex w-full items-center justify-between border-b px-5 py-3 text-left ${
                  hasBreaches ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${consistencyExpanded ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{objective}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{names.length} portfolios · {deviations.length} deviation{deviations.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${hasBreaches ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {hasBreaches ? 'Inconsistent' : 'Consistent'}
                </span>
              </button>
              {consistencyExpanded && (
                deviations.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-500">All portfolios consistent — no deviations exceed {consistencyThreshold}%.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm divide-y divide-gray-100">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-5 py-2.5 text-left font-semibold text-gray-900">Security</th>
                          {names.map((n) => (
                            <th key={n} className="w-28 px-4 py-2.5 text-right font-semibold text-gray-900 truncate max-w-[7rem]">{n}</th>
                          ))}
                          <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Deviation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {deviations.map(({ securityId, weights, deviation }) => (
                          <tr key={securityId} className="bg-red-50">
                            <td className="px-5 py-2.5 font-medium text-gray-900">{securityId}</td>
                            {names.map((n) => (
                              <td key={n} className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                                {weights[n] != null ? `${weights[n].toFixed(1)}%` : <span className="text-gray-400">—</span>}
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-red-700">{deviation.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
