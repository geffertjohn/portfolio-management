import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ASSET_CLASS_ROWS } from '@/lib/modelPortfolios'
import {
  parseStrategicAllocationPdfText, saveStrategicVintage, diffVintages,
  bandTotal, STRATEGIC_PROFILES, PROFILE_LABELS,
  type ParsedVintage, type StrategicVintage,
} from '@/lib/strategicAllocation'
import { extractPdfPageText } from '@/lib/pdfText'
import { uploadFile, PORTFOLIO_DOCS_BUCKET, isServerUnreachable } from '@/lib/documents'
import { QUERY_KEYS } from '@/hooks/queryKeys'

/**
 * Where the published documents live.
 *
 * A nested key prefix, which Supabase Storage treats as a folder path — the
 * upload endpoint uses the folder string verbatim, so no server change was
 * needed.
 *
 * **Not the `security-uploads` general store, despite that being the obvious
 * home for a firm-level document.** That bucket restricts `allowed_mime_types`
 * to the two Excel types, so Storage rejects a PDF outright with "mime type
 * application/pdf is not supported" — found by trying it. Widening it would
 * remove a guard that is doing its job: that bucket is the spreadsheet store.
 *
 * `Portfolio Documents` has no MIME restriction, and a file here is invisible
 * to the one thing that scans it: `latestFileFor` matches on
 * `folder === portfolioName` AND a spreadsheet extension, and this folder is
 * neither.
 */
export const STRATEGIC_ALLOCATION_FOLDER = 'compliance/strategic asset allocation models'

type Stage = 'choose' | 'parsed' | 'saving'

/**
 * Upload a published document — **preview, then write**.
 *
 * The same shape as the allocation import, and for the same reason: this
 * replaces a governed figure that the compliance page and the drift report
 * both read. The advisor sees the month it parsed as, every weight it read,
 * and exactly what would change, before anything is stored.
 *
 * The PDF is uploaded only on confirm. A file rejected at the preview stage
 * leaves nothing behind in storage.
 */
