/**
 * StockScorecardPanels
 *
 * Renders two scorecard blocks in the Monitoring section for stock securities:
 *   1. Equity Income — Revenue Growth QoQ, Revenue Growth 1Y, EPS Growth 1Y, Sharpe 1Y
 *   2. Core Growth   — Revenue Growth QoQ, Revenue Growth 1Y, EPS Growth 1Y, Sortino 1Y
 *
 * Metric storage conventions (matching securities2 columns):
 *   Percentage metrics   → decimal-stored  (0.15 = 15%)  → fmtDecimalPct
 *   Ratio metrics (PEG)  → raw number      (1.5)         → fmtNum
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtDecimalPct, EMPTY, stripTotalReturn } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import { fetchBenchmarkOptions, fetchSectorBenchmarkOptions } from './BenchmarkPickerModal'
import { MetricCard } from './MonitoringPanelShared'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fetchRatiosTTM, fetchAnnualOperatingMargins, fetchFcfMargins, fetchCagr3y, fetchTtmGrowth } from '@/lib/fmpRatios'

/**
 * Returns the two most recent annual entries to display alongside a TTM headline.
 * If the latest annual value equals the TTM (a fiscal year that just closed and
 * is fully captured by the TTM window), it's dropped so the breakdown shows the
 * prior completed years rather than a duplicate of the headline.
 */
function priorFullYears<T>(ttm: number | null, annual: T[], pick: (t: T) => number | null): T[] {
  const first = annual[0]
  const firstVal = first ? pick(first) : null
  const duplicatesTtm =
    ttm !== null && firstVal !== null && Math.abs(firstVal - ttm) < 1e-6
  return (duplicatesTtm ? annual.slice(1) : annual).slice(0, 2)
}

