import { useMutation, useQuery } from '@tanstack/react-query'
import {
  fetchReviewLog, OUTCOME_LABELS, OUTCOME_COLORS,
  RECOMMENDATION_LABELS, RECOMMENDATION_COLORS, CONVICTION_LABELS,
} from '@/lib/reviewLog'
import { getSignedUrl, SECURITY_DOCS_BUCKET } from '@/lib/documents'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'
import { fmtDecimalPct, fmtUsd } from '@/lib/formatters'

export function ReviewLogSection({ securityId }: { securityId: string }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.reviewLog(securityId),
    queryFn: () => fetchReviewLog(securityId),
  })

  // Open a review's evidence PDF (funds/ETFs) via a short-lived signed URL.
  const viewEvidence = useMutation({
    mutationFn: (path: string) => getSignedUrl(path, SECURITY_DOCS_BUCKET),
    onSuccess: (url) => window.open(url, '_blank'),
    onError: (e) => alert(e instanceof Error ? e.message : 'Could not open evidence document'),
  })

  if (isLoading) return <p className="text-sm text-gray-500">Loading review history…</p>

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Review History</h3>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">No reviews logged yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(entry.reviewed_at)}
                  </span>
                  {/* Recommendation badge (stocks) */}
                  {entry.recommendation && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${RECOMMENDATION_COLORS[entry.recommendation]}`}>
                      {RECOMMENDATION_LABELS[entry.recommendation]}
                    </span>
                  )}
                  {/* Conviction */}
                  {entry.conviction && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {CONVICTION_LABELS[entry.conviction]}
                    </span>
                  )}
                  {/* Outcome badge (funds) */}
                  {entry.outcome && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_COLORS[entry.outcome]}`}>
                      {OUTCOME_LABELS[entry.outcome]}
                    </span>
                  )}
                  {/* IPS suitability */}
                  {entry.ips_suitable !== null && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      entry.ips_suitable === true
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      IPS {entry.ips_suitable ? 'Suitable' : 'Not Suitable'}
                    </span>
                  )}
                </div>
                {/* Reviewer */}
                {entry.reviewed_by && (
                  <span className="text-xs text-gray-500">{entry.reviewed_by}</span>
                )}
              </div>
              {entry.notes && (
                <p className="mt-1.5 text-sm text-gray-600">{entry.notes}</p>
              )}
              {/* Uploaded evidence PDF (funds/ETFs) — frozen scorecard at the review date */}
              {entry.evidence_doc_path && (
                <button
                  type="button"
                  onClick={() => viewEvidence.mutate(entry.evidence_doc_path!)}
                  disabled={viewEvidence.isPending}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {viewEvidence.isPending ? 'Opening…' : 'Evidence PDF'}
                </button>
              )}
              {/* Frozen evidence — what the metrics were when the call was made */}
              {entry.metrics_snapshot && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600">
                    Evidence at review
                  </summary>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>Price {fmtUsd(entry.metrics_snapshot.price)}</span>
                    {entry.metrics_snapshot.analyst.consensus && (
                      <span>Consensus {entry.metrics_snapshot.analyst.consensus}</span>
                    )}
                    <span>Target {fmtUsd(entry.metrics_snapshot.analyst.targetConsensus)}</span>
                    <span>Op margin {fmtDecimalPct(entry.metrics_snapshot.scorecard.operatingMargin)}</span>
                    <span>FCF margin {fmtDecimalPct(entry.metrics_snapshot.scorecard.fcfMargin)}</span>
                    <span>Rev TTM {fmtDecimalPct(entry.metrics_snapshot.scorecard.revGrowthTtm)}</span>
                    <span>EPS TTM {fmtDecimalPct(entry.metrics_snapshot.scorecard.epsGrowthTtm)}</span>
                    <span>Rev 3Y {fmtDecimalPct(entry.metrics_snapshot.scorecard.revCagr3y)}</span>
                    <span>EPS 3Y {fmtDecimalPct(entry.metrics_snapshot.scorecard.epsCagr3y)}</span>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