export function UploadStrategicAllocationModal({
  existing, onClose,
}: {
  existing: StrategicVintage[]
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<Stage>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedVintage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  useEffect(() => {
    const d = dialogRef.current
    if (d && !d.open) d.showModal()
  }, [])

  const replacing = parsed
    ? existing.find((v) => v.effectiveMonth === parsed.effectiveMonth) ?? null
    : null
  // What this document would change, measured against the vintage it follows —
  // not against whatever is newest, since an older document may be uploaded.
  const predecessor = parsed
    ? existing.filter((v) => v.effectiveMonth < parsed.effectiveMonth)[0] ?? null
    : null
  const changes = parsed ? diffVintages(predecessor?.weights ?? null, parsed.weights) : []

  async function onPick(picked: File | null) {
    setError(null); setParsed(null); setFile(picked); setStage('choose')
    if (!picked) return
    if (!picked.name.toLowerCase().endsWith('.pdf')) {
      setError('That is not a PDF. The published allocation models come as a PDF.')
      return
    }
    setReading(true)
    try {
      const text = await extractPdfPageText(picked, 1)
      setParsed(parseStrategicAllocationPdfText(text))
      setStage('parsed')
    } catch (e) {
      // A scanned PDF extracts no text at all, which is worth saying plainly
      // rather than reporting as "no rows found".
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReading(false)
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed || !file) throw new Error('Nothing to save')
      let bucket: string | null = null
      let path: string | null = null
      try {
        // Persist the path the server RETURNS — it date-prefixes and sanitises
        // the name, so a client-derived path points at nothing (gotcha 15).
        path = await uploadFile(STRATEGIC_ALLOCATION_FOLDER, file, PORTFOLIO_DOCS_BUCKET)
        bucket = PORTFOLIO_DOCS_BUCKET
      } catch (e) {
        if (isServerUnreachable(e)) {
          throw new Error(
            'The Express file server is not reachable, so the PDF could not be stored. ' +
            'Start it with `cd server && npm run dev` and try again — nothing was saved.',
          )
        }
        throw e
      }
      await saveStrategicVintage({
        parsed,
        sourceDocBucket: bucket,
        sourceDocPath: path,
        sourceFileName: file.name,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.strategicAllocationVintages })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.documentsFiles(PORTFOLIO_DOCS_BUCKET) })
      onClose()
    },
  })

  const busy = reading || save.isPending

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}
      className="max-h-[90vh] w-full max-w-3xl rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30"
    >
      <div className="max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900">Upload Strategic Asset Allocation Models</h2>
        <p className="mt-1 text-sm text-gray-500">
          The published PDF. It is read and shown below before anything is saved, and the
          file is stored only when you confirm.
        </p>

        <div className="mt-4">
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
          />
          {reading && <p className="mt-2 text-sm text-gray-500">Reading the document…</p>}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {parsed && stage !== 'choose' && (
          <>
            <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm text-gray-900">
                Read as <span className="font-semibold">{parsed.label}</span>
                <span className="text-gray-500"> — taken from the document&rsquo;s own header, not today&rsquo;s date.</span>
              </p>
              {replacing && (
                <p className="mt-1 text-sm text-amber-700">
                  A document for {replacing.label} is already on file. Saving replaces it.
                </p>
              )}
              {predecessor && (
                <p className="mt-1 text-xs text-gray-500">
                  Compared against {predecessor.label}, the document it follows.
                </p>
              )}
              {!predecessor && !replacing && (
                <p className="mt-1 text-xs text-gray-500">
                  This is the earliest document on file, so there is nothing to compare it against.
                </p>
              )}
            </div>

            {parsed.warnings.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Read it, but check these
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                  {parsed.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Every weight it read, so a misread column is visible before it is stored. */}
            <div className="mt-4 overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="px-3 py-1.5 text-left font-semibold">Asset class</th>
                    {STRATEGIC_PROFILES.map((p) => (
                      <th key={p} className="px-2 py-1.5 text-right font-semibold">{PROFILE_LABELS[p]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-gray-100 font-semibold text-gray-800">
                    <td className="px-3 py-1">EQUITY</td>
                    {STRATEGIC_PROFILES.map((p) => (
                      <td key={p} className="px-2 py-1 text-right tabular-nums">{bandTotal(parsed.weights, p, 'equity')}%</td>
                    ))}
                  </tr>
                  {ASSET_CLASS_ROWS.map((row) => (
                    <tr key={row.key} className="border-t border-gray-100">
                      <td className="px-3 py-1 text-gray-700">{row.label}</td>
                      {STRATEGIC_PROFILES.map((p) => (
                        <td key={p} className="px-2 py-1 text-right tabular-nums text-gray-900">
                          {parsed.weights[p]?.[row.key] ?? '—'}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {predecessor
                  ? `Changes from ${predecessor.label} · ${changes.length}`
                  : 'Changes'}
              </p>
              {!predecessor ? (
                <p className="mt-1 text-sm text-gray-500">Nothing to compare against.</p>
              ) : changes.length === 0 ? (
                <p className="mt-1 text-sm text-gray-600">
                  No published weight changed. The document is new; the models it describes are not.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {changes.map((c) => (
                    <li key={`${c.profile}-${c.assetClassKey}`} className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">{PROFILE_LABELS[c.profile]}</span>
                      {' · '}{c.label}{' '}
                      <span className="tabular-nums">
                        {c.from ?? '—'}% <span className="text-gray-400">→</span>{' '}
                        <span className="font-medium text-gray-900">{c.to ?? '—'}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {save.isError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {(save.error as Error)?.message ?? 'Could not save.'}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsed || busy}
            onClick={() => { setStage('saving'); save.mutate() }}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : replacing ? `Replace ${replacing.label}` : 'Save document'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
