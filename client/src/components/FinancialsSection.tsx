import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { fetchFinancialsData, fetchAnnualFinancialsData, num } from '@/lib/fmpFinancials'
import type { MergedQuarter } from '@/lib/fmpFinancials'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { SecurityDetail } from '@/lib/securities'

type Metric = 'revenue' | 'ebitda' | 'ebit' | 'netIncome' | 'eps' | 'sga'

const METRIC_DEFS: Record<Metric, { label: string; higherIsBetter: boolean; isEps: boolean }> = {
  revenue:   { label: 'Revenue',     higherIsBetter: true,  isEps: false },
  eps:       { label: 'EPS',         higherIsBetter: true,  isEps: true  },
  ebitda:    { label: 'EBITDA',      higherIsBetter: true,  isEps: false },
  ebit:      { label: 'EBIT',        higherIsBetter: true,  isEps: false },
  netIncome: { label: 'Net Income',  higherIsBetter: true,  isEps: false },
  sga:       { label: 'SGA Expense', higherIsBetter: false, isEps: false },
}

interface MetricValues {
  actual: number | null
  estAvg: number | null
  estLow: number | null
  estHigh: number | null
}

function getMetricValues(q: MergedQuarter, m: Metric): MetricValues {
  switch (m) {
    case 'revenue':
      return { actual: q.actualRevenue, estAvg: q.estRevenueAvg, estLow: q.estRevenueLow, estHigh: q.estRevenueHigh }
    case 'ebitda':
      return { actual: q.actualEbitda, estAvg: q.estEbitdaAvg, estLow: q.estEbitdaLow, estHigh: q.estEbitdaHigh }
    case 'ebit':
      return { actual: q.actualEbit, estAvg: q.estEbitAvg, estLow: q.estEbitLow, estHigh: q.estEbitHigh }
    case 'netIncome':
      return { actual: q.actualNetIncome, estAvg: q.estNetIncomeAvg, estLow: q.estNetIncomeLow, estHigh: q.estNetIncomeHigh }
    case 'eps':
      return { actual: q.actualEps, estAvg: q.estEpsAvg, estLow: q.estEpsLow, estHigh: q.estEpsHigh }
    case 'sga':
      return { actual: q.actualSga, estAvg: q.estSgaAvg, estLow: q.estSgaLow, estHigh: q.estSgaHigh }
  }
}

function fmtFinancial(v: number | null, isEps: boolean): string {
  if (v === null || !Number.isFinite(v)) return '—'
  if (isEps) {
    return v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`
  }
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
}

function fmtSignedPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`
}

interface ChartPoint {
  date: string
  close: number
  isEarnings: boolean
  beat?: boolean | null
  fiscalPeriod?: string
  actual?: number | null
  estAvg?: number | null
}

interface DotRenderProps {
  cx: number
  cy: number
  payload: ChartPoint
}

function EarningsDot({ dotProps }: { dotProps: DotRenderProps }) {
  const { cx, cy, payload } = dotProps
  if (!payload.isEarnings) return <circle cx={cx} cy={cy} r={0} fill="none" />
  const fill = payload.beat === true ? '#16a34a' : payload.beat === false ? '#dc2626' : '#9ca3af'
  return <circle cx={cx} cy={cy} r={5} fill={fill} />
}

interface SurprisePoint {
  label: string
  pct: number   // signed: positive = beat, negative = miss
  beat: boolean
}

interface SurpriseChartProps {
  points: SurprisePoint[]
  metricLabel: string
}

function SurpriseChart({ points, metricLabel }: SurpriseChartProps) {
  if (points.length === 0) return null
  const maxAbs = Math.max(...points.map(p => Math.abs(p.pct)), 3)
  const domain: [number, number] = [-(maxAbs + 1), maxAbs + 1]
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-1">{metricLabel} Surprise %</p>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 24, left: 36 }} barSize={6}>
          <CartesianGrid vertical={false} stroke="#f3f4f6" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={36}
          />
          <YAxis
            domain={domain}
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            width={36}
          />
          <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />
          <Bar dataKey="pct" radius={[2, 2, 0, 0]}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.beat ? '#16a34a' : '#dc2626'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface TooltipPayloadItem {
  payload: ChartPoint
}

interface FinancialsTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  metric: Metric
  metricDef: { label: string; isEps: boolean }
}

function FinancialsTooltip({ active, payload, metricDef }: FinancialsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const pt = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-gray-900">{pt.date}</p>
      <p className="text-gray-600">Price: ${pt.close.toFixed(2)}</p>
      {pt.isEarnings && (
        <>
          {pt.fiscalPeriod && <p className="mt-1 font-medium text-gray-700">{pt.fiscalPeriod}</p>}
          {pt.estAvg !== undefined && pt.estAvg !== null && (
            <p className="text-gray-500">Est: {fmtFinancial(pt.estAvg, metricDef.isEps)}</p>
          )}
          {pt.actual !== undefined && pt.actual !== null && (
            <p className="text-gray-700">Actual: {fmtFinancial(pt.actual, metricDef.isEps)}</p>
          )}
          {pt.beat === true && <p className="text-green-600 font-medium">Beat</p>}
          {pt.beat === false && <p className="text-red-600 font-medium">Miss</p>}
        </>
      )}
    </div>
  )
}

