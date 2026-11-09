import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { parseActualAllocations, compareSizing, type SizingComparison, type SizingRow } from '@/lib/positionSizingCompare'
import type { BandModel } from '@/lib/positionBands'
import type { PortfolioPosition } from '@/types/position'
import { fmtDecimalPct, fmtNum } from '@/lib/formatters'
import { uploadFile, PORTFOLIO_DOCS_BUCKET, isServerUnreachable } from '@/lib/documents'
import { useLatestActualAllocation } from '@/hooks/usePortfolio'
import { formatDate } from '@/lib/fundFormat'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface PositionSizingCheckProps {
  positions: PortfolioPosition[]
  modelPortfolio: BandModel
  /** Portfolio name — the uploaded file is archived to this portfolio's Documents folder. */
  portfolioName: string
}

/** percent points (e.g. 7.36) → display "7.36%" */
const pct = (v: number | null) => (v == null ? '—' : `${fmtNum(v)}%`)

/** Signed drift from target, in percent points: 0.42 → "+0.42". */
const signed = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v))}`)

/**
 * A file that does not reconcile to 100% is a broken export, not a rounding
 * quirk — the same claim ImportAllocationsModal makes about its per-date
 * totals. A whole percentage point of slack allows for a holding the export
 * rounds, and nothing more.
 */
const TOTAL_EPS = 1

function statusCell(r: SizingRow) {
  switch (r.status) {
    case 'over':
      return <span className="font-medium text-red-600">Over {fmtDecimalPct((r.breachBy ?? 0) / 100)}</span>
    case 'under':
      return <span className="font-medium text-amber-600">Under {fmtDecimalPct((r.breachBy ?? 0) / 100)}</span>
    case 'missing':
      return <span className="text-amber-600">Not in file</span>
    case 'off_model':
      return <span className="text-amber-600">Off-model</span>
    default:
      return <span className="text-gray-400">Within</span>
  }
}

export function PositionSizingCheck({ positions, modelPortfolio, portfolioName }: PositionSizingCheckProps) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<SizingComparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // THE COMPARISON SURVIVES CLOSING THE DRAFT.
  //
  // It lived in `result` alone, so leaving the workspace and resuming the
  // review showed an empty upload prompt — the file was sitting in the
  // portfolio's Documents folder the whole time, archived by this very
  // component, and `fetchLatestActualAllocation` already knew how to find and
  // parse it. The advisor had to re-upload to see a comparison that had
  // already been made, in a draft whose entire purpose is to be resumable.
  //
  // The same hook the portfolio page uses, so the two surfaces read one file
  // and share one cache rather than each resolving the folder for themselves.
  const { data: archived, isLoading: archiveLoading, error: archiveError } =
    useLatestActualAllocation(portfolioName)

  const archivedResult = useMemo<SizingComparison | null>(
    () => (archived ? compareSizing(positions, modelPortfolio, archived.weights) : null),
    [archived, positions, modelPortfolio],
  )

  // An upload in THIS session wins. It is the file the advisor just put in
  // front of themselves, and the archived listing may not have caught up with
  // it yet — reading the folder back would briefly show the previous file as
  // though the upload had not happened.
  const shown = result ?? archivedResult

  /**
   * Where the figures on screen came from. Never left to be inferred: this
   * folder is a general document store, so the newest parseable sheet in it is
   * not necessarily the one this review is about, and a comparison that does
   * not name its own basis is one the advisor cannot check.
   */
  const basis = result
    ? fileName
    : archived
      ? `${archived.fileName} · uploaded ${formatDate(archived.asOf)}`
      : null

  async function handleFile(file: File) {
    setParsing(true); setError(null); setResult(null); setSaveState('idle')
    try {
      const buf = await file.arrayBuffer()
      const actuals = parseActualAllocations(buf)
      if (actuals.size === 0) throw new Error('No ticker/allocation rows found in the file.')
      setResult(compareSizing(positions, modelPortfolio, actuals))
      setFileName(file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read the file.')
      setFileName(null)
      setParsing(false)
      return
    }
    setParsing(false)

    // Archive the uploaded file to the portfolio's Documents folder. Secondary to
    // the comparison above — a failure here never discards the parsed result.
    setSaveState('saving')
    try {
      await uploadFile(portfolioName, file, PORTFOLIO_DOCS_BUCKET)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.documentsFiles(PORTFOLIO_DOCS_BUCKET) })
      // The archived file this section reads back on a resume is now THIS one,
      // and it is also what the portfolio page's Current column shows.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.latestActualAllocation(portfolioName) })
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      setError(
        isServerUnreachable(e)
          ? 'Comparison ready, but the file was not archived — the document server is unreachable (cd server && npm run dev).'
          : `Comparison ready, but archiving to Documents failed: ${e instanceof Error ? e.message : 'unknown error'}`,
      )
    }
  }

  return (
    <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-600">
          Actual vs. target allocations
        </p>
        <div className="flex items-center gap-2">
          {basis && <span className="max-w-[16rem] truncate text-xs text-gray-400" title={basis}>{basis}</span>}
          {saveState === 'saving' && <span className="text-xs text-gray-400">Archiving…</span>}
          {saveState === 'saved' && <span className="text-xs text-green-600" title={`Saved to ${portfolioName} Documents`}>✓ Saved to Documents</span>}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={parsing}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {parsing ? 'Reading…' : shown ? 'Replace file' : 'Upload allocations'}
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

      {!shown && !error && (
        <p className="mt-2 text-xs text-gray-400">
          {archiveLoading
            ? 'Looking for the last allocations file…'
            : 'Upload the dated actual-allocations file to compare the book against its limits.'}
        </p>
      )}

      {/* A missing document server must not take the section down with it —
          uploading still works, and the comparison is display-only. */}
      {!result && archiveError != null && (
        <p className="mt-2 text-xs text-gray-400">
          {isServerUnreachable(archiveError)
            ? 'The last uploaded file could not be read — the document server is unreachable (cd server && npm run dev).'
            : 'The last uploaded file could not be read. Upload it again to compare.'}
        </p>
      )}

      {shown && (
        <div className="mt-2">
          {/* The verdict, then the numbers it was reached from — never the
              verdict alone. This block showed only breaches until Nov 2026, so
              a book inside its limits rendered one green sentence and a count,
              and the advisor could not see the allocations they had just
              uploaded in the step whose whole purpose is to look at them. */}
          {shown.breaches.length === 0 ? (
            <p className="text-xs text-green-700">
              All matched holdings are within their allocation limits.
            </p>
          ) : (
            <p className="text-xs text-red-600">
              {shown.breaches.length} holding{shown.breaches.length === 1 ? '' : 's'} outside{' '}
              {shown.breaches.length === 1 ? 'its' : 'their'} allocation limits.
            </p>
          )}

          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 font-medium">Ticker</th>
                <th className="py-1 text-right font-medium">Target</th>
                <th className="py-1 text-right font-medium">Actual</th>
                <th className="py-1 text-right font-medium">Drift</th>
                <th className="py-1 text-right font-medium">Limits</th>
                <th className="py-1 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.rows.map((r) => (
                <tr
                  key={r.symbol}
                  className={`border-t border-gray-200 ${r.status === 'within' ? '' : 'bg-white'}`}
                >
                  <td className="py-1 font-medium text-gray-800" title={r.name ?? undefined}>{r.symbol}</td>
                  <td className="py-1 text-right text-gray-500">{pct(r.target)}</td>
                  <td className="py-1 text-right text-gray-700">{pct(r.actual)}</td>
                  <td className="py-1 text-right text-gray-500">{signed(r.drift)}</td>
                  <td className="py-1 text-right text-gray-500">
                    {r.lower == null && r.upper == null ? '—' : `${pct(r.lower)}–${pct(r.upper)}`}
                  </td>
                  <td className="py-1 text-right">{statusCell(r)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 font-medium text-gray-600">
                <td className="py-1">Total</td>
                <td className="py-1 text-right">{pct(shown.targetTotal)}</td>
                <td
                  className={`py-1 text-right ${Math.abs(shown.actualTotal - 100) > TOTAL_EPS ? 'text-amber-600' : ''}`}
                  title={
                    Math.abs(shown.actualTotal - 100) > TOTAL_EPS
                      ? 'The uploaded weights do not sum to 100% — check the export before reading the comparison.'
                      : undefined
                  }
                >
                  {pct(shown.actualTotal)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>

          <p className="mt-2 text-[11px] text-gray-400">
            {shown.withinCount} within limits
            {shown.unmatchedPositions.length > 0 && ` · ${shown.unmatchedPositions.length} target${shown.unmatchedPositions.length === 1 ? '' : 's'} not in file`}
            {shown.unmatchedFile.length > 0 && ` · ${shown.unmatchedFile.length} held off-model`}
          </p>
        </div>
      )}
    </div>
  )
}
