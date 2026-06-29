import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtDecimalPct, fmtInt, stripTotalReturn } from '@/lib/formatters'
import type { SecurityDetail } from '@/lib/securities'
import { BenchmarkPickerModal, fetchBenchmarkOptions, type BenchmarkOption } from './BenchmarkPickerModal'
import { QUERY_KEYS } from '@/hooks/queryKeys'

// ── Period column definitions ─────────────────────────────────────────────────

type Period = {
  label: string
  navKey: keyof SecurityDetail
  categoryKey: keyof SecurityDetail
  rankKey: keyof SecurityDetail
  sizeKey: keyof SecurityDetail
  benchKey: keyof BenchmarkOption
}

const PERIODS: Period[] = [
  { label: '1 M',  navKey: 'one_month_total_return_nav',             categoryKey: 'category_one_month_total_return',   rankKey: 'one_month_total_return_rank_nav',   sizeKey: 'one_month_total_return_rank_category_size_nav',   benchKey: 'one_month_total_return' },
  { label: '3 M',  navKey: 'three_month_total_return_nav',           categoryKey: 'category_three_month_total_return', rankKey: 'three_month_total_return_rank_nav', sizeKey: 'three_month_total_return_rank_category_size_nav', benchKey: 'three_month_total_return' },
  { label: 'YTD',  navKey: 'ytd_total_return_nav',                   categoryKey: 'category_ytd_total_return',         rankKey: 'ytd_total_return_rank_nav',         sizeKey: 'ytd_total_return_rank_category_size_nav',         benchKey: 'ytd_total_return' },
  { label: '1 Y',  navKey: 'one_year_total_return_nav',              categoryKey: 'category_one_year_total_return',    rankKey: 'one_year_total_return_rank_nav',    sizeKey: 'one_year_total_return_rank_category_size_nav',    benchKey: 'annualized_daily_one_year_total_return' },
  { label: '3 Y',  navKey: 'annualized_three_year_total_return_nav', categoryKey: 'category_three_year_total_return',  rankKey: 'three_year_total_return_rank_nav',  sizeKey: 'three_year_total_return_rank_category_size_nav',  benchKey: 'annualized_daily_three_year_return' },
  { label: '5 Y',  navKey: 'annualized_five_year_total_return_nav',  categoryKey: 'category_five_year_total_return',   rankKey: 'five_year_total_return_rank_nav',   sizeKey: 'five_year_total_return_rank_category_size_nav',   benchKey: 'annualized_daily_five_year_total_return' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function numVal(s: SecurityDetail, key: keyof SecurityDetail): number | null {
  const v = s[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function benchVal(b: BenchmarkOption, key: keyof BenchmarkOption): number | null {
  const v = b[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function fmtRankSize(rank: number | null, size: number | null): string {
  if (rank == null) return '—'
  const rankStr = fmtInt(rank) ?? '—'
  const sizeStr = fmtInt(size) ?? '—'
  return `${rankStr} / ${sizeStr}`
}

// ── localStorage persistence ──────────────────────────────────────────────────

interface StoredBenchmarks {
  bench1Id: number | null
  bench2Id: number | null
}

function loadStored(securityId: number): StoredBenchmarks {
  try {
    const raw = localStorage.getItem(`fund_benchmarks_${securityId}`)
    if (!raw) return { bench1Id: null, bench2Id: null }
    const parsed = JSON.parse(raw)
    // migrate legacy format that stored full objects
    if ('bench1' in parsed || 'bench2' in parsed) {
      return { bench1Id: parsed.bench1?.id ?? null, bench2Id: parsed.bench2?.id ?? null }
    }
    return parsed as StoredBenchmarks
  } catch {
    return { bench1Id: null, bench2Id: null }
  }
}

function saveStored(securityId: number, state: StoredBenchmarks) {
  try {
    localStorage.setItem(`fund_benchmarks_${securityId}`, JSON.stringify(state))
    window.dispatchEvent(new CustomEvent('benchmark-changed', { detail: { securityId } }))
  } catch { /* ignore quota errors */ }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BenchmarkRowLabel({
  bench,
  placeholder,
  onClick,
}: {
  bench: BenchmarkOption | null
  placeholder: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to select a benchmark"
      className="group flex items-center gap-1.5 text-left font-medium text-gray-800 hover:text-gray-900"
    >
      <span className={bench ? 'text-gray-800' : 'text-gray-400 italic'}>
        {bench ? stripTotalReturn(bench.category_benchmark ?? bench.sector ?? bench.ticker) : placeholder}
      </span>
      <svg
        className="h-3 w-3 shrink-0 text-gray-400 group-hover:text-gray-600"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FundReturnTable({ security }: { security: SecurityDetail }) {
  const fundLabel = security.security_name?.trim() || security.security_id

  // ── Picker state ──────────────────────────────────────────────────────────
  const [storedIds, setStoredIds] = useState<StoredBenchmarks>({ bench1Id: null, bench2Id: null })
  const [pickerOpen, setPickerOpen] = useState<1 | 2 | null>(null)

  const { data: allBenchmarks = [] } = useQuery({
    queryKey: QUERY_KEYS.benchmarks,
    queryFn: fetchBenchmarkOptions,
  })

  useEffect(() => {
    if (!security.id) return
    setStoredIds(loadStored(security.id))
  }, [security.id])

  // Sync benchmark selections fired by the monitoring panel
  useEffect(() => {
    if (!security.id) return
    function handleChange(e: Event) {
      const detail = (e as CustomEvent<{ securityId: number }>).detail
      if (detail.securityId === security.id) setStoredIds(loadStored(security.id!))
    }
    window.addEventListener('benchmark-changed', handleChange)
    return () => window.removeEventListener('benchmark-changed', handleChange)
  }, [security.id])

  const bench1 = allBenchmarks.find((b) => b.id === storedIds.bench1Id) ?? null
  const bench2 = allBenchmarks.find((b) => b.id === storedIds.bench2Id) ?? null

  function selectBench(slot: 1 | 2, bench: BenchmarkOption) {
    const next: StoredBenchmarks = {
      bench1Id: slot === 1 ? bench.id : storedIds.bench1Id,
      bench2Id: slot === 2 ? bench.id : storedIds.bench2Id,
    }
    setStoredIds(next)
    if (security.id) saveStored(security.id, next)
  }

  function clearBench(slot: 1 | 2) {
    const next: StoredBenchmarks = {
      bench1Id: slot === 1 ? null : storedIds.bench1Id,
      bench2Id: slot === 2 ? null : storedIds.bench2Id,
    }
    setStoredIds(next)
    if (security.id) saveStored(security.id, next)
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  const empty = !PERIODS.some(
    (p) => numVal(security, p.navKey) != null || numVal(security, p.categoryKey) != null,
  )

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
        Total Performance
      </h3>

      {empty ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-600">
          No return data yet. Upload an Excel file on this page or edit the security in Supabase
          to populate fund, benchmark, and peer group returns.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100">
                <th
                  scope="col"
                  className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                >
                  Trailing returns
                </th>
                {PERIODS.map((p) => (
                  <th
                    key={p.label}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-gray-700"
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {/* ── Security row ── */}
              <tr className="bg-white">
                <th scope="row" className="max-w-[14rem] py-2.5 pl-3 pr-4 text-left font-medium text-gray-900">
                  {fundLabel}
                </th>
                {PERIODS.map((p) => (
                  <td key={p.label} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-900">
                    {fmtDecimalPct(numVal(security, p.navKey))}
                  </td>
                ))}
              </tr>

              {/* ── Benchmark 1 row — falls back to built-in category benchmark ── */}
              <tr className="bg-gray-50/80">
                <th scope="row" className="max-w-[14rem] py-2.5 pl-3 pr-4 text-left font-medium text-gray-800">
                  {bench1 ? (
                    <BenchmarkRowLabel
                      bench={bench1}
                      placeholder="Select benchmark 1"
                      onClick={() => setPickerOpen(1)}
                    />
                  ) : (
                    <BenchmarkRowLabel
                      bench={null}
                      placeholder="Category Benchmark"
                      onClick={() => setPickerOpen(1)}
                    />
                  )}
                </th>
                {PERIODS.map((p) => (
                  <td key={p.label} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-800">
                    {bench1
                      ? fmtDecimalPct(benchVal(bench1, p.benchKey))
                      : fmtDecimalPct(numVal(security, p.categoryKey))}
                  </td>
                ))}
              </tr>

              {/* ── Benchmark 2 row ── */}
              <tr className="bg-white">
                <th scope="row" className="max-w-[14rem] py-2.5 pl-3 pr-4 text-left font-medium text-gray-800">
                  <BenchmarkRowLabel
                    bench={bench2}
                    placeholder="Select benchmark 2"
                    onClick={() => setPickerOpen(2)}
                  />
                </th>
                {PERIODS.map((p) => (
                  <td key={p.label} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-800">
                    {bench2 ? fmtDecimalPct(benchVal(bench2, p.benchKey)) : '—'}
                  </td>
                ))}
              </tr>

              {/* ── Rank in peer group row (rank / size) ── */}
              <tr className="bg-gray-50/50">
                <th scope="row" className="max-w-[14rem] py-2 pl-3 pr-4 text-left text-xs font-medium text-gray-500">
                  Rank in peer group
                </th>
                {PERIODS.map((p) => (
                  <td key={p.label} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs text-gray-600">
                    {fmtRankSize(numVal(security, p.rankKey), numVal(security, p.sizeKey))}
                  </td>
                ))}
              </tr>

            </tbody>
          </table>
        </div>
      )}

      {/* ── Benchmark picker modal ── */}
      {pickerOpen != null && (
        <BenchmarkPickerModal
          slot={pickerOpen}
          source="category_benchmarks"
          currentId={pickerOpen === 1 ? (bench1?.id ?? null) : (bench2?.id ?? null)}
          onSelect={(bench) => selectBench(pickerOpen, bench)}
          onClear={() => clearBench(pickerOpen)}
          onClose={() => setPickerOpen(null)}
        />
      )}
    </div>
  )
}
