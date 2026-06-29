/**
 * BenchmarkPickerModal
 *
 * Shown when the user clicks a benchmark label row in the total-return table.
 * Supports two sources:
 *   - 'category_benchmarks' (default) — broad asset-class benchmarks
 *   - 'sector_benchmarks'             — sector ETF benchmarks
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import {
  fetchBenchmarkOptions,
  fetchSectorBenchmarkOptions,
  type BenchmarkOption,
  type BenchmarkSource,
} from '@/lib/benchmarks'

interface Props {
  slot: 1 | 2
  source?: BenchmarkSource
  onSelect: (bench: BenchmarkOption) => void
  onClear: () => void
  onClose: () => void
  currentId: number | null
}

export function BenchmarkPickerModal({ slot, source = 'category_benchmarks', onSelect, onClear, onClose, currentId }: Props) {
  const [search, setSearch] = useState('')

  const isSector = source === 'sector_benchmarks'

  const { data: benchmarks = [], isLoading, error } = useQuery({
    queryKey: isSector ? QUERY_KEYS.sectorBenchmarks : QUERY_KEYS.benchmarks,
    queryFn: isSector ? fetchSectorBenchmarkOptions : fetchBenchmarkOptions,
  })

  const filtered = benchmarks.filter((b) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const name = isSector ? (b.sector ?? '') : (b.category_benchmark ?? '')
    const sub  = isSector ? (b.sector ?? '')            : (b.category ?? '')
    return (
      b.ticker.toLowerCase().includes(q) ||
      name.toLowerCase().includes(q) ||
      sub.toLowerCase().includes(q)
    )
  })

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Select {isSector ? 'Sector Benchmark' : `Benchmark ${slot}`}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Returns will populate in the table row
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <input
            autoFocus
            type="text"
            placeholder="Search by symbol or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
        </div>

        {/* List */}
        <div className="max-h-72 overflow-y-auto px-2 pb-2">
          {isLoading && (
            <p className="px-3 py-6 text-center text-sm text-gray-400">Loading benchmarks…</p>
          )}
          {error && (
            <p className="px-3 py-6 text-center text-sm text-red-500">
              Failed to load benchmarks
            </p>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-gray-400">No benchmarks found</p>
          )}
          {filtered.map((b) => {
            const isSelected = b.id === currentId
            const displayName = isSector ? b.sector : b.category_benchmark
            return (
              <button
                key={b.id}
                onClick={() => { onSelect(b); onClose() }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="min-w-0">
                  <span className={`font-mono text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                    {b.ticker}
                  </span>
                  {displayName && (
                    <span className={`ml-2 text-xs ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                      {displayName}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        {currentId != null && (
          <div className="border-t border-gray-100 px-5 py-3">
            <button
              onClick={() => { onClear(); onClose() }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove {isSector ? 'sector benchmark' : `benchmark ${slot}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