export function StockScorecardPanels({ security }: { security: SecurityDetail }) {
  const { data: ratios } = useQuery({
    queryKey: QUERY_KEYS.ratiosTTM(security.security_id),
    queryFn: () => fetchRatiosTTM(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const operatingMargin = ratios?.operatingProfitMargin ?? null

  const { data: annualMargins = [] } = useQuery({
    queryKey: QUERY_KEYS.ratiosAnnual(security.security_id),
    queryFn: () => fetchAnnualOperatingMargins(security.security_id, 3),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })

  const { data: fcf } = useQuery({
    queryKey: QUERY_KEYS.fcfMargins(security.security_id),
    queryFn: () => fetchFcfMargins(security.security_id, 3),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const fcfTtm = fcf?.ttm ?? null
  const fcfAnnual = fcf?.annual ?? []

  // Show the two most recent COMPLETED fiscal years. For companies whose fiscal
  // year just ended (e.g. March year-end), the latest annual period coincides
  // with the TTM window, duplicating the headline — drop it and show the prior two.
  const opMarginYears = priorFullYears(operatingMargin, annualMargins, (m) => m.operatingProfitMargin)
  const fcfMarginYears = priorFullYears(fcfTtm, fcfAnnual, (m) => m.fcfMargin)

  const { data: cagr3y } = useQuery({
    queryKey: QUERY_KEYS.cagr3y(security.security_id),
    queryFn: () => fetchCagr3y(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const revCagr3y = cagr3y?.revenue ?? null
  const epsCagr3y = cagr3y?.eps ?? null

  const { data: ttmGrowth } = useQuery({
    queryKey: QUERY_KEYS.ttmGrowth(security.security_id),
    queryFn: () => fetchTtmGrowth(security.security_id),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const revGrowthTtm = ttmGrowth?.revenueGrowth ?? null
  const epsGrowthTtm = ttmGrowth?.epsGrowth ?? null

  const [ids, setIds] = useState({
    bench1Id: security.preferred_benchmark1_id ?? null,
    bench2Id: security.preferred_benchmark2_id ?? null,
  })

  const { data: allBenchmarks = [] } = useQuery({
    queryKey: QUERY_KEYS.benchmarks,
    queryFn: fetchBenchmarkOptions,
  })

  const { data: allSectorBenchmarks = [] } = useQuery({
    queryKey: QUERY_KEYS.sectorBenchmarks,
    queryFn: fetchSectorBenchmarkOptions,
  })

  // Re-sync when navigating between securities
  useEffect(() => {
    setIds({
      bench1Id: security.preferred_benchmark1_id ?? null,
      bench2Id: security.preferred_benchmark2_id ?? null,
    })
  }, [security.id, security.preferred_benchmark1_id, security.preferred_benchmark2_id])

  // Live-sync when StockReturnTable changes the selection
  useEffect(() => {
    function handleChange(e: Event) {
      const detail = (e as CustomEvent<{ securityId: number; bench1Id: number | null; bench2Id: number | null }>).detail
      if (detail.securityId === security.id) {
        setIds({ bench1Id: detail.bench1Id, bench2Id: detail.bench2Id })
      }
    }
    window.addEventListener('benchmark-changed', handleChange)
    return () => window.removeEventListener('benchmark-changed', handleChange)
  }, [security.id])

  const bench1 = allBenchmarks.find((b) => b.id === ids.bench1Id) ?? null
  // bench2 for stocks comes from sector_benchmarks
  const bench2 = allSectorBenchmarks.find((b) => b.id === ids.bench2Id) ?? null
  const bench1SalesGrowth = bench1?.sales_growth_1_yr_generic ?? null
  const bench2SalesGrowth = bench2?.sales_growth_1_yr_generic ?? null
  const bench1EpsGrowth = bench1?.eps_growth_1_yr_generic ?? null
  const bench2EpsGrowth = bench2?.eps_growth_1_yr_generic ?? null
  const bench1SalesGrowth3y = bench1?.sales_growth_3_yr_generic ?? null
  const bench2SalesGrowth3y = bench2?.sales_growth_3_yr_generic ?? null
  const bench1EpsGrowth3y = bench1?.eps_growth_3_yr_generic ?? null
  const bench2EpsGrowth3y = bench2?.eps_growth_3_yr_generic ?? null
  const bench1Label = bench1 ? stripTotalReturn(bench1.category_benchmark ?? bench1.ticker) : 'Benchmark'
  const bench2Label = bench2 ? stripTotalReturn(bench2.sector ?? bench2.ticker) : 'Peer Group'

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <MetricCard
        title={<>Operating Margin <span className="font-bold text-gray-700">TTM</span></>}
        subtitle=""
        displayValue={operatingMargin !== null ? fmtDecimalPct(operatingMargin) : EMPTY}
        rawValue={operatingMargin}
        neutral={0}
        scale={0.3}
        higherIsBetter={true}
        benchmarkValue={opMarginYears[0]?.operatingProfitMargin ?? null}
        benchmark2Value={opMarginYears[1]?.operatingProfitMargin ?? null}
        components={[
          { label: 'Operating margin TTM', value: operatingMargin !== null ? fmtDecimalPct(operatingMargin) : EMPTY },
          ...opMarginYears.map((m) => ({
            label: `${m.fiscalYear} Operating Margin`,
            value: m.operatingProfitMargin !== null ? fmtDecimalPct(m.operatingProfitMargin) : EMPTY,
          })),
        ]}
      />

      <MetricCard
        title={<>FCF Margin <span className="font-bold text-gray-700">TTM</span></>}
        subtitle=""
        displayValue={fcfTtm !== null ? fmtDecimalPct(fcfTtm) : EMPTY}
        rawValue={fcfTtm}
        neutral={0}
        scale={0.3}
        higherIsBetter={true}
        benchmarkValue={fcfMarginYears[0]?.fcfMargin ?? null}
        benchmark2Value={fcfMarginYears[1]?.fcfMargin ?? null}
        components={[
          { label: 'FCF margin TTM', value: fcfTtm !== null ? fmtDecimalPct(fcfTtm) : EMPTY },
          ...fcfMarginYears.map((m) => ({
            label: `${m.fiscalYear} FCF Margin`,
            value: m.fcfMargin !== null ? fmtDecimalPct(m.fcfMargin) : EMPTY,
          })),
        ]}
      />

      <MetricCard
        title="Revenue Growth TTM"
        subtitle=""
        displayValue={revGrowthTtm !== null ? fmtDecimalPct(revGrowthTtm) : EMPTY}
        rawValue={revGrowthTtm}
        neutral={0}
        scale={0.3}
        higherIsBetter={true}
        benchmarkValue={bench1SalesGrowth}
        benchmark2Value={bench2SalesGrowth}
        components={[
          { label: 'Revenue growth TTM', value: revGrowthTtm != null ? fmtDecimalPct(revGrowthTtm) : '—' },
          { label: bench1Label, value: bench1SalesGrowth != null ? fmtDecimalPct(bench1SalesGrowth) : '—' },
          { label: bench2Label, value: bench2SalesGrowth != null ? fmtDecimalPct(bench2SalesGrowth) : '—' },
        ]}
      />

      <MetricCard
        title="EPS Growth TTM"
        subtitle=""
        displayValue={epsGrowthTtm !== null ? fmtDecimalPct(epsGrowthTtm) : EMPTY}
        rawValue={epsGrowthTtm}
        neutral={0}
        scale={0.5}
        higherIsBetter={true}
        benchmarkValue={bench1EpsGrowth}
        benchmark2Value={bench2EpsGrowth}
        components={[
          { label: 'EPS growth TTM', value: epsGrowthTtm != null ? fmtDecimalPct(epsGrowthTtm) : '—' },
          { label: bench1Label, value: bench1EpsGrowth != null ? fmtDecimalPct(bench1EpsGrowth) : '—' },
          { label: bench2Label, value: bench2EpsGrowth != null ? fmtDecimalPct(bench2EpsGrowth) : '—' },
        ]}
      />

      <MetricCard
        title="Revenue Growth 3Y"
        subtitle=""
        displayValue={revCagr3y !== null ? fmtDecimalPct(revCagr3y) : EMPTY}
        rawValue={revCagr3y}
        neutral={0}
        scale={0.5}
        higherIsBetter={true}
        benchmarkValue={bench1SalesGrowth3y}
        benchmark2Value={bench2SalesGrowth3y}
        components={[
          { label: 'Revenue CAGR 3Y', value: revCagr3y !== null ? fmtDecimalPct(revCagr3y) : EMPTY },
          { label: bench1Label, value: bench1SalesGrowth3y != null ? fmtDecimalPct(bench1SalesGrowth3y) : '—' },
          { label: bench2Label, value: bench2SalesGrowth3y != null ? fmtDecimalPct(bench2SalesGrowth3y) : '—' },
        ]}
      />

      <MetricCard
        title="EPS Growth 3Y"
        subtitle=""
        displayValue={epsCagr3y !== null ? fmtDecimalPct(epsCagr3y) : EMPTY}
        rawValue={epsCagr3y}
        neutral={0}
        scale={0.5}
        higherIsBetter={true}
        benchmarkValue={bench1EpsGrowth3y}
        benchmark2Value={bench2EpsGrowth3y}
        components={[
          { label: 'EPS CAGR 3Y', value: epsCagr3y !== null ? fmtDecimalPct(epsCagr3y) : EMPTY },
          { label: bench1Label, value: bench1EpsGrowth3y != null ? fmtDecimalPct(bench1EpsGrowth3y) : '—' },
          { label: bench2Label, value: bench2EpsGrowth3y != null ? fmtDecimalPct(bench2EpsGrowth3y) : '—' },
        ]}
      />
    </div>
  )
}
