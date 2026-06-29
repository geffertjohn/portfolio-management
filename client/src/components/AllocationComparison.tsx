import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { Portfolio } from '@/types/portfolio'
import type { ModelPortfolio } from '@/lib/modelPortfolios'

// ── Types ─────────────────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>

interface Props {
  portfolio: Portfolio
  modelPortfolio: ModelPortfolio | null | undefined
}

// ── Benchmark fetch ───────────────────────────────────────────────────────────

async function fetchBenchmarkAll(name: string): Promise<AnyRow | null> {
  const { data, error } = await supabase
    .from('model_portfolio_benchmarks')
    .select('*')
    .eq('security_name', name)
    .maybeSingle()
  if (error) throw error
  return data as AnyRow | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: unknown, dec = 1): string {
  const n = Number(v)
  if (v == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(dec)}%`
}

function pct2(v: unknown): string { return pct(v, 2) }

function num(v: unknown, dec = 2): string {
  const n = Number(v)
  if (v == null || !Number.isFinite(n)) return '—'
  return n.toFixed(dec)
}

function diff(port: unknown, bench: unknown, dec = 1): { label: string; color: string } | null {
  const p = Number(port)
  const b = Number(bench)
  if (!Number.isFinite(p) || !Number.isFinite(b)) return null
  const d = (p - b) * 100
  const abs = Math.abs(d)
  const label = `${d >= 0 ? '+' : ''}${d.toFixed(dec)}%`
  const color = abs < 1 ? 'text-gray-400' : abs < 3 ? 'text-amber-600' : 'text-red-600'
  return { label, color }
}

function numDiff(port: unknown, bench: unknown, dec = 2): { label: string; color: string } | null {
  const p = Number(port)
  const b = Number(bench)
  if (!Number.isFinite(p) || !Number.isFinite(b)) return null
  const d = p - b
  const label = `${d >= 0 ? '+' : ''}${d.toFixed(dec)}`
  const color = Math.abs(d) < 0.05 ? 'text-gray-400' : 'text-amber-600'
  return { label, color }
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && children}
    </div>
  )
}

function TableHeader({ benchmarkName }: { benchmarkName: string }) {
  return (
    <thead className="bg-gray-50">
      <tr>
        <th className="px-4 py-2.5 text-left text-sm font-semibold text-gray-900 w-48">Category</th>
        <th className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">Portfolio</th>
        <th className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 max-w-[140px] truncate">{benchmarkName}</th>
        <th className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">Diff</th>
      </tr>
    </thead>
  )
}

function Row({
  label,
  portVal,
  benchVal,
  formatFn = pct,
  diffFn = diff,
}: {
  label: string
  portVal: unknown
  benchVal: unknown
  formatFn?: (v: unknown) => string
  diffFn?: (p: unknown, b: unknown) => { label: string; color: string } | null
}) {
  const d = diffFn(portVal, benchVal)
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2.5 text-sm text-gray-700">{label}</td>
      <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-gray-900">{formatFn(portVal)}</td>
      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-600">{formatFn(benchVal)}</td>
      <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${d ? d.color : 'text-gray-400'}`}>
        {d ? d.label : '—'}
      </td>
    </tr>
  )
}

// ── Style box grid ────────────────────────────────────────────────────────────

