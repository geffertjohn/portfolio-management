import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { fetchRevenueSegments, orderedSegmentNames, type SegmentKind, type SegmentPeriod } from '@/lib/fmpSegments'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface Props {
  securityId: string
  kind: SegmentKind
  /** From the section's 1y/3y/5y toggle — bounds how many periods are shown. */
  periodYears: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316']

function fmtMoney(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
}

function pctOf(v: number, total: number): string {
  if (!total) return '—'
  return `${((v / total) * 100).toFixed(1)}%`
}

function SegmentTable({ title, periods }: { title: string; periods: SegmentPeriod[] }) {
  const names = orderedSegmentNames(periods)
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-gray-100">
              <th className="whitespace-nowrap border-b border-gray-200 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-600">Fiscal Period</th>
              <th className="whitespace-nowrap border-b border-gray-200 px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-600">Total</th>
              {names.map((n) => (
                <th key={n} className="border-b border-gray-200 px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-600" title={n}>
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p, i) => (
              <tr key={p.fiscalLabel + i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs font-medium text-gray-900">{p.fiscalLabel}</td>
                <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-right text-xs font-medium text-gray-900">{fmtMoney(p.total)}</td>
                {names.map((n) => {
                  const v = p.data[n]
                  return (
                    <td key={n} className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-right text-xs text-gray-700">
                      {v === undefined ? '—' : (
                        <>
                          {fmtMoney(v)}
                          <span className="ml-1 text-gray-400">({pctOf(v, p.total)})</span>
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {periods.length === 0 && (
              <tr><td colSpan={2 + names.length} className="px-2 py-4 text-center text-xs text-gray-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RevenueSegmentsPanel({ securityId, kind, periodYears }: Props) {
  const annualQ = useQuery({
    queryKey: QUERY_KEYS.revenueSegments(securityId, kind, 'annual'),
    queryFn: () => fetchRevenueSegments(securityId, kind, 'annual'),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const quarterQ = useQuery({
    queryKey: QUERY_KEYS.revenueSegments(securityId, kind, 'quarter'),
    queryFn: () => fetchRevenueSegments(securityId, kind, 'quarter'),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })

  const label = kind === 'product' ? 'product' : 'geography'

  if (annualQ.isLoading || quarterQ.isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-[260px] w-full rounded bg-gray-100" />
        <div className="h-32 w-full rounded bg-gray-100" />
      </div>
    )
  }

  if (annualQ.error && quarterQ.error) {
    const err = annualQ.error
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load revenue by {label}: {err instanceof Error ? err.message : String(err)}
      </div>
    )
  }

  const annual = (annualQ.data ?? []).slice(0, periodYears)
  const quarter = (quarterQ.data ?? []).slice(0, periodYears * 4)

  if (annual.length === 0 && quarter.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-400">
        No revenue-by-{label} data available for {securityId}.
      </div>
    )
  }

  // Stacked composition chart — prefer the annual series (trend over years),
  // fall back to quarterly. Oldest → newest, left to right.
  const chartSource = annual.length > 0 ? annual : quarter
  const names = orderedSegmentNames(chartSource)
  const chartData = chartSource
    .slice()
    .reverse()
    .map((p) => {
      const point: Record<string, number | string> = { label: p.fiscalLabel }
      for (const n of names) point[n] = p.data[n] ?? 0
      return point
    })

  return (
    <div className="space-y-4">
      {chartData.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] text-gray-400">Revenue composition by {label} ({annual.length > 0 ? 'annual' : 'quarterly'})</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={0} angle={chartData.length > 6 ? -35 : 0} textAnchor={chartData.length > 6 ? 'end' : 'middle'} height={chartData.length > 6 ? 44 : 24} />
              <YAxis tickFormatter={(v: number) => fmtMoney(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} width={56} />
              <Tooltip
                formatter={(value, name) => [fmtMoney(Number(value)), String(name)]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {names.map((n, i) => (
                <Bar key={n} dataKey={n} stackId="rev" fill={COLORS[i % COLORS.length]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 items-start">
        <SegmentTable title="Annual" periods={annual} />
        <SegmentTable title="Quarterly" periods={quarter} />
      </div>
    </div>
  )
}
