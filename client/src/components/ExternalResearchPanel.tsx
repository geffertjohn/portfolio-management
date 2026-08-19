import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteExternalResearch, fetchExternalResearch, ratingTone, targetDirection, targetUpside,
  type ExternalResearch,
} from '@/lib/externalResearch'
import { getSignedUrl, SECURITY_DOCS_BUCKET } from '@/lib/documents'
import { fetchQuote } from '@/lib/fmpMarket'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { EMPTY, fmtSignedPct, fmtUsd } from '@/lib/formatters'
import { formatDate } from '@/lib/fundFormat'

/** One key/value stat in a report card's header row. */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-900">{children}</p>
    </div>
  )
}

function ReportCard({
  report, currentPrice, onOpen, onRemove, defaultOpen,
}: {
  report: ExternalResearch
  currentPrice: number | null
  onOpen: (path: string) => void
  onRemove: (id: number) => void
  defaultOpen: boolean
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const dir = targetDirection(report.target_price, report.prior_target_price)
  const upsideNow = targetUpside(report.target_price, currentPrice)
  const upsideAtPub = targetUpside(report.target_price, report.price_at_publication)
  const analystNames = (report.analysts ?? []).map((a) => a.name).join(', ')

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {report.rating_label && (
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ratingTone(report.rating_value)}`}>
                {report.rating_label}
                {report.rating_value != null && <span className="ml-1 opacity-60">{report.rating_value}</span>}
              </span>
            )}
            <span className="text-xs font-medium text-gray-600">{report.firm}</span>
            {report.report_type && <span className="text-xs text-gray-400">· {report.report_type}</span>}
            <span className="text-xs text-gray-400">· {formatDate(report.published_at)}</span>
            {report.parse_status === 'partial' && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 ring-1 ring-inset ring-amber-200">
                partially read
              </span>
            )}
          </div>
          {report.title && <p className="mt-1.5 text-sm font-semibold text-gray-900">{report.title}</p>}
          {analystNames && <p className="mt-0.5 text-xs text-gray-400">{analystNames}</p>}
        </div>
        <button
          type="button"
          onClick={() => onRemove(report.id)}
          className="shrink-0 text-xs text-gray-300 hover:text-red-600"
          aria-label="Remove research record"
        >
          Remove
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-4">
        <Stat label="Target">
          {report.target_price != null ? fmtUsd(report.target_price) : EMPTY}
          {dir && (
            <span className={`ml-1 text-xs ${dir === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {dir === 'up' ? '↑' : '↓'} {fmtUsd(report.prior_target_price)}
            </span>
          )}
        </Stat>
        <Stat label="Price at publication">
          {report.price_at_publication != null ? fmtUsd(report.price_at_publication) : EMPTY}
        </Stat>
        <Stat label="Upside then">
          {upsideAtPub != null
            ? <span className={upsideAtPub >= 0 ? 'text-green-700' : 'text-red-600'}>{fmtSignedPct(upsideAtPub)}</span>
            : EMPTY}
        </Stat>
        <Stat label="Upside now">
          {upsideNow != null
            ? <span className={upsideNow >= 0 ? 'text-green-700' : 'text-red-600'}>{fmtSignedPct(upsideNow)}</span>
            : EMPTY}
        </Stat>
      </div>

      {(report.recommendation_text || report.valuation_text) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {expanded ? 'Hide analyst commentary' : 'Show analyst commentary'}
        </button>
      )}

      {expanded && (
        <div className="mt-3 space-y-3">
          {report.recommendation_text && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Recommendation</p>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-700">{report.recommendation_text}</p>
            </div>
          )}
          {report.valuation_text && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Valuation</p>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-700">{report.valuation_text}</p>
            </div>
          )}
        </div>
      )}

      {report.doc_path && (
        <button
          type="button"
          onClick={() => onOpen(report.doc_path as string)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          Open full report
        </button>
      )}
    </div>
  )
}

/**
 * Security-detail view of uploaded sell-side research (`external_research`) —
 * the street's rating, target and commentary, newest first.
 *
 * Sits beside the AI team's own `SecurityResearchPanel` on the Monitor tab so
 * the outside view and the in-house view are read together. Reports are
 * imported from the Documents tab; this panel is read-only apart from removal.
 */
export function ExternalResearchPanel({ securityId }: { securityId: string }) {
  const queryClient = useQueryClient()
  const { data: reports = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.externalResearch(securityId),
    queryFn: () => fetchExternalResearch(securityId),
    enabled: !!securityId,
  })

  // Same key/options as AnalystCoveragePanel so the quote is fetched once per page;
  // the live tick overlays it so "upside now" tracks the current quote.
  const { data: quote } = useQuery({
    queryKey: QUERY_KEYS.quote(securityId),
    queryFn: () => fetchQuote(securityId),
    staleTime: 1000 * 60 * 60,
    retry: false,
    enabled: !!securityId,
  })
  const live = useLiveQuote(securityId)
  const currentPrice = live?.price ?? quote?.price ?? null

  const openMut = useMutation({
    mutationFn: (path: string) => getSignedUrl(path, SECURITY_DOCS_BUCKET),
    onSuccess: (url) => window.open(url, '_blank'),
    onError: (e) => alert(e instanceof Error ? e.message : 'Could not open the report'),
  })

  const removeMut = useMutation({
    mutationFn: (id: number) => deleteExternalResearch(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.externalResearch(securityId) }),
  })

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Street Research</h2>
      <p className="mt-1 text-xs text-gray-400">
        Sell-side reports uploaded on the Documents tab. Recorded for reference — never acted on automatically.
      </p>
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-gray-400">
            No research uploaded for this security yet. Drop a Raymond James PDF on the Documents tab and it will be filed here.
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((r, i) => (
              <ReportCard
                key={r.id}
                report={r}
                currentPrice={currentPrice}
                defaultOpen={i === 0}
                onOpen={(p) => openMut.mutate(p)}
                onRemove={(id) => { if (confirm('Remove this research record? The PDF stays in Documents.')) removeMut.mutate(id) }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
