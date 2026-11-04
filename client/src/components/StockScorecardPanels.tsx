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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fmtDecimalPct, EMPTY, stripTotalReturn } from '@/lib/formatters'
import { saveSecurityBenchmarks, type SecurityDetail } from '@/lib/securities'
import { fetchBenchmarkOptions, fetchSectorBenchmarkOptions, type BenchmarkOption } from '@/lib/benchmarks'
import { MetricCard } from './MonitoringPanelShared'
import { BenchmarkPickerModal } from './BenchmarkPickerModal'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { announceBenchmarkChange, onBenchmarkChange } from '@/lib/benchmarkSelection'
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

  const queryClient = useQueryClient()
  const [ids, setIds] = useState({
    bench1Id: security.preferred_benchmark1_id ?? null,
    bench2Id: security.preferred_benchmark2_id ?? null,
  })
  const [picker, setPicker] = useState<1 | 2 | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  /**
   * These two columns are the comparators for all four growth cards below, the
   * Alternatives tables, and the at-risk committee's grading — and from 14 Oct
   * 2026 nothing in the app could change them. `StockReturnTable` carried the
   * only picker, and the commit that made Overview the ownership case removed
   * its last host with a real `securities2.id`; the one surviving renderer is
   * the Research page, whose synthetic `id: 0` is what (correctly) suppresses
   * the write there. So the control belongs here, beside the cards it grades.
   *
   * It matters most for a stock added from here on: `createSecurityBySymbol`
   * writes no benchmarks, and with both null every card falls back to
   * `neutral={0}`, so any positive growth reads green and the committee can
   * only ever flag the name on its margins.
   */
  const saveMut = useMutation({
    mutationFn: (next: { bench1Id: number | null; bench2Id: number | null }) =>
      saveSecurityBenchmarks(security.id, next.bench1Id, next.bench2Id),
    onSuccess: (_r, next) => {
      setSaveError(null)
      // The stored row feeds the header and the Alternatives tables.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.security(security.id) })
      announceBenchmarkChange({ securityId: security.id, ...next })
    },
    // Never swallowed. This writes a governed number that the committee reads;
    // a selection that looks applied but was not is worse than a visible error.
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not save the benchmark'),
  })

  /**
   * Apply a selection. The Research page builds a synthetic security with
   * `id: 0` and states that nothing is saved, so there the change is session
   * only — announced to the sibling panels, never persisted.
   */
  function applyBenchmarks(next: { bench1Id: number | null; bench2Id: number | null }) {
    setIds(next)
    if (security.id) saveMut.mutate(next)
    else announceBenchmarkChange({ securityId: security.id, ...next })
  }

  const { data: allBenchmarks = [], isPending: benchmarksPending } = useQuery({
    queryKey: QUERY_KEYS.benchmarks,
    queryFn: fetchBenchmarkOptions,
  })

  const { data: allSectorBenchmarks = [], isPending: sectorsPending } = useQuery({
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

  // Live-sync when a sibling view (StockReturnTable, on the Research page)
  // changes the selection. Our own announcements land here too and are a no-op,
  // since the state they describe is the state we just set.
  useEffect(
    () => onBenchmarkChange((sel) => {
      if (sel.securityId !== security.id) return
      setIds((cur) =>
        sel.bench1Id === cur.bench1Id && sel.bench2Id === cur.bench2Id
          ? cur
          : { bench1Id: sel.bench1Id, bench2Id: sel.bench2Id })
    }),
    [security.id],
  )

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

  /**
   * THREE states, not two. A comparator can be set-and-resolved, set-but-the
   * benchmark list has not arrived, or genuinely unset — and the middle one
   * looks exactly like the last if you only check whether the lookup found a
   * row. AAPL (which carries both) read "Set benchmark" under the amber
   * "grades against zero" warning for the second or so each load took, which is
   * a false statement on an audit surface and invites a click that would
   * overwrite a good value.
   */
  const slotState = (id: number | null, resolved: boolean, pending: boolean) =>
    resolved ? 'set' : id != null && pending ? 'loading' : id != null ? 'missing' : 'unset'

  const pickSlot = (slot: 1 | 2) => (bench: BenchmarkOption) =>
    applyBenchmarks(slot === 1 ? { ...ids, bench1Id: bench.id } : { ...ids, bench2Id: bench.id })
  const clearSlot = (slot: 1 | 2) => () =>
    applyBenchmarks(slot === 1 ? { ...ids, bench1Id: null } : { ...ids, bench2Id: null })

  /** One comparator, named and editable. Only a genuinely UNSET slot reads as a gap. */
  const slotButton = (slot: 1 | 2, label: string, state: ReturnType<typeof slotState>) => (
    <button
      type="button"
      onClick={() => setPicker(slot)}
      disabled={state === 'loading'}
      title={state === 'missing'
        ? 'The stored benchmark is not in the benchmark list — choose another'
        : `Choose the ${slot === 1 ? 'category benchmark' : 'sector benchmark'} these cards are graded against`}
      className={`rounded border px-2 py-0.5 font-medium ${
        state === 'set'     ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-400' :
        state === 'loading' ? 'border-gray-200 bg-white text-gray-400' :
        'border-dashed border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500'
      }`}
    >
      {state === 'set'     ? label :
       state === 'loading' ? 'Loading…' :
       state === 'missing' ? 'Benchmark not found' :
       `Set ${slot === 1 ? 'benchmark' : 'sector'}`}
    </button>
  )

  const state1 = slotState(ids.bench1Id, bench1 != null, benchmarksPending)
  const state2 = slotState(ids.bench2Id, bench2 != null, sectorsPending)
  // Only claim a comparator is missing once we actually know it is.
  const anyUnset = state1 === 'unset' || state2 === 'unset' ||
                   state1 === 'missing' || state2 === 'missing'

  return (
    <div>
      {/* Graded-against row. The four growth cards compare TTM and 3Y against
          these two; the two margin cards use the security's own prior years and
          are unaffected, which is why an unset comparator is amber rather than
          an error. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>Graded against</span>
        {slotButton(1, bench1Label, state1)}
        <span className="text-gray-300">·</span>
        {slotButton(2, bench2Label, state2)}
        {saveMut.isPending && <span className="text-gray-400">Saving…</span>}
        {!security.id && (
          <span className="text-gray-400">· this session only — nothing is saved here</span>
        )}
        {anyUnset && security.id !== 0 && (
          <span className="text-amber-700">
            · an unset comparator grades every growth card against zero, so any growth reads green
          </span>
        )}
      </div>
      {saveError && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {saveError}
        </p>
      )}

      {picker != null && (
        <BenchmarkPickerModal
          slot={picker}
          source={picker === 2 ? 'sector_benchmarks' : 'category_benchmarks'}
          currentId={picker === 1 ? ids.bench1Id : ids.bench2Id}
          onSelect={pickSlot(picker)}
          onClear={clearSlot(picker)}
          onClose={() => setPicker(null)}
        />
      )}

    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <MetricCard
        title={<>Operating Margin <span className="font-bold text-gray-700">TTM</span></>}
        subtitle=""
        displayValue={operatingMargin !== null ? fmtDecimalPct(operatingMargin) : EMPTY}
        rawValue={operatingMargin}
        neutral={0}
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
    </div>
  )
}
