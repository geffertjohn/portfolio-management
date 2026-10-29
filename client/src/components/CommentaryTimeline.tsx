/**
 * CommentaryTimeline
 *
 * One row per earnings call, newest first, with the documents written around it:
 * the pre-earnings brief, the post-earnings brief, the (not yet built) quarterly
 * brief, and the transcript. Replaces the stacked card list, which grew by two
 * full-height cards every quarter and pushed the record off the screen.
 *
 * A cell is empty when the document does not exist — deliberately, because the
 * gaps ARE the record. A print that was never graded shows as a pre-brief with
 * nothing beside it, which is the one thing a card list could never show.
 *
 * Transcripts are fetched per row on open, not up front: eight transcripts are
 * tens of thousands of words each, and the row the advisor wants is normally the
 * top one.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResearchReport, ThesisStatus } from '@/lib/researchReports'
import { fetchTranscript, fetchKeyExecutives } from '@/lib/fmpTranscripts'
import { fetchCallSummary } from '@/lib/earningsCallSummaries'
import type { CommentaryRow } from '@/lib/commentaryTimeline'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { EMPTY } from '@/lib/formatters'
import { buildQuarterlyBrief, canBuildQuarterlyBrief } from '@/lib/quarterlyBrief'
import { buildQuarterlyBriefPdf } from '@/lib/quarterlyBriefPdf'
import { uploadFile, SECURITY_DOCS_BUCKET, isServerUnreachable } from '@/lib/documents'
import { QuarterlyBriefView } from '@/components/QuarterlyBriefView'
import { ResearchCard } from '@/components/icReviewCards'
import { TranscriptViewer } from '@/components/TranscriptViewer'
import { EarningsCallSummaryPanel } from '@/components/EarningsCallSummaryPanel'

function fmtDate(iso: string | null): string {
  if (!iso) return EMPTY
  const d = new Date(iso.split(/[\sT]/)[0] + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** The post-brief's verdict on the thesis — the row's single most important fact. */
const THESIS_DOT: Record<ThesisStatus, { className: string; label: string }> = {
  intact: { className: 'bg-green-500', label: 'Thesis intact' },
  at_risk: { className: 'bg-amber-500', label: 'Thesis at risk' },
  broken: { className: 'bg-red-500', label: 'Thesis broken' },
}

function DocIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V7.5l-4-4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h4.5" />
    </svg>
  )
}

function TranscriptIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.5 12a8.5 8.5 0 1 1-3.9-7.15M8 10.5h8M8 14h5" />
    </svg>
  )
}

/** Shared modal shell — native <dialog>, so Esc and focus trapping come free. */
function Modal({
  title,
  subtitle,
  onClose,
  children,
  actions,
}: {
  title: string
  subtitle?: string | null
  onClose: () => void
  children: React.ReactNode
  /** Buttons pinned to a footer bar, out of the scrolling body. */
  actions?: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      className="max-h-[90vh] w-full max-w-4xl rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 p-6">{children}</div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-gray-100 px-6 py-3">
            {actions}
          </div>
        )}
      </div>
    </dialog>
  )
}

/**
 * One call's transcript, with the committee's read of it above.
 *
 * The summary leads because it is the part read every time; the transcript is
 * what you open when the summary raises a question. Both are per-call here,
 * which the old latest-only Transcripts section could not do.
 */
function TranscriptModal({
  securityId,
  companyName,
  row,
  onClose,
}: {
  securityId: string
  companyName: string | null
  row: CommentaryRow
  onClose: () => void
}) {
  const { data: transcript, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.transcriptForCall(securityId, row.fiscalYear, row.quarter),
    queryFn: () => fetchTranscript(securityId, row.fiscalYear, row.quarter),
    staleTime: 1000 * 60 * 60 * 6, // transcripts don't change
    retry: false,
  })
  const { data: executives } = useQuery({
    queryKey: QUERY_KEYS.keyExecutives(securityId),
    queryFn: () => fetchKeyExecutives(securityId),
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
  })
  // The row carries the summary already, but refetch by call so a summary
  // written after the page loaded still appears.
  const { data: summary } = useQuery({
    queryKey: QUERY_KEYS.callSummary(securityId, row.fiscalYear, row.quarter),
    queryFn: () => fetchCallSummary(securityId, row.fiscalYear, row.quarter),
    initialData: row.summary ?? undefined,
  })

  return (
    <Modal
      title={`Q${row.quarter} ${row.fiscalYear} earnings call`}
      subtitle={`${securityId}${row.callDate ? ` · ${fmtDate(row.callDate)}` : ''}`}
      onClose={onClose}
    >
      <div className="space-y-6">
        {summary && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Earnings Summary
            </h3>
            <EarningsCallSummaryPanel summary={summary} />
          </section>
        )}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Earnings Transcript
          </h3>
          {isLoading && <p className="text-sm text-gray-400">Loading transcript…</p>}
          {isError && <p className="text-sm text-gray-400">Could not load this transcript.</p>}
          {!isLoading && !isError && !transcript && (
            <p className="text-sm text-gray-400">No transcript available for this call.</p>
          )}
          {transcript && (
            <TranscriptViewer
              transcript={transcript}
              companyName={companyName}
              executives={executives ?? []}
            />
          )}
        </section>
      </div>
    </Modal>
  )
}

