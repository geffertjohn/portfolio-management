import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import {
  fetchIndexConstituents,
  fetchBaselines,
  INDEX_META,
  type IndexKey,
} from '@/lib/fmpIndexMovers'
import { fetchSecurities } from '@/lib/securities'
import { useIndexMovers, type Mover } from '@/hooks/useIndexMovers'
import { fmtUsd, fmtSignedPct } from '@/lib/formatters'

const INDEX_KEYS = Object.keys(INDEX_META) as IndexKey[]
/** Baseline refresh cadence. FMP's 100-symbol websocket cap rules out streaming
 * a 500-name board, so prices are polled instead. */
const POLL_MS = 5000

function LiveDot({ active }: { active: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
      <span className={`h-2 w-2 rounded-full ${active ? 'animate-pulse bg-green-500' : 'bg-gray-300'}`} />
      {active ? 'Live' : 'Loading…'}
    </span>
  )
}

function MoversTable({
  title,
  rows,
  positive,
  trackedIds,
}: {
  title: string
  rows: Mover[]
  positive: boolean
  /** UPPER ticker → securities2 numeric id, for symbols in the tracked universe. */
  trackedIds: Record<string, number>
}) {
  const accent = positive ? 'text-green-600' : 'text-red-600'
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs italic text-gray-400">No data yet</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs font-semibold text-gray-500">
              <th className="px-3 py-2 w-8">#</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">% Chg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((m, i) => {
              const trackedId = trackedIds[m.symbol]
              return (
              <tr key={m.symbol} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs tabular-nums text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-semibold text-gray-900">
                  {trackedId != null ? (
                    <Link
                      to={`/security/${trackedId}`}
                      title="In your securities"
                      className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      {m.symbol}
                    </Link>
                  ) : (
                    m.symbol
                  )}
                </td>
                <td className="px-3 py-2 max-w-[14rem] truncate text-gray-600">{m.name ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtUsd(m.price)}</td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${accent}`}>
                  {fmtSignedPct(m.changePct)}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function IndexMoversPage() {
  const [index, setIndex] = useState<IndexKey>('sp500')

  const { data: constituents = [], isLoading: loadingConstituents, error: constituentsError } = useQuery({
    queryKey: QUERY_KEYS.indexConstituents(index),
    queryFn: () => fetchIndexConstituents(index),
    staleTime: 1000 * 60 * 60 * 24, // membership changes rarely — cache for a day
  })

  const symbols = useMemo(() => constituents.map((c) => c.symbol), [constituents])

  const {
    data: baselines = {},
    isLoading: loadingBaselines,
    isFetching: fetchingBaselines,
    dataUpdatedAt,
  } = useQuery({
    queryKey: QUERY_KEYS.indexBaselines(index),
    queryFn: () => fetchBaselines(symbols),
    enabled: symbols.length > 0,
    refetchInterval: POLL_MS, // poll prices (pauses while the tab is hidden)
  })

  const { gainers, losers, coverage } = useIndexMovers(constituents, baselines)

  // Mark constituents that live in securities2 (the tracked universe) and link them.
  const { data: tracked = [] } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
    staleTime: 1000 * 60 * 60,
  })
  const trackedIds = useMemo(
    () => Object.fromEntries(tracked.map((s) => [s.security_id.toUpperCase(), s.id])),
    [tracked],
  )

  const loading = loadingConstituents || (symbols.length > 0 && loadingBaselines)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Index Movers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Top 20 gainers and losers among index constituents — refreshed every {POLL_MS / 1000}s while this page is open.
          </p>
        </div>
        <LiveDot active={fetchingBaselines || Object.keys(baselines).length > 0} />
      </div>

      {/* Index selector */}
      <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
        {INDEX_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setIndex(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              index === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {INDEX_META[k].label}
          </button>
        ))}
      </div>

      {/* Status line */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
        <span>{constituents.length} constituents</span>
        {coverage > 0 && <span>{Math.round(coverage * 100)}% priced</span>}
        {dataUpdatedAt > 0 && <span>updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>}
      </div>

      {constituentsError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Failed to load constituents</p>
          <p className="mt-1 text-sm text-red-600">
            {constituentsError instanceof Error ? constituentsError.message : String(constituentsError)}
          </p>
        </div>
      )}

      {loading && !constituentsError && (
        <p className="mt-6 text-sm text-gray-500">Loading {INDEX_META[index].label}…</p>
      )}

      {!loading && !constituentsError && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <MoversTable title="Top Gainers" rows={gainers} positive trackedIds={trackedIds} />
          <MoversTable title="Top Losers" rows={losers} positive={false} trackedIds={trackedIds} />
        </div>
      )}
    </div>
  )
}
