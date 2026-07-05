/**
 * IpsModelCompatibility
 *
 * Shows whether the model portfolio(s) the client's accounts are mapped to are
 * compatible with this client's IPS asset-class bands. Client-side (advisor) surface
 * only — the Investment Committee never reads the client IPS.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchIpsModelCompatibility, type PortfolioCompat, type IpsCompatIssue } from '@/lib/ipsCompatibility'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { IPS } from '@/lib/ips'

function issueText(i: IpsCompatIssue): string {
  return i.kind === 'above_max'
    ? `${i.assetClass} target ${i.modelTarget}% exceeds IPS max ${i.ipsMax}%`
    : `${i.assetClass} target ${i.modelTarget}% is below IPS min ${i.ipsMin}%`
}

function CompatRow({ row }: { row: PortfolioCompat }) {
  const ok = row.hasModel && row.issues.length === 0
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{row.portfolioName}</p>
        <p className="text-xs text-gray-400">{row.modelName ?? 'No model resolved'}</p>
      </div>
      <div className="shrink-0 text-right">
        {!row.hasModel ? (
          <span className="text-xs text-gray-400">Not checked</span>
        ) : ok ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            ✓ Within IPS bands
          </span>
        ) : (
          <ul className="space-y-0.5 text-right">
            {row.issues.map((i, idx) => (
              <li key={idx} className="text-xs font-medium text-amber-700">⚠ {issueText(i)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function IpsModelCompatibility({ clientId, ips }: { clientId: number; ips: IPS }) {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.ipsModelCompatibility(clientId),
    queryFn: () => fetchIpsModelCompatibility(clientId, ips),
  })

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Model Compatibility</p>
      {isLoading ? (
        <p className="text-sm text-gray-500">Checking…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Failed to check model compatibility.</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">No portfolios linked to this client.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {data.map((row) => <CompatRow key={row.portfolioName} row={row} />)}
        </div>
      )}
    </div>
  )
}
