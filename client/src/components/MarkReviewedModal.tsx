import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { markReviewed, upsertReviewSchedule, type ReviewCadence } from '@/lib/reviewSchedules'
import {
  RECOMMENDATION_OPTIONS, RECOMMENDATION_LABELS, RECOMMENDATION_COLORS,
  CONVICTION_OPTIONS, CONVICTION_LABELS, OUTCOME_LABELS,
  type ReviewOutcome, type Recommendation, type Conviction, type ReviewMetricsSnapshot,
} from '@/lib/reviewLog'
import { addToAtRisk } from '@/lib/atRisk'
import { fetchScorecardMetrics } from '@/lib/fmpRatios'
import { fetchAnalystData } from '@/lib/fmpAnalyst'
import { fetchQuote } from '@/lib/fmpMarket'
import { fmtDecimalPct, fmtUsd, EMPTY } from '@/lib/formatters'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { SecurityDetail } from '@/lib/securities'
import { FundMonitoringPanel } from './FundMonitoringPanel'
import { buildFundReviewPdf } from '@/lib/reviewEvidencePdf'
import { uploadFile, SECURITY_DOCS_BUCKET, isServerUnreachable } from '@/lib/documents'
import { fetchCategoryBenchmark, fetchPeerGroupBenchmark } from '@/lib/benchmarks'

/** 'schedule' — set/update cadence + next review date, no log entry.
 *  'review'   — log a completed review and advance the schedule. */
export type ReviewModalMode = 'schedule' | 'review'

interface MarkReviewedModalProps {
  open: boolean
  onClose: () => void
  securityId: string
  securitySymbol: string
  currentCadence: ReviewCadence
  mode: ReviewModalMode
  isFund?: boolean
  /** Full security record — funds/ETFs use it to render the evidence block and build the review PDF. */
  security?: SecurityDetail
  /** Last earnings release date (YYYY-MM-DD). Drives the scheduled Review Date (+1 day). */
  lastEarnings?: string | null
  /** Next earnings release date (YYYY-MM-DD). Drives the Next Review Date (+1 day). */
  nextEarnings?: string | null
}

const CADENCE_OPTIONS: { value: ReviewCadence; label: string; months: number }[] = [
  { value: 'quarterly',   label: 'Quarterly (every 3 months)',   months: 3  },
  { value: 'semi_annual', label: 'Semi-Annual (every 6 months)', months: 6  },
  { value: 'annual',      label: 'Annual (every 12 months)',     months: 12 },
]

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

/** Parses a YYYY-MM-DD string and returns the date `days` later, or null. */
function earningsPlusDays(dateStr: string | null | undefined, days: number): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + days)
  return d
}

function fmtLongDate(date: Date | null): string {
  return date
    ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

type FundMainOutcome = 'maintain' | 'propose'
type ProposeAction = 'add' | 'trim' | 'sell'

/** One label/value pair in the stock evidence-at-review grid. */
function SnapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  )
}