function StyleBox({
  title,
  data,
  benchData,
}: {
  title: string
  data: AnyRow
  benchData: AnyRow | null
}) {
  const COLS = ['Value', 'Blend', 'Growth']
  const ROWS = ['Large', 'Mid', 'Small']
  const key = (row: string, col: string) =>
    `equity_stylebox_${row.toLowerCase()}_cap_${col.toLowerCase()}_exposure`

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <div className="overflow-hidden rounded border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0f2d4d] text-white">
              <th className="px-2 py-1.5 text-left"></th>
              {COLS.map((c) => (
                <th key={c} className="px-2 py-1.5 text-center font-semibold">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row} className="border-t border-gray-100">
                <td className="px-2 py-2 font-medium text-gray-700">{row}</td>
                {COLS.map((col) => {
                  const k = key(row, col)
                  const p = Number(data[k])
                  const b = benchData ? Number(benchData[k]) : NaN
                  const hasP = Number.isFinite(p)
                  const hasB = Number.isFinite(b)
                  return (
                    <td key={col} className="px-2 py-2 text-center">
                      <div className="font-semibold text-gray-900">{hasP ? `${(p * 100).toFixed(1)}%` : '—'}</div>
                      {hasB && (
                        <div className="text-[10px] text-gray-400">{`${(b * 100).toFixed(1)}%`}</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AllocationComparison({ portfolio, modelPortfolio }: Props) {
  const [statPeriod, setStatPeriod] = useState<'1y' | '3y' | '5y'>('1y')

  const effectiveBenchmark = modelPortfolio?.benchmark ?? ''
  const port = portfolio as unknown as AnyRow

  const { data: bench = null } = useQuery({
    queryKey: QUERY_KEYS.benchmarkAllByName(effectiveBenchmark),
    queryFn: () => fetchBenchmarkAll(effectiveBenchmark),
    enabled: !!effectiveBenchmark,
  })

  const benchmarkName =
    (bench?.name as string | null) ||
    effectiveBenchmark ||
    'Benchmark'

  if (!effectiveBenchmark) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-16 text-center text-sm text-gray-400">
        No benchmark assigned to this model portfolio.
      </div>
    )
  }

  // ── Period-aware stat rows ──────────────────────────────────────────────────

  const periodSuffix: Record<typeof statPeriod, string> = { '1y': '1y', '3y': '3y', '5y': '5y' }
  const p = periodSuffix[statPeriod]

  const statRows: { label: string; portKey: string; dec?: number; isPct?: boolean }[] = [
    { label: 'Alpha',             portKey: statPeriod === '1y' ? 'market_alpha_12_month' : statPeriod === '3y' ? 'market_alpha_36_month' : 'market_alpha_60_month' },
    { label: 'Beta',              portKey: statPeriod === '1y' ? 'enhanced_market_beta_12_month' : statPeriod === '3y' ? 'enhanced_market_beta_36_month' : 'enhanced_market_beta_60_month' },
    { label: 'Sharpe Ratio',      portKey: `historical_sharpe_${p}` },
    { label: 'Sortino Ratio',     portKey: `historical_sortino_${p}` },
    { label: 'Treynor Measure',   portKey: `historical_treynor_measure_${p}` },
    { label: 'Std Dev (Ann.)',     portKey: `monthly_standard_deviation_annualized_${p}`, isPct: true },
    { label: 'Max Drawdown',      portKey: `max_drawdown_${p}`, isPct: true },
    { label: 'Tracking Error',    portKey: `tracking_error_${p}` },
  ]

  return (
    <div className="space-y-4">

      {/* ── Asset Allocation ─────────────────────────────────────────────── */}
      <Section title="Asset Allocation">
        <table className="min-w-full text-sm">
          <TableHeader benchmarkName={benchmarkName} />
          <tbody>
            <Row label="Equity"        portVal={port.stock_net} benchVal={bench?.stock_net} />
            <Row label="Fixed Income"  portVal={port.bond_net}  benchVal={bench?.bond_net} />
            <Row label="Cash"          portVal={port.cash_net}  benchVal={bench?.cash_net} />
          </tbody>
        </table>
      </Section>

      {/* ── Statistical Analysis ─────────────────────────────────────────── */}
      <Section title="Statistical Analysis">
        <div className="border-b border-gray-200 px-4 py-2 flex gap-2">
          {(['1y', '3y', '5y'] as const).map((per) => (
            <button
              key={per}
              type="button"
              onClick={() => setStatPeriod(per)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                statPeriod === per ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {per === '1y' ? '1 Year' : per === '3y' ? '3 Year' : '5 Year'}
            </button>
          ))}
        </div>
        <table className="min-w-full text-sm">
          <TableHeader benchmarkName={benchmarkName} />
          <tbody>
            {statRows.map(({ label, portKey, dec = 2, isPct }) => (
              <Row
                key={label}
                label={label}
                portVal={port[portKey]}
                benchVal={bench?.[portKey]}
                formatFn={isPct ? pct2 : (v) => num(v, dec)}
                diffFn={isPct ? (p2, b2) => diff(p2, b2, 2) : (p2, b2) => numDiff(p2, b2, dec)}
              />
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── Equity Style Analysis ────────────────────────────────────────── */}
      <Section title="Equity Style Analysis">
        <div className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-2">
          <StyleBox title="Portfolio" data={port} benchData={null} />
          <StyleBox title={benchmarkName} data={bench ?? {}} benchData={null} />
        </div>
      </Section>

      {/* ── Fixed Income Style Analysis ──────────────────────────────────── */}
      <Section title="Fixed Income Style Analysis">
        <table className="min-w-full text-sm">
          <TableHeader benchmarkName={benchmarkName} />
          <tbody>
            <Row label="Effective Duration"   portVal={port.effective_duration}   benchVal={bench?.effective_duration}   formatFn={(v) => num(v, 2) !== '—' ? `${num(v, 2)} yrs` : '—'} diffFn={(p2, b2) => numDiff(p2, b2, 2)} />
            <Row label="Effective Maturity"   portVal={port.effective_maturity}   benchVal={bench?.effective_maturity}   formatFn={(v) => num(v, 2) !== '—' ? `${num(v, 2)} yrs` : '—'} diffFn={(p2, b2) => numDiff(p2, b2, 2)} />
            <Row label="Yield to Maturity"    portVal={port.yield_to_maturity}    benchVal={bench?.yield_to_maturity}    formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="Current Yield"        portVal={port.current_yield}        benchVal={bench?.current_yield}        formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="Average Coupon"       portVal={port.average_coupon}       benchVal={bench?.average_coupon}       formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <tr className="border-t-2 border-gray-200"><td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">Credit Quality</td></tr>
            <Row label="AAA"       portVal={port.aaa_bond_exposure_generic}   benchVal={bench?.aaa_bond_exposure_generic}   formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="AA"        portVal={port.aa_bond_exposure_generic}    benchVal={bench?.aa_bond_exposure_generic}    formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="A"         portVal={port.a_bond_exposure_generic}     benchVal={bench?.a_bond_exposure_generic}     formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="BBB"       portVal={port.bbb_bond_exposure_generic}   benchVal={bench?.bbb_bond_exposure_generic}   formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="BB"        portVal={port.bb_bond_exposure_generic}    benchVal={bench?.bb_bond_exposure_generic}    formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="B"         portVal={port.b_bond_exposure_generic}     benchVal={bench?.b_bond_exposure_generic}     formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="Below B"   portVal={port.below_b_bond_exposure_generic} benchVal={bench?.below_b_bond_exposure_generic} formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <tr className="border-t-2 border-gray-200"><td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">Maturity Distribution</td></tr>
            <Row label="< 1 Year"     portVal={port.maturity_less_than_1_year_generic}        benchVal={bench?.maturity_less_than_1_year_generic}        formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="1–3 Years"    portVal={port['1_to_3_years_maturity_bond_exposure']}   benchVal={bench?.['1_to_3_years_maturity_bond_exposure']}  formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="3–5 Years"    portVal={port['3_to_5_years_maturity_bond_exposure']}   benchVal={bench?.['3_to_5_years_maturity_bond_exposure']}  formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="5–10 Years"   portVal={port.maturity_5_to_10_years_generic}           benchVal={bench?.maturity_5_to_10_years_generic}           formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="10–20 Years"  portVal={port.maturity_10_to_20_years_generic}          benchVal={bench?.maturity_10_to_20_years_generic}          formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="20–30 Years"  portVal={port.maturity_20_to_30_years_generic}          benchVal={bench?.maturity_20_to_30_years_generic}          formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
            <Row label="> 30 Years"   portVal={port.over_30_years_maturity_bond_exposure}     benchVal={bench?.over_30_years_maturity_bond_exposure}     formatFn={pct2} diffFn={(p2, b2) => diff(p2, b2, 2)} />
          </tbody>
        </table>
      </Section>

      {/* ── Equity Sector Weights ────────────────────────────────────────── */}
      <Section title="Equity Sector Weights">
        <table className="min-w-full text-sm">
          <TableHeader benchmarkName={benchmarkName} />
          <tbody>
            <Row label="Technology"            portVal={port.technology_exposure_generic}             benchVal={bench?.technology_exposure_generic} />
            <Row label="Financial Services"    portVal={port.financial_services_exposure_generic}     benchVal={bench?.financial_services_exposure_generic} />
            <Row label="Healthcare"            portVal={port.healthcare_exposure_generic}             benchVal={bench?.healthcare_exposure_generic} />
            <Row label="Consumer Cyclical"     portVal={port.consumer_cyclical_exposure_generic}      benchVal={bench?.consumer_cyclical_exposure_generic} />
            <Row label="Industrials"           portVal={port.industrials_exposure_generic}            benchVal={bench?.industrials_exposure_generic} />
            <Row label="Communication Svcs"   portVal={port.communication_services_exposure_generic} benchVal={bench?.communication_services_exposure_generic} />
            <Row label="Consumer Defensive"   portVal={port.consumer_defensive_exposure_generic}     benchVal={bench?.consumer_defensive_exposure_generic} />
            <Row label="Energy"                portVal={port.energy_exposure_generic}                 benchVal={bench?.energy_exposure_generic} />
            <Row label="Real Estate"           portVal={port.real_estate_exposure_generic}            benchVal={bench?.real_estate_exposure_generic} />
            <Row label="Basic Materials"       portVal={port.basic_materials_exposure_generic}        benchVal={bench?.basic_materials_exposure_generic} />
            <Row label="Utilities"             portVal={port.utilities_exposure_generic}              benchVal={bench?.utilities_exposure_generic} />
          </tbody>
        </table>
      </Section>

      {/* ── Regional Exposure ────────────────────────────────────────────── */}
      <Section title="Regional Exposure">
        <table className="min-w-full text-sm">
          <TableHeader benchmarkName={benchmarkName} />
          <tbody>
            <Row label="North America"     portVal={port.north_america_total_exposure_generic}      benchVal={bench?.north_america_total_exposure_generic} />
            <Row label="Latin America"     portVal={port.latin_america_total_exposure_generic}      benchVal={bench?.latin_america_total_exposure_generic} />
            <Row label="United Kingdom"    portVal={port.united_kingdom_total_exposure_generic}     benchVal={bench?.united_kingdom_total_exposure_generic} />
            <Row label="Europe Developed"  portVal={port.europe_developed_total_exposure_generic}   benchVal={bench?.europe_developed_total_exposure_generic} />
            <Row label="Europe Emerging"   portVal={port.europe_emerging_total_exposure}            benchVal={bench?.europe_emerging_total_exposure} />
            <Row label="Africa / Mid East" portVal={port.africa_middle_east_total_exposure}         benchVal={bench?.africa_middle_east_total_exposure} />
            <Row label="Asia Developed"    portVal={port.asia_developed_total_exposure_generic}     benchVal={bench?.asia_developed_total_exposure_generic} />
            <Row label="Asia Emerging"     portVal={port.asia_emerging_total_exposure}              benchVal={bench?.asia_emerging_total_exposure} />
          </tbody>
        </table>
      </Section>

    </div>
  )
}