/**
 * The quarterly brief — generated from the record on open, not stored.
 *
 * It contains no new information: every line is drawn from the pre-brief, the
 * call summary and the post-brief, so a stored copy could only go stale against
 * the rows it was built from. Saving is therefore an explicit act, for when the
 * point IS to freeze a version — a document sent to a client has to stay exactly
 * what was sent, and that copy lands in the security's Documents folder where
 * the rest of the audit trail lives.
 */
function QuarterlyBriefModal({
  securityId,
  companyName,
  row,
  onClose,
}: {
  securityId: string
  companyName: string | null
  row: CommentaryRow
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState<string | null>(null)

  const brief = buildQuarterlyBrief({
    ticker: securityId,
    companyName,
    fiscalYear: row.fiscalYear,
    quarter: row.quarter,
    callDate: row.callDate ? fmtDate(row.callDate) : null,
    preBrief: row.pre[0] ?? null,
    postBrief: row.post[0] ?? null,
    summary: row.summary,
  })

  const download = () => {
    const { blob, filename } = buildQuarterlyBriefPdf(brief)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    // Revoke on the next tick — revoking synchronously races the download in
    // Safari and the file arrives empty.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const save = useMutation({
    mutationFn: async () => {
      const { blob, filename } = buildQuarterlyBriefPdf(brief)
      const file = new File([blob], filename, { type: 'application/pdf' })
      // Keep the path the server returns — it date-prefixes and sanitises.
      return uploadFile(securityId, file, SECURITY_DOCS_BUCKET)
    },
    onSuccess: (path) => {
      setSaved(path)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.documentsFiles(SECURITY_DOCS_BUCKET) })
    },
  })

  const saveError = save.error
    ? isServerUnreachable(save.error)
      ? 'Could not save — the Express file server is not reachable (cd server && npm run dev).'
      : (save.error as Error).message
    : null

  return (
    <Modal
      title={`Quarterly brief · Q${row.quarter} ${row.fiscalYear}`}
      subtitle={`${securityId} — generated from the record, not stored`}
      onClose={onClose}
      actions={
        <>
          {saved && <span className="text-xs text-green-700">Saved to Documents</span>}
          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save to Documents'}
          </button>
          <button
            type="button"
            onClick={download}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Download PDF
          </button>
        </>
      }
    >
      <QuarterlyBriefView brief={brief} />
    </Modal>
  )
}

function ReportModal({
  report,
  parentDate,
  onClose,
}: {
  report: ResearchReport
  parentDate: string | null
  onClose: () => void
}) {
  const label = report.report_type === 'post_earnings' ? 'Post-earnings brief' : 'Pre-earnings brief'
  const period = report.fiscal_year != null ? `Q${report.quarter} ${report.fiscal_year}` : null
  return (
    <Modal
      title={`${label}${period ? ` · ${period}` : ''}`}
      subtitle={`${report.security_id} · written ${fmtDate(report.created_at)}`}
      onClose={onClose}
    >
      <ResearchCard r={report} parentDate={parentDate} />
    </Modal>
  )
}

/** A cell of document icons — empty when there is nothing to open. */
function DocCell({
  reports,
  onOpen,
  label,
}: {
  reports: ResearchReport[]
  onOpen: (r: ResearchReport) => void
  label: string
}) {
  if (reports.length === 0) {
    return <span className="text-sm text-gray-300">{EMPTY}</span>
  }
  return (
    <div className="flex items-center justify-center gap-1">
      {reports.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r)}
          title={`${label} — written ${fmtDate(r.created_at)}${r.status === 'draft' ? ' (draft)' : ''}`}
          aria-label={`Open ${label} written ${fmtDate(r.created_at)}`}
          className={`rounded p-1 transition-colors hover:bg-indigo-50 ${
            r.status === 'draft' ? 'text-sky-500 hover:text-sky-700' : 'text-indigo-500 hover:text-indigo-700'
          }`}
        >
          <DocIcon />
        </button>
      ))}
    </div>
  )
}