export function MarkReviewedModal({
  open, onClose, securityId, securitySymbol, currentCadence, mode, isFund = false,
  security, lastEarnings, nextEarnings,
}: MarkReviewedModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [cadence, setCadence] = useState<ReviewCadence>(currentCadence)
  const [reviewDate, setReviewDate] = useState(toDateInputValue(new Date()))
  const [nextReviewOverride, setNextReviewOverride] = useState('')
  const [notes, setNotes] = useState('')
  // Stock-specific decision state
  const [recommendation, setRecommendation] = useState<Recommendation | ''>('')
  const [conviction, setConviction] = useState<Conviction | ''>('')
  // Fund-specific outcome state
  const [fundMainOutcome, setFundMainOutcome] = useState<FundMainOutcome | null>(null)
  const [fundAtRisk, setFundAtRisk] = useState(false)
  const [fundProposeAction, setFundProposeAction] = useState<ProposeAction | null>(null)

  // Reset fields when modal opens
  useEffect(() => {
    if (open) {
      setCadence(currentCadence)
      setReviewDate(toDateInputValue(new Date()))
      setNotes('')
      setRecommendation('')
      setConviction('')
      setFundMainOutcome(null)
      setFundAtRisk(false)
      setFundProposeAction(null)
      const cadenceMonths = CADENCE_OPTIONS.find((o) => o.value === currentCadence)?.months ?? 3
      setNextReviewOverride(toDateInputValue(addMonths(new Date(), cadenceMonths)))
    }
  }, [open, currentCadence])

  // Keep next review in sync with cadence changes (schedule mode)
  useEffect(() => {
    if (mode === 'schedule') {
      const cadenceMonths = CADENCE_OPTIONS.find((o) => o.value === cadence)?.months ?? 3
      setNextReviewOverride(toDateInputValue(addMonths(new Date(), cadenceMonths)))
    }
  }, [cadence, mode])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) d.showModal(); else d.close()
  }, [open])

  // Stock (non-fund) review dates, all earnings-driven:
  //   Review Date    = last earnings + 1 day (system-scheduled, not editable)
  //   Date Reviewed  = today (when this review is being logged)
  //   Next Review    = next earnings + 1 day
  const scheduledReviewDate = earningsPlusDays(lastEarnings, 1)
  const dateReviewed = new Date()
  const stockNextReview = earningsPlusDays(nextEarnings, 1)

  // Stock evidence — fetched on-demand (dedupes with the detail page's queries),
  // shown in the modal and frozen into the review for audit defense.
  const snapshotEnabled = open && mode === 'review' && !isFund
  const { data: scorecard } = useQuery({
    queryKey: QUERY_KEYS.scorecardMetrics(securityId),
    queryFn: () => fetchScorecardMetrics(securityId),
    enabled: snapshotEnabled,
  })
  const { data: analyst } = useQuery({
    queryKey: QUERY_KEYS.analystData(securityId),
    queryFn: () => fetchAnalystData(securityId),
    enabled: snapshotEnabled,
  })
  const { data: quote } = useQuery({
    queryKey: QUERY_KEYS.quote(securityId),
    queryFn: () => fetchQuote(securityId),
    enabled: snapshotEnabled,
  })

  // Fund evidence — benchmark index names for the PDF header (dedupe with the
  // embedded FundMonitoringPanel's queries via shared keys).
  const fundSnapEnabled = open && mode === 'review' && isFund && !!security
  const { data: categoryBenchmark } = useQuery({
    queryKey: QUERY_KEYS.categoryBenchmark(security?.ycharts_benchmark_category ?? ''),
    queryFn: () => fetchCategoryBenchmark(security!.ycharts_benchmark_category!),
    enabled: fundSnapEnabled && !!security?.ycharts_benchmark_category,
  })
  const { data: peerGroupBenchmark } = useQuery({
    queryKey: QUERY_KEYS.peerGroupBenchmark(security?.peer_group_name ?? ''),
    queryFn: () => fetchPeerGroupBenchmark(security!.peer_group_name!),
    enabled: fundSnapEnabled && !!security?.peer_group_name,
  })

  function buildSnapshot(): ReviewMetricsSnapshot {
    return {
      capturedAt: new Date().toISOString(),
      price: quote?.price ?? null,
      scorecard: {
        operatingMargin: scorecard?.operatingMargin ?? null,
        fcfMargin: scorecard?.fcfMargin ?? null,
        revGrowthTtm: scorecard?.revGrowthTtm ?? null,
        epsGrowthTtm: scorecard?.epsGrowthTtm ?? null,
        revCagr3y: scorecard?.revCagr3y ?? null,
        epsCagr3y: scorecard?.epsCagr3y ?? null,
      },
      analyst: {
        consensus: analyst?.grades?.consensus ?? null,
        targetConsensus: analyst?.priceTarget?.targetConsensus ?? null,
        numberOfAnalysts: analyst?.priceTarget?.numberOfAnalysts ?? null,
        strongBuy: analyst?.grades?.strongBuy ?? null,
        buy: analyst?.grades?.buy ?? null,
        hold: analyst?.grades?.hold ?? null,
        sell: analyst?.grades?.sell ?? null,
        strongSell: analyst?.grades?.strongSell ?? null,
      },
    }
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reviewSchedules })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reviewSchedule(securityId) })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reviewLog(securityId) })
  }

  const scheduleMutation = useMutation({
    mutationFn: () => upsertReviewSchedule(securityId, cadence, new Date(nextReviewOverride + 'T00:00:00')),
    onSuccess: () => { invalidateAll(); onClose() },
  })

  function resolveFundOutcome(): ReviewOutcome {
    if (fundMainOutcome === 'propose') return 'flagged_for_action'
    if (fundMainOutcome === 'maintain') return 'no_issues'
    return 'placed_on_watchlist'
  }

  function resolveFundNotes(): string {
    if (fundMainOutcome === 'propose' && fundProposeAction) {
      const prefix = fundProposeAction.charAt(0).toUpperCase() + fundProposeAction.slice(1)
      return notes.trim() ? `[${prefix}] ${notes}` : `[${prefix}]`
    }
    return notes
  }

  /** Human-readable outcome summary for the evidence PDF (e.g. "Propose (Trim) · At-Risk"). */
  function fundOutcomeLabel(): string {
    const parts: string[] = []
    if (fundMainOutcome === 'propose') {
      parts.push(fundProposeAction
        ? `Propose (${fundProposeAction.charAt(0).toUpperCase() + fundProposeAction.slice(1)})`
        : OUTCOME_LABELS.flagged_for_action)
    } else if (fundMainOutcome === 'maintain') {
      parts.push(OUTCOME_LABELS.no_issues)
    }
    if (fundAtRisk) parts.push(OUTCOME_LABELS.placed_on_watchlist)
    return parts.join(' · ') || EMPTY
  }

  /**
   * Build the fund review-evidence PDF and upload it to the Security Documents
   * bucket. Returns the stored path (folder/filename). Throws on failure so the
   * review is not recorded without its evidence (upload + record are atomic).
   */
  async function uploadFundEvidence(reviewedOn: Date): Promise<string | null> {
    if (!isFund || !security) return null
    const { blob, filename } = buildFundReviewPdf({
      security,
      ticker: securitySymbol,
      fundName: security.security_name ?? null,
      reviewDate: reviewedOn,
      outcomeLabel: fundOutcomeLabel(),
      notes: resolveFundNotes(),
      categoryBenchmark: categoryBenchmark ?? null,
      peerGroupBenchmark: peerGroupBenchmark ?? null,
    })
    const file = new File([blob], filename, { type: 'application/pdf' })
    await uploadFile(securitySymbol, file, SECURITY_DOCS_BUCKET)
    return `${securitySymbol}/${filename}`
  }

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const fundReviewedAt = new Date(reviewDate + 'T00:00:00')
      // Funds: freeze the scorecard evidence to a PDF in the docs bucket first;
      // if that fails, abort so we never record a review without its evidence.
      let evidenceDocPath: string | null = null
      if (isFund) {
        try {
          evidenceDocPath = await uploadFundEvidence(fundReviewedAt)
        } catch (e) {
          throw new Error(
            isServerUnreachable(e)
              ? 'Evidence PDF could not be saved — the Express file server is unreachable (cd server && npm run dev). Review not recorded.'
              : `Evidence PDF upload failed: ${e instanceof Error ? e.message : 'unknown error'}. Review not recorded.`,
          )
        }
      }
      await markReviewed({
        securityId,
        cadence: isFund ? 'quarterly' : cadence,
        notes: isFund ? resolveFundNotes() : notes,
        // Funds: keep editable review date + cadence-based next review.
        // Stocks: completion = today, scheduled = last earnings + 1, next = next earnings + 1.
        reviewedAt: isFund ? fundReviewedAt : dateReviewed,
        reviewDate: isFund ? null : scheduledReviewDate,
        nextReviewAt: isFund ? null : stockNextReview,
        ipsSuitable: null,
        reviewedBy: null,
        // Funds keep the process outcome; stocks carry an investment recommendation + frozen evidence.
        outcome: isFund ? resolveFundOutcome() : null,
        recommendation: isFund ? null : (recommendation as Recommendation),
        conviction: isFund ? null : (conviction || null),
        priceAtReview: isFund ? null : (quote?.price ?? null),
        metricsSnapshot: isFund ? null : buildSnapshot(),
        evidenceDocPath,
      })
      if (isFund && fundAtRisk) {
        await addToAtRisk(securityId, [], notes.trim() || null)
      }
    },
    onSuccess: () => {
      invalidateAll()
      if (isFund) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.documentsFiles(SECURITY_DOCS_BUCKET) })
      }
      if (isFund && fundAtRisk) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRisk })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRiskBySecurity(securityId) })
      }
      onClose()
    },
  })

  const activeMutation = mode === 'schedule' ? scheduleMutation : reviewMutation
  const isPending = activeMutation.isPending

  const handleClose = () => {
    if (!isPending) { onClose(); activeMutation.reset() }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    activeMutation.mutate()
  }

  // Fund outcome is ready when at least one selection is made, propose action is chosen if propose selected, and notes filled if propose selected
  const fundOutcomeReady = (fundMainOutcome !== null || fundAtRisk) &&
    (fundMainOutcome !== 'propose' || fundProposeAction !== null) &&
    (fundMainOutcome !== 'propose' || notes.trim() !== '')
  // Review mode is submittable only when required fields are filled.
  // Stocks require a recommendation and a written rationale.
  const stockReviewReady = !!recommendation && notes.trim() !== ''
  const reviewReady = mode !== 'review' || (!!reviewDate && (isFund ? fundOutcomeReady : stockReviewReady))
  const scheduleReady = mode !== 'schedule' || !!nextReviewOverride

  return (
    <dialog ref={dialogRef} onCancel={handleClose}
      className={`w-full rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30 ${
        mode === 'review' && isFund ? 'max-w-3xl' : 'max-w-md'
      }`}>
      <form onSubmit={handleSubmit} className="p-6">

        {/* Header */}
        <h2 className="text-lg font-semibold text-gray-900">
          {mode === 'schedule' ? 'Set Review Schedule' : 'Mark as Reviewed'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {mode === 'schedule'
            ? `${securitySymbol} — configure the review cadence and next review date.`
            : `${securitySymbol} — log a completed review and advance the schedule.`}
        </p>

        <div className="mt-4 space-y-4">

          {/* Review date — review mode only */}
          {mode === 'review' && (
            isFund ? (
              <div>
                <label className="block text-sm font-medium text-gray-700">Review Date</label>
                <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {new Date(reviewDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            ) : (
              <>
                {/* Review Date — system-scheduled (last earnings + 1 day), read-only */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Review Date</label>
                  <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                    {fmtLongDate(scheduledReviewDate)}
                  </p>
                </div>
                {/* Date Reviewed — when this review is being logged (today), read-only */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date Reviewed</label>
                  <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                    {fmtLongDate(dateReviewed)}
                  </p>
                </div>
              </>
            )
          )}

          {/* Cadence — schedule mode only (cadence is otherwise set by the model portfolio) */}
          {mode === 'schedule' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Review Cadence</label>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as ReviewCadence)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                {CADENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Evidence block — funds/ETFs. The on-page Category/Peer group monitoring
              block, frozen into the uploaded PDF as evidence at the review date. */}
          {mode === 'review' && isFund && security && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Evidence at review <span className="font-normal text-gray-400">(saved to Documents as a PDF)</span>
              </label>
              <div className="mt-2 max-h-[22rem] overflow-y-auto rounded-md border border-gray-200 bg-gray-50/60 p-3">
                <FundMonitoringPanel security={security} showCohortReference />
              </div>
            </div>
          )}

          {/* Next review date — schedule mode: editable */}
          {mode === 'schedule' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Next Review Date</label>
              <input
                type="date"
                value={nextReviewOverride}
                onChange={(e) => setNextReviewOverride(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          )}

          {/* Next review display — review mode, non-fund: next earnings + 1 day, read-only */}
          {mode === 'review' && !isFund && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs font-medium text-gray-500">Next review will be set to</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                {fmtLongDate(stockNextReview)}
              </p>
            </div>
          )}

          {/* Evidence snapshot — stocks only. Frozen into the review on submit. */}
          {mode === 'review' && !isFund && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Evidence at review
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <SnapRow label="Price" value={fmtUsd(quote?.price ?? null)} />
                <SnapRow
                  label="Analyst consensus"
                  value={analyst?.grades?.consensus ?? EMPTY}
                />
                <SnapRow label="Op. margin TTM" value={fmtDecimalPct(scorecard?.operatingMargin ?? null)} />
                <SnapRow label="FCF margin TTM" value={fmtDecimalPct(scorecard?.fcfMargin ?? null)} />
                <SnapRow label="Rev growth TTM" value={fmtDecimalPct(scorecard?.revGrowthTtm ?? null)} />
                <SnapRow label="EPS growth TTM" value={fmtDecimalPct(scorecard?.epsGrowthTtm ?? null)} />
                <SnapRow label="Rev CAGR 3Y" value={fmtDecimalPct(scorecard?.revCagr3y ?? null)} />
                <SnapRow label="EPS CAGR 3Y" value={fmtDecimalPct(scorecard?.epsCagr3y ?? null)} />
                <SnapRow
                  label="Price target"
                  value={fmtUsd(analyst?.priceTarget?.targetConsensus ?? null)}
                />
              </div>
            </div>
          )}

          {/* ── Review-only fields ── */}
          {mode === 'review' && (
            <>
              {/* Outcome (funds) / Recommendation (stocks) — required */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {isFund ? 'Outcome' : 'Recommendation'} <span className="text-red-500">*</span>
                </label>
                {isFund ? (
                  <div className="mt-2 space-y-2">
                    {/* Primary: Maintain / Propose (mutually exclusive) + At-Risk (combinable) */}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setFundMainOutcome(fundMainOutcome === 'maintain' ? null : 'maintain')}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                          fundMainOutcome === 'maintain'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Maintain
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = fundMainOutcome === 'propose' ? null : 'propose'
                          setFundMainOutcome(next)
                          if (next === null) setFundProposeAction(null)
                        }}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                          fundMainOutcome === 'propose'
                            ? 'border-amber-400 bg-amber-50 text-amber-700'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Propose
                      </button>
                      <button
                        type="button"
                        onClick={() => setFundAtRisk(!fundAtRisk)}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                          fundAtRisk
                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        At-Risk
                      </button>
                    </div>

                    {/* Propose sub-actions: Add / Trim / Sell */}
                    {fundMainOutcome === 'propose' && (
                      <div className="flex gap-2">
                        {(['add', 'trim', 'sell'] as ProposeAction[]).map((action) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => setFundProposeAction(fundProposeAction === action ? null : action)}
                            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                              fundProposeAction === action
                                ? 'border-amber-400 bg-amber-50 text-amber-700'
                                : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {action.charAt(0).toUpperCase() + action.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {/* Buy / Add / Hold / Trim / Sell */}
                    <div className="flex gap-2">
                      {RECOMMENDATION_OPTIONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRecommendation(recommendation === r ? '' : r)}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors ${
                            recommendation === r
                              ? RECOMMENDATION_COLORS[r].replace('bg-', 'border-current bg-')
                              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {RECOMMENDATION_LABELS[r]}
                        </button>
                      ))}
                    </div>
                    {/* Conviction — optional */}
                    <div className="flex gap-2">
                      {CONVICTION_OPTIONS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setConviction(conviction === c ? '' : c)}
                          className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                            conviction === c
                              ? 'border-gray-700 bg-gray-800 text-white'
                              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {CONVICTION_LABELS[c]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes (funds) / Rationale (stocks). Required for stocks and for fund Propose. */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {isFund ? 'Notes' : 'Rationale'}{' '}
                  {!isFund || (isFund && fundMainOutcome === 'propose')
                    ? <span className="text-red-500">*</span>
                    : <span className="text-gray-400">(optional)</span>
                  }
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={isFund
                    ? 'Key findings, decisions made, follow-up items…'
                    : 'Thesis, valuation, catalysts/risks — why this Buy/Hold/Sell call.'}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
            </>
          )}
        </div>

        {activeMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {activeMutation.error instanceof Error ? activeMutation.error.message : 'Failed to save'}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={handleClose} disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit"
            disabled={isPending || !reviewReady || !scheduleReady}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {isPending
              ? 'Saving…'
              : mode === 'schedule' ? 'Save Schedule' : 'Mark as Reviewed'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
