import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fetchHouseholdMembers, fetchHouseholdPositions } from '@/lib/households'

interface HouseholdViewProps {
  householdName: string
  currentClientId: number
}

export function HouseholdView({ householdName, currentClientId }: HouseholdViewProps) {
  const navigate = useNavigate()

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: QUERY_KEYS.householdMembers(householdName),
    queryFn: () => fetchHouseholdMembers(householdName),
  })

  const { data: posData, isLoading: posLoading, error: posError } = useQuery({
    queryKey: QUERY_KEYS.householdPositions(householdName),
    queryFn: () => fetchHouseholdPositions(householdName),
  })

  const { positions = [], portfolioNames = [] } = posData ?? {}

  const overlapPositions = positions.filter((p) => p.portfolioCount > 1)
  const singlePositions = positions.filter((p) => p.portfolioCount === 1)

  const isLoading = membersLoading || posLoading

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading household data…</p>
  }

  return (
    <div className="space-y-8">

      {/* Household members */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Household Members
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {members.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border px-4 py-3 ${
                m.id === currentClientId
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50 cursor-pointer'
              }`}
              onClick={() => m.id !== currentClientId && navigate(`/clients/${m.id}`)}
            >
              <p className="text-sm font-medium">{m.name}</p>
              <p className={`text-xs mt-0.5 ${m.id === currentClientId ? 'text-gray-400' : 'text-gray-500'}`}>
                {m.portfolioNames.length === 0
                  ? 'No portfolios'
                  : m.portfolioNames.length === 1
                  ? m.portfolioNames[0]
                  : `${m.portfolioNames.length} portfolios`}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Summary stats */}
      {portfolioNames.length > 0 && (
        <section>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
              <p className="text-2xl font-semibold text-gray-900">{portfolioNames.length}</p>
              <p className="mt-1 text-xs text-gray-500 uppercase tracking-wide">Portfolios</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
              <p className="text-2xl font-semibold text-gray-900">{positions.length}</p>
              <p className="mt-1 text-xs text-gray-500 uppercase tracking-wide">Unique Holdings</p>
            </div>
            <div className={`rounded-lg border p-4 text-center ${
              overlapPositions.length > 0
                ? 'border-amber-200 bg-amber-50'
                : 'border-gray-200 bg-white'
            }`}>
              <p className={`text-2xl font-semibold ${overlapPositions.length > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                {overlapPositions.length}
              </p>
              <p className={`mt-1 text-xs uppercase tracking-wide ${overlapPositions.length > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                Cross-Portfolio Overlaps
              </p>
            </div>
          </div>
        </section>
      )}

      {posError && (
        <p className="text-sm text-red-600">
          Failed to load positions:{' '}
          {posError instanceof Error ? posError.message : String(posError)}
        </p>
      )}

      {portfolioNames.length === 0 && !posLoading && (
        <div className="rounded-md border border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">No portfolios linked to any household members yet.</p>
        </div>
      )}

      {/* Cross-portfolio overlaps — show first */}
      {overlapPositions.length > 0 && (
        <section>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Cross-Portfolio Overlaps
            </h2>
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Review concentration risk
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            These securities are held across multiple portfolios in the household. Verify that the combined exposure is intentional and suitable.
          </p>

          <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-amber-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Security</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Asset Class</th>
                  {portfolioNames.map((pn) => (
                    <th key={pn} className="px-4 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {pn}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Max Weight</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Portfolios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {overlapPositions.map((pos) => (
                  <tr key={pos.securityId} className="hover:bg-amber-50/50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{pos.ticker}</p>
                      {pos.name && <p className="text-xs text-gray-500 truncate max-w-[160px]">{pos.name}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {pos.assetClass ?? '—'}
                    </td>
                    {portfolioNames.map((pn) => (
                      <td key={pn} className="px-4 py-2.5 text-right whitespace-nowrap">
                        {pos.byPortfolio[pn] != null
                          ? <span className="font-medium text-gray-900">{pos.byPortfolio[pn].toFixed(1)}%</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className="font-semibold text-amber-700">{pos.maxWeight.toFixed(1)}%</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {pos.portfolioCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* All other positions */}
      {singlePositions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            All Household Holdings
          </h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Security</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Asset Class</th>
                  {portfolioNames.map((pn) => (
                    <th key={pn} className="px-4 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {pn}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Max Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {singlePositions.map((pos) => (
                  <tr key={pos.securityId} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{pos.ticker}</p>
                      {pos.name && <p className="text-xs text-gray-500 truncate max-w-[160px]">{pos.name}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {pos.assetClass ?? '—'}
                    </td>
                    {portfolioNames.map((pn) => (
                      <td key={pn} className="px-4 py-2.5 text-right whitespace-nowrap">
                        {pos.byPortfolio[pn] != null
                          ? <span className="font-medium text-gray-900">{pos.byPortfolio[pn].toFixed(1)}%</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-medium text-gray-900">
                      {pos.maxWeight.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  )
}
