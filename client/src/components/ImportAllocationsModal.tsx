import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  parseAllocationFile, checkAllocationImport, applyAllocationImport,
  type AllocationImportPreview,
} from '@/lib/allocationImport'
import { recordImportRuns } from '@/lib/importRuns'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'
import type { ParsedDynamicAllocations } from '@/lib/portfolioAllocations'

const ACCEPT = '.xlsx,.xlsm,.xls,.csv'

/**
 * Import a YCharts dynamic allocation file for one portfolio.
 *
 * **Parse and preview first, write only on confirm.** The import REPLACES the
 * portfolio's snapshots and re-points its positions, which is not something to
 * discover after the fact from a toast — so the file's dates, holdings and
 * totals are shown before anything is written.
 *
 * This is deliberately an explicit, labelled data import rather than a document
 * upload. Dropping a spreadsheet into the Documents tab must not rewrite a book.
 */
export function ImportAllocationsModal({
  portfolioName, onClose,
}: { portfolioName: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedDynamicAllocations | null>(null)
  const [preview, setPreview] = useState<AllocationImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function pick(f: File | null) {
    setFile(f); setParsed(null); setPreview(null); setError(null); setDone(null)
    if (!f) return
    setBusy(true)
    try {
      const p = await parseAllocationFile(f)
      if (p.dates.length === 0) {
        throw new Error('No dated rows found. Expected the long format: Date · Symbol · Target Weight.')
      }
      setParsed(p)
      setPreview(await checkAllocationImport(p))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!parsed || !file) return
    setBusy(true); setError(null)
    try {
      const res = await applyAllocationImport(portfolioName, parsed)
      await recordImportRuns(res.runs, file)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allocationGrid(portfolioName) }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.positions(portfolioName) }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allocationChanges(portfolioName) }),
      ])
      setDone(res.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Import allocations</h2>
        <p className="mt-1 text-xs text-gray-500">
          YCharts dynamic export for <span className="font-medium text-gray-700">{portfolioName}</span> —
          long format (Date · Symbol · Target Weight), weights in decimal.
        </p>

        {!done && (
          <input
            type="file" accept={ACCEPT} disabled={busy}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-50"
          />
        )}

        {busy && <p className="mt-3 text-xs text-gray-500">Working…</p>}
        {error && <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        {preview && !done && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              {preview.dates.length} date{preview.dates.length === 1 ? '' : 's'} · {preview.symbols.length} securities
            </p>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="text-left font-medium">Date</th>
                  <th className="text-right font-medium">Holdings</th>
                  <th className="text-right font-medium">Total</th>
                  <th className="text-left font-medium pl-3">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {preview.dates.map((d) => {
                  // A snapshot that does not total 100% is a broken file, not a
                  // rounding quirk — say so before it becomes the book.
                  const off = Math.abs(d.total - 100) >= 0.05
                  return (
                    <tr key={d.effectiveDate}>
                      <td className="py-0.5 text-gray-700">{formatDate(d.effectiveDate)}</td>
                      <td className="py-0.5 text-right tabular-nums text-gray-500">{d.holdings}</td>
                      <td className={`py-0.5 text-right tabular-nums ${off ? 'font-medium text-amber-700' : 'text-gray-500'}`}>
                        {d.total.toFixed(2)}%
                      </td>
                      <td className="py-0.5 pl-3 text-gray-400">
                        {d.effectiveDate === preview.latestDate ? 'sets positions' : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {preview.unknownSecurities.length > 0 && (
              <div className="mt-3 rounded-md bg-amber-50 p-2.5 text-xs text-amber-800">
                <p className="font-medium">
                  Positions will NOT be updated — {preview.unknownSecurities.length} ticker(s) are not in the
                  securities table: {preview.unknownSecurities.join(', ')}
                </p>
                <p className="mt-1">
                  Add them to the YCharts workbook's <span className="font-medium">Securities</span> sheet and
                  re-import. The dated history below still imports. (They are not created automatically — a
                  fund's identity and metrics come from the workbook, not a price feed.)
                </p>
              </div>
            )}

            <p className="mt-3 rounded-md bg-gray-50 p-2.5 text-xs text-gray-600">
              This <span className="font-medium">replaces</span> every stored allocation date for {portfolioName}
              {' '}and re-points its positions at {preview.latestDate ? formatDate(preview.latestDate) : 'the newest date'}.
              Per-position limits and sort order are preserved.
            </p>
          </div>
        )}

        {done && <p className="mt-4 rounded-md bg-green-50 p-2.5 text-xs text-green-800">{done}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button type="button" disabled={!parsed || busy} onClick={confirm}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
