import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchLatestExternalResearch, insertExternalResearch, isNegativeRevision, targetUpside, toInsert,
} from '@/lib/externalResearch'
import { createActionItem } from '@/lib/actionItems'
import { uploadFile } from '@/lib/documents'
import { beatRate, fetchTipRanksFirmSummary } from '@/lib/fmpTipranks'
import { useQuery } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fmtDecimalPct, fmtSignedPct, fmtUsd } from '@/lib/formatters'
import type { ParsedResearch } from '@/lib/researchPdfParse'

interface Props {
  /** The PDF being imported — uploaded to Storage only if the import is confirmed. */
  file: File
  parsed: ParsedResearch
  /** Ticker of the page the upload happened on; the parsed ticker is checked against it. */
  securityId: string
  bucket: string
  onClose: () => void
}

/** A labelled text input for one parsed field. */
function Field({
  label, value, onChange, placeholder, type = 'text', className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
    </label>
  )
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Full ISO timestamp → the `YYYY-MM-DD` its LOCAL calendar day falls on. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Resolve what to persist for `published_at`.
 *
 * The date input only carries a calendar day, so writing it straight through
 * would store midnight UTC and render a day EARLY in any negative-offset
 * timezone (a 10:41 PM EDT report showing as the previous day). Keep the parsed
 * timestamp whenever the advisor left the day alone; if they changed it, anchor
 * at local noon so the calendar day survives the round trip either way.
 */
function resolvePublishedAt(parsedIso: string | null, dateInput: string): string | null {
  if (!dateInput) return null
  if (parsedIso && toDateInput(parsedIso) === dateInput) return parsedIso
  const local = new Date(`${dateInput}T12:00:00`)
  return Number.isNaN(local.getTime()) ? dateInput : local.toISOString()
}

/**
 * Review step for an uploaded sell-side research PDF.
 *
 * The parser is best-effort, so nothing is written until the advisor confirms
 * what was read off the cover page. On confirm the PDF is uploaded to Storage
 * FIRST and the row recorded only if that succeeds — never a research record
 * without its source document.
 */
export function ResearchImportModal({ file, parsed, securityId, bucket, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()

  const [ticker, setTicker] = useState(parsed.securityId ?? securityId)
  const [firm, setFirm] = useState(parsed.firm)
  const [reportType, setReportType] = useState(parsed.reportType ?? '')
  const [title, setTitle] = useState(parsed.title ?? '')
  const [publishedAt, setPublishedAt] = useState(toDateInput(parsed.publishedAt))
  const [ratingLabel, setRatingLabel] = useState(parsed.ratingLabel ?? '')
  const [ratingValue, setRatingValue] = useState(parsed.ratingValue?.toString() ?? '')
  const [targetPrice, setTargetPrice] = useState(parsed.targetPrice?.toString() ?? '')
  const [priorTarget, setPriorTarget] = useState(parsed.priorTargetPrice?.toString() ?? '')
  const [priceAtPub, setPriceAtPub] = useState(parsed.priceAtPublication?.toString() ?? '')
  const [suitability, setSuitability] = useState(parsed.suitability ?? '')

  useEffect(() => {
    const d = dialogRef.current
    if (d && !d.open) d.showModal()
  }, [])

  const num = (v: string): number | null => {
    const n = Number(v.replace(/[^0-9.-]/g, ''))
    return v.trim() && Number.isFinite(n) ? n : null
  }

  const upside = useMemo(
    () => targetUpside(num(targetPrice), num(priceAtPub)),
    [targetPrice, priceAtPub],
  )
  const tickerMismatch = ticker.trim().toUpperCase() !== securityId.toUpperCase()

  // How well this firm's targets have actually landed — shown so an imported
  // report carries its own source calibration rather than being cited blind.
  const { data: firmStats } = useQuery({
    queryKey: QUERY_KEYS.tipranksFirm(firm.trim()),
    queryFn: () => fetchTipRanksFirmSummary(firm.trim()),
    enabled: !!firm.trim(),
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const firmRate = firmStats ? beatRate(firmStats) : null

  const saveMut = useMutation({
    mutationFn: async () => {
      const symbol = ticker.trim().toUpperCase()
      const prior = await fetchLatestExternalResearch(symbol)

      // Upload first — a research row must always have its source PDF.
      const docPath = await uploadFile(symbol, file, bucket)

      const payload = toInsert(
        {
          ...parsed,
          firm: firm.trim() || parsed.firm,
          reportType: reportType.trim() || null,
          title: title.trim() || null,
          publishedAt: resolvePublishedAt(parsed.publishedAt, publishedAt),
          ratingLabel: ratingLabel.trim() || null,
          ratingValue: num(ratingValue),
          targetPrice: num(targetPrice),
          priorTargetPrice: num(priorTarget),
          priceAtPublication: num(priceAtPub),
          suitability: suitability.trim() || null,
        },
        {
          securityId: symbol,
          docPath,
          sourceFilename: file.name,
          priorRatingLabel: prior?.rating_label ?? null,
        },
      )
      await insertExternalResearch(payload)

      // A downgrade or a material target cut becomes a task to look at the position.
      const { downgrade, targetCut } = isNegativeRevision(
        { rating_value: payload.rating_value ?? null, target_price: payload.target_price ?? null, prior_target_price: payload.prior_target_price ?? null },
        prior?.rating_value ?? null,
      )
      if (downgrade || targetCut != null) {
        const reasons = [
          downgrade ? `${firm} cut its rating to ${payload.rating_label ?? 'a lower rating'} (was ${prior?.rating_label})` : null,
          targetCut != null ? `target price cut ${fmtSignedPct(targetCut)} to ${fmtUsd(payload.target_price)}` : null,
        ].filter(Boolean).join('; ')
        await createActionItem({
          title: `Review ${symbol} — ${downgrade ? 'analyst downgrade' : 'target price cut'}`,
          description: `${reasons}. Source: ${file.name}`,
          category: 'security',
          security_id: symbol,
          priority: downgrade ? 'high' : 'medium',
        })
      }
      return symbol
    },
    onSuccess: (symbol) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.documentsFiles(bucket) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.externalResearch(symbol) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItems })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allActions })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItemsBySecurity(symbol) })
      onClose()
    },
  })

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Import research report</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Read from <span className="font-medium text-gray-700">{file.name}</span>. Check the fields below before saving.
        </p>
      </div>

      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 py-5">
        {parsed.missing.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              Could not read: {parsed.missing.join(', ')}. Fill these in manually or leave blank.
            </p>
          </div>
        )}

        {tickerMismatch && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              This report is for <span className="font-semibold">{ticker.toUpperCase()}</span>, but you're on{' '}
              <span className="font-semibold">{securityId}</span>. It will be filed under {ticker.toUpperCase()}.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Ticker" value={ticker} onChange={setTicker} />
          <Field label="Firm" value={firm} onChange={setFirm} />
          <Field label="Report type" value={reportType} onChange={setReportType} placeholder="Company Comment" />
        </div>

        <Field label="Title" value={title} onChange={setTitle} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Published" value={publishedAt} onChange={setPublishedAt} type="date" />
          <Field label="Rating" value={ratingLabel} onChange={setRatingLabel} placeholder="Outperform" />
          <Field label="Rating #" value={ratingValue} onChange={setRatingValue} placeholder="2" />
          <Field label="Suitability" value={suitability} onChange={setSuitability} placeholder="MA/ACC" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Target price" value={targetPrice} onChange={setTargetPrice} />
          <Field label="Prior target" value={priorTarget} onChange={setPriorTarget} />
          <Field label="Price at publication" value={priceAtPub} onChange={setPriceAtPub} />
        </div>

        {firm.trim() && firmStats && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-600">
              <span className="font-semibold text-gray-800">{firm.trim()} track record</span>{' '}
              (TipRanks, trailing year):{' '}
              {firmRate != null
                ? <>targets beaten <span className="font-medium">{fmtDecimalPct(firmRate)}</span> of {firmStats.beats + firmStats.misses}</>
                : <>{firmStats.beats + firmStats.misses} resolved targets</>}
              {firmStats.averageReturn != null && (
                <> · avg return{' '}
                  <span className={firmStats.averageReturn >= 0 ? 'font-medium text-green-700' : 'font-medium text-red-600'}>
                    {fmtSignedPct(firmStats.averageReturn)}
                  </span>
                </>
              )}
              {' '}· {firmStats.actions.upgraded} upgrades vs {firmStats.actions.downgraded} downgrades
            </p>
          </div>
        )}

        {upside != null && (
          <p className="text-xs text-gray-500">
            Implied upside at publication:{' '}
            <span className={upside >= 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-600'}>
              {fmtSignedPct(upside)}
            </span>
          </p>
        )}

        {parsed.recommendationText && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recommendation</p>
            <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-700">
              {parsed.recommendationText}
            </p>
          </div>
        )}

        {parsed.valuationText && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Valuation</p>
            <p className="mt-1 whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-700">
              {parsed.valuationText}
            </p>
          </div>
        )}

        {saveMut.isError && (
          <p className="text-sm text-red-600">
            {saveMut.error instanceof Error ? saveMut.error.message : 'Could not save the report'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={saveMut.isPending}
          className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !ticker.trim()}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saveMut.isPending ? 'Saving…' : 'Save report'}
        </button>
      </div>
    </dialog>
  )
}