const TABLE_HEADERS = ['Fiscal Period', 'Period Ending', 'Report Date', 'Est Low', 'Est High', 'Est Avg', 'Actual', 'Surprise %', '1D Rx%']

function FinancialsTable({
  title,
  rows,
  metric,
  metricDef,
}: {
  title: string
  rows: MergedQuarter[]
  metric: Metric
  metricDef: { label: string; higherIsBetter: boolean; isEps: boolean }
}) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-gray-100">
              {TABLE_HEADERS.map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-gray-200 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((q, i) => {
              const isForward = q.periodEnd > today
              const vals = getMetricValues(q, metric)
              const { actual, estAvg, estLow, estHigh } = vals

              let beat: boolean | null = null
              if (actual !== null && estAvg !== null) {
                beat = metricDef.higherIsBetter ? actual > estAvg : actual < estAvg
              }

              const surprisePct = actual !== null && estAvg !== null && estAvg !== 0
                ? ((actual - estAvg) / Math.abs(estAvg)) * 100
                : null
              const surpriseIsPositive = surprisePct !== null
                ? metricDef.higherIsBetter ? surprisePct > 0 : surprisePct < 0
                : null

              const rxPct = num(q.priceReactionPct)
              const actualColor = beat === true ? 'text-green-700' : beat === false ? 'text-red-700' : 'text-gray-900'
              const surpriseColor = surpriseIsPositive === true ? 'text-green-700' : surpriseIsPositive === false ? 'text-red-700' : 'text-gray-900'
              const rxColor = rxPct === null ? 'text-gray-900' : rxPct > 0 ? 'text-green-700' : rxPct < 0 ? 'text-red-700' : 'text-gray-900'
              const rowBg = isForward ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'

              const analystCount = metric === 'revenue' ? q.analystCountRevenue : metric === 'eps' ? q.analystCountEps : null

              return (
                <tr key={q.periodEnd + i} className={rowBg}>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs text-gray-900">
                    <span>{q.fiscalPeriod}</span>
                    {isForward && <span className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium uppercase text-blue-600">Est</span>}
                    {analystCount !== null && <span className="ml-1 text-gray-400">({analystCount})</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs text-gray-600">{q.periodEnd}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs text-gray-600">{q.reportDate ?? '—'}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs text-gray-600">{fmtFinancial(estLow, metricDef.isEps)}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs text-gray-600">{fmtFinancial(estHigh, metricDef.isEps)}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs text-gray-600">{fmtFinancial(estAvg, metricDef.isEps)}</td>
                  <td className={`whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs font-medium ${actualColor}`}>{fmtFinancial(actual, metricDef.isEps)}</td>
                  <td className={`whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs ${surpriseColor}`}>{fmtSignedPct(surprisePct)}</td>
                  <td className={`whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-xs ${rxColor}`}>{fmtSignedPct(rxPct)}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-4 text-center text-xs text-gray-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface Props {
  security: SecurityDetail
}

export function FinancialsSection({ security }: Props) {
  const [metric, setMetric] = useState<Metric>('revenue')
  const [period, setPeriod] = useState<'1y' | '3y' | '5y'>('1y')

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.financialsData(security.security_id),
    queryFn: () => fetchFinancialsData(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })

  const metricDef = METRIC_DEFS[metric]

  const periodYears = period === '1y' ? 1 : period === '3y' ? 3 : 5
  const filterFromDate = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - periodYears)
    return d.toISOString().slice(0, 10)
  })()

  const filteredPrices = (data?.prices ?? []).filter((p) => p.date >= filterFromDate)

  const chartData: ChartPoint[] = filteredPrices.map((p) => ({
    date: p.date,
    close: p.close,
    isEarnings: false,
  }))

  if (data) {
    for (const q of data.quarters) {
      const rd = q.reportDate
      if (!rd || rd < filterFromDate) continue
      let idx = -1
      for (let i = 0; i < chartData.length; i++) {
        if (chartData[i].date >= rd) { idx = i; break }
      }
      if (idx === -1) continue

      const vals = getMetricValues(q, metric)
      let beat: boolean | null = null
      if (vals.actual !== null && vals.estAvg !== null) {
        beat = metricDef.higherIsBetter
          ? vals.actual > vals.estAvg
          : vals.actual < vals.estAvg
      }

      chartData[idx] = {
        ...chartData[idx],
        isEarnings: true,
        fiscalPeriod: q.fiscalPeriod,
        actual: vals.actual,
        estAvg: vals.estAvg,
        beat,
      }
    }
  }

  const tableQuarters = (data?.quarters ?? []).filter((q) => q.periodEnd >= filterFromDate)

  // Annual data
  const { data: annualData } = useQuery({
    queryKey: QUERY_KEYS.financialsAnnualData(security.security_id),
    queryFn: () => fetchAnnualFinancialsData(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })

  // Surprise chart: historical quarters with both actual + estimate, oldest→newest
  const surprisePoints: SurprisePoint[] = tableQuarters
    .filter((q) => {
      const today = new Date().toISOString().slice(0, 10)
      if (q.periodEnd > today) return false // skip forward estimates
      const { actual, estAvg } = getMetricValues(q, metric)
      return actual !== null && estAvg !== null && estAvg !== 0
    })
    .slice()
    .reverse()
    .map((q) => {
      const { actual, estAvg } = getMetricValues(q, metric)
      const beat = metricDef.higherIsBetter ? actual! > estAvg! : actual! < estAvg!
      const rawPct = ((actual! - estAvg!) / Math.abs(estAvg!)) * 100
      const pct = beat ? Math.abs(rawPct) : -Math.abs(rawPct)
      return { label: q.fiscalPeriod, pct, beat }
    })

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-64 rounded bg-gray-100" />
        <div className="h-[300px] w-full rounded bg-gray-100" />
        <div className="h-32 w-full rounded bg-gray-100" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load financials:{' '}
        {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  if (!data || (data.prices.length === 0 && data.quarters.length === 0)) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-400">
        No financials data available for {security.security_id}.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        {/* Metric tabs */}
        <div className="flex border-b border-gray-200">
          {(Object.keys(METRIC_DEFS) as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                metric === m
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {METRIC_DEFS[m].label}
            </button>
          ))}
        </div>

        {/* Period toggle */}
        <div className="flex gap-1 shrink-0">
          {(['1y', '3y', '5y'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              interval={Math.max(1, Math.floor(chartData.length / 8))}
              tickFormatter={(d: string) => {
                const dt = new Date(d + 'T00:00:00')
                return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
              }}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
            />
            <YAxis
              tickFormatter={(v: number) =>
                `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0)}`
              }
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              width={52}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={
                <FinancialsTooltip
                  metric={metric}
                  metricDef={metricDef}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={(dotProps: unknown) => (
                <EarningsDot dotProps={dotProps as DotRenderProps} />
              )}
              activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
          No price data for selected period.
        </div>
      )}

      {/* Surprise chart */}
      {surprisePoints.length > 0 && (
        <SurpriseChart points={surprisePoints} metricLabel={metricDef.label} />
      )}

      {/* Annual + Quarterly tables side by side */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <FinancialsTable
          title="Annual"
          rows={annualData ?? []}
          metric={metric}
          metricDef={metricDef}
        />
        <FinancialsTable
          title="Quarterly"
          rows={tableQuarters}
          metric={metric}
          metricDef={metricDef}
        />
      </div>
    </div>
  )
}
