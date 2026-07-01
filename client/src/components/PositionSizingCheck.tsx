import { useRef, useState } from 'react'
import { parseActualAllocations, compareSizing, type SizingComparison } from '@/lib/positionSizingCompare'
import type { BandModel } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'
import { fmtDecimalPct, fmtNum } from '@/lib/formatters'

interface PositionSizingCheckProps {
  positions: PortfolioPosition[]
  modelPortfolio: BandModel
}

/** percent points (e.g. 7.36) → display "7.36%" */
const pct = (v: number | null) => (v == null ? '—' : `${fmtNum(v)}%`)

export function PositionSizingCheck({ positions, modelPortfolio }: PositionSizingCheckProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<SizingComparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  async function handleFile(file: File) {
    setParsing(true); setError(null); setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const actuals = parseActualAllocations(buf)
      if (actuals.size === 0) throw new Error('No ticker/allocation rows found in the file.')
      setResult(compareSizing(positions, modelPortfolio, actuals))
      setFileName(file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read the file.')
      setFileName(null)
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-600">
          Actual vs. target allocations
        </p>
        <div className="flex items-center gap-2">
          {fileName && <span className="max-w-[10rem] truncate text-xs text-gray-400" title={fileName}>{fileName}</span>}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={parsing}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {parsing ? 'Reading…' : result ? 'Replace file' : 'Upload allocations'}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {!result && !error && (
        <p className="mt-2 text-xs text-gray-400">
          Upload the dated actual-allocations file to flag holdings outside their limits.
        </p>
      )}

      {result && (
        <div className="mt-2">
          {result.breaches.length === 0 ? (
            <p className="text-xs text-green-700">
              All matched holdings are within their allocation limits.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 font-medium">Ticker</th>
                  <th className="py-1 text-right font-medium">Actual</th>
                  <th className="py-1 text-right font-medium">Limits</th>
                  <th className="py-1 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.breaches.map((b) => (
                  <tr key={b.symbol} className="border-t border-gray-200">
                    <td className="py-1 font-medium text-gray-800" title={b.name ?? undefined}>{b.symbol}</td>
                    <td className="py-1 text-right text-gray-700">{pct(b.actual)}</td>
                    <td className="py-1 text-right text-gray-500">{pct(b.lower)}–{pct(b.upper)}</td>
                    <td className={`py-1 text-right font-medium ${b.direction === 'over' ? 'text-red-600' : 'text-amber-600'}`}>
                      {b.direction === 'over' ? 'Over' : 'Under'} {fmtDecimalPct(b.breachBy / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="mt-2 text-[11px] text-gray-400">
            {result.withinCount} within limits
            {result.unmatchedPositions.length > 0 && ` · ${result.unmatchedPositions.length} target${result.unmatchedPositions.length === 1 ? '' : 's'} not in file (${result.unmatchedPositions.join(', ')})`}
            {result.unmatchedFile.length > 0 && ` · held off-model: ${result.unmatchedFile.join(', ')}`}
          </p>
        </div>
      )}
    </div>
  )
}