export function CommentaryTimeline({
  securityId,
  companyName,
  rows,
  isLoading,
}: {
  securityId: string
  companyName: string | null
  rows: CommentaryRow[]
  isLoading: boolean
}) {
  const [openReport, setOpenReport] = useState<ResearchReport | null>(null)
  const [openCall, setOpenCall] = useState<CommentaryRow | null>(null)
  const [openQuarterly, setOpenQuarterly] = useState<CommentaryRow | null>(null)

  // A post-brief names the pre-brief it answers; both are in `rows`, so resolve
  // the date here rather than making the card fetch its own parent.
  const dateById = new Map<number, string>()
  for (const r of rows) for (const rep of [...r.pre, ...r.post]) dateById.set(rep.id, rep.created_at)

  if (isLoading) return <p className="text-sm text-gray-400">Loading…</p>
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">No earnings calls or briefs for this security yet.</p>
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-4 text-left font-semibold">Period</th>
              <th className="px-4 py-2 text-left font-semibold">Earnings date</th>
              <th className="px-4 py-2 text-center font-semibold">Pre-earnings</th>
              <th className="px-4 py-2 text-center font-semibold">Post-earnings</th>
              <th className="px-4 py-2 text-center font-semibold">Quarterly</th>
              <th className="px-4 py-2 text-center font-semibold">Transcript</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = row.post[0]?.thesis_status ?? null
              const dot = status ? THESIS_DOT[status] : null
              return (
                <tr key={row.key} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                  <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-2">
                      Q{row.quarter} {row.fiscalYear}
                      {dot && (
                        <span
                          title={dot.label}
                          aria-label={dot.label}
                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot.className}`}
                        />
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                    {row.callDate && row.dateBasis !== 'transcript' ? (
                      /* The call is dated by the earnings calendar, not a
                         transcript — say which, because "reported, not yet
                         transcribed" and "not yet held" look identical
                         otherwise and only one of them is still to come. */
                      <span className="text-gray-500">
                        {fmtDate(row.callDate)}{' '}
                        <span className="text-xs text-gray-400">
                          {row.dateBasis === 'reported' ? '(awaiting transcript)' : '(expected)'}
                        </span>
                      </span>
                    ) : row.callDate ? (
                      row.dateSuspect ? (
                        /* FMP contradicts itself here — the date falls before a
                           call of an earlier period. Show it, but do not assert
                           it: the fiscal period is the reliable half of the row. */
                        <span
                          className="text-gray-400 underline decoration-dotted underline-offset-2"
                          title={`FMP dates this call ${fmtDate(row.callDate)}, which falls before an earlier quarter's call — the vendor date disagrees with the fiscal period, so treat it as unreliable.`}
                        >
                          {fmtDate(row.callDate)}?
                        </span>
                      ) : (
                        fmtDate(row.callDate)
                      )
                    ) : (
                      <span className="text-xs text-gray-400">Awaiting call</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <DocCell reports={row.pre} onOpen={setOpenReport} label="Pre-earnings brief" />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <DocCell reports={row.post} onOpen={setOpenReport} label="Post-earnings brief" />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {canBuildQuarterlyBrief(row) ? (
                      <button
                        type="button"
                        onClick={() => setOpenQuarterly(row)}
                        title={`Open the Q${row.quarter} ${row.fiscalYear} quarterly brief`}
                        aria-label={`Open the Q${row.quarter} ${row.fiscalYear} quarterly brief`}
                        className="rounded p-1 text-teal-600 transition-colors hover:bg-teal-50 hover:text-teal-800"
                      >
                        <DocIcon />
                      </button>
                    ) : (
                      <span className="text-sm text-gray-300">{EMPTY}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.dateBasis === 'transcript' ? (
                      <button
                        type="button"
                        onClick={() => setOpenCall(row)}
                        title={
                          row.summary
                            ? `Open the Q${row.quarter} ${row.fiscalYear} transcript and the committee's call summary`
                            : `Open the Q${row.quarter} ${row.fiscalYear} transcript`
                        }
                        aria-label={`Open the Q${row.quarter} ${row.fiscalYear} transcript`}
                        /* Tinted when the committee has read the call. The glyph
                           carries "a transcript exists" and "we have a summary of
                           it" together, which is one fact about the call rather
                           than two — and without it a summary on a quarter with
                           no briefs (GLW Q3 2026) is reachable only by hovering. */
                        className={`rounded p-1 transition-colors hover:bg-indigo-50 hover:text-indigo-700 ${
                          row.summary ? 'text-indigo-500' : 'text-gray-400'
                        }`}
                      >
                        <TranscriptIcon />
                      </button>
                    ) : (
                      <span className="text-sm text-gray-300">{EMPTY}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        The quarterly brief is generated from that quarter's documents when you open it, so it
        is never stale; save it to Documents when you need a frozen copy.
      </p>

      {openReport && (
        <ReportModal
          report={openReport}
          parentDate={
            openReport.parent_report_id != null ? dateById.get(openReport.parent_report_id) ?? null : null
          }
          onClose={() => setOpenReport(null)}
        />
      )}
      {openQuarterly && (
        <QuarterlyBriefModal
          securityId={securityId}
          companyName={companyName}
          row={openQuarterly}
          onClose={() => setOpenQuarterly(null)}
        />
      )}
      {openCall && (
        <TranscriptModal
          securityId={securityId}
          companyName={companyName}
          row={openCall}
          onClose={() => setOpenCall(null)}
        />
      )}
    </>
  )
}
