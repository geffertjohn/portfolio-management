import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import {
  fetchRelatedSecurities,
  getThesisText,
  isFundOrEtfSecurity,
  updateSecurityThesis,
} from '@/lib/securities'
import {
  addToAtRisk,
  fetchAtRiskBySecurity,
  removeFromAtRisk,
} from '@/lib/atRisk'
import { FundHeaderMetricsRow } from '@/components/FundHeaderMetricsRow'
import { DetailPageState } from '@/components/DetailPageState'
import { StockReturnTable } from '@/components/StockReturnTable'
import { FundReturnTable } from '@/components/FundReturnTable'
import { FundComparisonPanel } from '@/components/FundComparisonPanel'
import { FundMonitoringPanel } from '@/components/FundMonitoringPanel'
import { StockScorecardPanels } from '@/components/StockScorecardPanels'
import { AnalystCoveragePanel } from '@/components/AnalystCoveragePanel'
import { AlternativesPanel } from '@/components/AlternativesPanel'
import { NewsAlertsPanel } from '@/components/NewsAlertsPanel'
import { AtRiskModal } from '@/components/AtRiskModal'
import { AddProspectModal } from '@/components/AddProspectModal'
import { CreateActionItemModal } from '@/components/CreateActionItemModal'
import { MarkReviewedModal } from '@/components/MarkReviewedModal'
import { ReviewLogSection } from '@/components/ReviewLogSection'
import { fetchReviewScheduleBySecurity, isOverdue, isDueSoon } from '@/lib/reviewSchedules'
import { fetchPortfoliosHoldingSecurity } from '@/lib/positions'
import { useSecurityDetail } from '@/hooks/useSecurityDetail'
import { useSecurityBackLink } from '@/hooks/useSecurityBackLink'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { uploadSecurities2FromExcel } from '@/lib/securities2ExcelUpload'
import { useLatestTranscript } from '@/hooks/useTranscript'
import { fetchKeyExecutives } from '@/lib/fmpTranscripts'
import { fetchEarningsDates, fetchProfile } from '@/lib/fmpMarket'
import { fetchAnalystData } from '@/lib/fmpAnalyst'
import { FinancialsSection } from '@/components/FinancialsSection'
import { DocumentsFolderPanel } from '@/components/DocumentsFolderPanel'
import { SecurityResearchPanel } from '@/components/SecurityResearchPanel'
import { SECURITY_DOCS_BUCKET } from '@/lib/documents'
import { TranscriptViewer } from '@/components/TranscriptViewer'

/**
 * Maps the variety of YCharts/Morningstar asset class values to a canonical
 * 'equity' | 'fixed income' | null for panel routing.
 *
 * YCharts `broad_asset_class` returns 'Equity' for equity funds but returns
 * the Morningstar sub-category for bond funds (e.g. 'Taxable Bond',
 * 'Municipal Bond'). `broad_category_group` consistently returns 'Fixed Income'
 * / 'Equity'. We check both fields so every data vintage is handled correctly.
 */
function getBroadAssetClass(security: {
  broad_asset_class?: string | null
  broad_category_group?: string | null
}): 'equity' | 'fixed income' | null {
  const ac = security.broad_asset_class?.trim().toLowerCase() ?? ''
  const cg = security.broad_category_group?.trim().toLowerCase() ?? ''

  if (ac === 'equity' || ac.includes('equity')) return 'equity'
  if (cg === 'equity' || cg.includes('equity')) return 'equity'

  if (ac === 'fixed income' || cg === 'fixed income') return 'fixed income'
  // Morningstar sub-categories returned by YCharts broad_asset_class for bond funds
  const BOND_KEYS = ['bond', 'income', 'credit', 'inflation', 'ultrashort', 'duration', 'maturity']
  if (BOND_KEYS.some((k) => ac.includes(k))) return 'fixed income'
  if (BOND_KEYS.some((k) => cg.includes(k))) return 'fixed income'

  return null
}

export function SecurityDetailPage() {
  const { securityId } = useParams<{ securityId: string }>()
  const backLink = useSecurityBackLink()
  const id = securityId ? parseInt(securityId, 10) : NaN
  const [thesisDraft, setThesisDraft] = useState('')
  const [thesisSavedFlash, setThesisSavedFlash] = useState(false)
  const [atRiskModalOpen, setAtRiskModalOpen] = useState(false)
  const [prospectModalOpen, setProspectModalOpen] = useState(false)
  const [addActionOpen, setAddActionOpen] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'monitor' | 'documents'>('overview')
  const [financialsOpen, setFinancialsOpen] = useState(false)
  const [excelStatus, setExcelStatus] = useState<{ text: string; ok: boolean } | null>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: security, isLoading, error } = useSecurityDetail(id)

  // Only fetch for stocks — funds/ETFs don't have earnings transcripts
  const isStock = security ? !isFundOrEtfSecurity(security) : false
  const { data: transcript, isLoading: transcriptLoading } = useLatestTranscript(
    isStock ? (security?.security_id ?? null) : null
  )
  const { data: executives } = useQuery({
    queryKey: QUERY_KEYS.keyExecutives(security?.security_id ?? ''),
    queryFn: () => fetchKeyExecutives(security!.security_id),
    enabled: isStock && !!security?.security_id,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours — executive list changes rarely
    retry: false,
  })

  const { data: reviewSchedule } = useQuery({
    queryKey: QUERY_KEYS.reviewSchedule(security?.security_id ?? ''),
    queryFn: () => fetchReviewScheduleBySecurity(security!.security_id),
    enabled: !!security?.security_id,
  })

  // Earnings dates & analyst consensus — fetched live from FMP for stocks
  const { data: earningsDates } = useQuery({
    queryKey: QUERY_KEYS.earningsDates(security?.security_id ?? ''),
    queryFn: () => fetchEarningsDates(security!.security_id),
    enabled: isStock && !!security?.security_id,
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const { data: analystData } = useQuery({
    queryKey: QUERY_KEYS.analystData(security?.security_id ?? ''),
    queryFn: () => fetchAnalystData(security!.security_id),
    enabled: isStock && !!security?.security_id,
    staleTime: 1000 * 60 * 60,
    retry: false,
  })
  const lastEarnings = isStock ? (earningsDates?.lastEarnings ?? null) : (security?.last_earnings_release ?? null)
  const nextEarnings = isStock ? (earningsDates?.nextEarnings ?? null) : (security?.next_earnings_release ?? null)
  const consensusLabel = analystData?.grades?.consensus ?? null

  // Company identity — live from FMP /profile for stocks (so new positions aren't
  // blank); falls back to the stored securities2 value (used by funds, and while loading).
  const { data: profile } = useQuery({
    queryKey: QUERY_KEYS.profile(security?.security_id ?? ''),
    queryFn: () => fetchProfile(security!.security_id),
    enabled: isStock && !!security?.security_id,
    staleTime: 1000 * 60 * 60 * 24, // identity changes rarely
    retry: false,
  })
  const companyName = (isStock ? profile?.companyName : null) ?? security?.security_name ?? null
  const description = (isStock ? profile?.description : null) ?? security?.long_description ?? null
  const sector = (isStock ? profile?.sector : null) ?? security?.morningstar_sector ?? null
  const industry = (isStock ? profile?.industry : null) ?? security?.morningstar_industry ?? null

  useEffect(() => {
    if (!security) return
    setThesisDraft(getThesisText(security))
  }, [security])

  const thesisMutation = useMutation({
    mutationFn: () => updateSecurityThesis(id, thesisDraft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.security(id) })
      setThesisSavedFlash(true)
      window.setTimeout(() => setThesisSavedFlash(false), 2500)
    },
  })

  const { data: portfoliosHolding = [] } = useQuery({
    queryKey: QUERY_KEYS.portfoliosHoldingSecurity(security?.security_id ?? ''),
    queryFn: () => fetchPortfoliosHoldingSecurity(security!.security_id),
    enabled: !!security?.security_id,
  })

  // Funds source their header "Related" tags from the Excel-uploaded
  // security_related_securities table. Stocks instead show the alternatives
  // (alt_1/2/3) entered on the Monitor tab — so this query is fund-only.
  const { data: relatedSecurities = [] } = useQuery({
    queryKey: QUERY_KEYS.relatedSecurities(security?.security_id ?? ''),
    queryFn: () => fetchRelatedSecurities(security!.security_id),
    enabled: !!security?.security_id && !isStock,
  })

  // Stock "Related" = the Monitor-tab alternatives, live from securities2.
  const altTickers = isStock && security
    ? [security.alt_1, security.alt_2, security.alt_3].filter(
        (t): t is string => typeof t === 'string' && t.trim() !== '',
      )
    : []

  const { data: atRiskEntries = [] } = useQuery({
    queryKey: QUERY_KEYS.atRiskBySecurity(security?.security_id ?? ''),
    queryFn: () => fetchAtRiskBySecurity(security!.security_id),
    enabled: !!security?.security_id,
  })
  const isAtRisk = atRiskEntries.length > 0
  const activeAtRiskEntry = atRiskEntries[0] ?? null

  const addAtRiskMutation = useMutation({
    mutationFn: ({ metrics, notes }: { metrics: string[]; notes: string }) =>
      addToAtRisk(security!.security_id, metrics, notes || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRiskBySecurity(security!.security_id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRisk })
      setAtRiskModalOpen(false)
    },
  })

  const removeAtRiskMutation = useMutation({
    mutationFn: () => {
      if (!activeAtRiskEntry) throw new Error('No active at-risk entry to remove')
      return removeFromAtRisk(activeAtRiskEntry.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRiskBySecurity(security!.security_id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.atRisk })
    },
  })

  const excelUploadMutation = useMutation({
    mutationFn: (file: File) => uploadSecurities2FromExcel(security!.security_id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.security(id) })
      setExcelStatus({ text: 'Upload complete.', ok: true })
      window.setTimeout(() => setExcelStatus(null), 4000)
    },
    onError: (err) => {
      setExcelStatus({ text: err instanceof Error ? err.message : 'Upload failed.', ok: false })
    },
  })

  const invalidId = Number.isNaN(id) || !Number.isInteger(id) || id <= 0
  if (invalidId || isLoading || error || !security) {
    return (
      <DetailPageState
        backTo={backLink.to}
        backLabel={backLink.label}
        invalid={invalidId}
        invalidText="Invalid security."
        loading={isLoading}
        error={error}
        notFound={!security}
        errorTitle="Failed to load security"
        notFoundText="Security not found."
      />
    )
  }

  return (
    <div className="space-y-6">
      <Link to={backLink.to} className="inline-block text-sm text-gray-600 hover:text-gray-900">
        {backLink.label}
      </Link>

      {/* ── Header card ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
                {security.security_id}
              </h1>
              {isAtRisk && (
                <button
                  type="button"
                  onClick={() => removeAtRiskMutation.mutate()}
                  disabled={removeAtRiskMutation.isPending}
                  className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                  title="Click to remove from at-risk list"
                >
                  {removeAtRiskMutation.isPending ? 'Removing…' : 'At-Risk'}
                </button>
              )}
              {reviewSchedule && isOverdue(reviewSchedule.next_review_at) && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  Review Overdue
                </span>
              )}
              {reviewSchedule &&
                !isOverdue(reviewSchedule.next_review_at) &&
                isDueSoon(reviewSchedule.next_review_at) && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    Review Due Soon
                  </span>
                )}
            </div>
            {companyName && <p className="text-base text-gray-600">{companyName}</p>}
            {portfoliosHolding.length > 0 && (
              <p className="text-xs text-gray-400">
                {(() => {
                  const labels = [...new Set(
                    portfoliosHolding.map((p) => {
                      const s = p.portfolioStrategy?.toLowerCase() ?? ''
                      return s === 'hybrid'
                        ? p.portfolioStrategy!
                        : p.portfolioName
                    })
                  )]
                  return labels.join(' · ')
                })()}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap gap-2">
              {isFundOrEtfSecurity(security) && reviewSchedule && (
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(true)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Review
                </button>
              )}

              <button
                type="button"
                onClick={() => setProspectModalOpen(true)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                title="Add to the buy-candidate watchlist"
              >
                + Watchlist
              </button>

              <button
                type="button"
                onClick={() => setAddActionOpen(true)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                title="Create a follow-up action for this security"
              >
                + Action
              </button>

              {!isAtRisk && (
                <button
                  type="button"
                  onClick={() => setAtRiskModalOpen(true)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Flag at-risk
                </button>
              )}

            </div>

            {/* Excel fallback — stocks only */}
            {!isFundOrEtfSecurity(security) && (
              <>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) excelUploadMutation.mutate(file)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => excelInputRef.current?.click()}
                  disabled={excelUploadMutation.isPending}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  {excelUploadMutation.isPending ? 'Uploading…' : 'Upload manually'}
                </button>
              </>
            )}

            <p className="text-xs text-gray-400">
              Last updated {security.updated_at ? new Date(security.updated_at).toLocaleDateString() : '—'}
            </p>
            {excelStatus && (
              <p className={`max-w-xs text-right text-xs ${excelStatus.ok ? 'text-green-600' : 'text-red-600'}`}>
                {excelStatus.text}
              </p>
            )}
          </div>
        </div>

        {description && (
          <p className="mt-2 text-sm text-gray-700">{description}</p>
        )}

        {isStock
          ? altTickers.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-gray-400">Related:</span>
                {altTickers.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 font-mono text-xs font-medium text-gray-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )
          : relatedSecurities.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-gray-400">Related:</span>
                {relatedSecurities.map((r) =>
                  r.related_numeric_id != null ? (
                    <Link
                      key={r.id}
                      to={`/security/${r.related_numeric_id}`}
                      className="rounded-full bg-gray-100 px-2.5 py-0.5 font-mono text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      {r.related_id}
                    </Link>
                  ) : (
                    <span
                      key={r.id}
                      className="rounded-full bg-gray-100 px-2.5 py-0.5 font-mono text-xs font-medium text-gray-500"
                    >
                      {r.related_id}
                    </span>
                  )
                )}
              </div>
            )}

        {/* Investment strategy — fund/ETF only */}
        {isFundOrEtfSecurity(security) && security.investment_strategy && (
          <p className="mt-3 text-sm text-gray-700">{security.investment_strategy}</p>
        )}

        {/* Identity metrics row */}
        <dl className="mt-5">
          <div className="-mx-1 overflow-x-auto px-1">
            <div
              className={`grid min-w-[36rem] gap-4 sm:min-w-0 sm:w-full ${
                isFundOrEtfSecurity(security) ? 'grid-cols-3' : 'grid-cols-5'
              }`}
            >
              {isFundOrEtfSecurity(security) ? (
                <FundHeaderMetricsRow
                  assetClass={security.broad_asset_class ?? null}
                  category={security.ycharts_benchmark_category ?? null}
                  peerGroupName={security.peer_group_name ?? null}
                />
              ) : (
                <>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Peer Group
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{security.category_name ?? security.equity_style_internal ?? security.peer_group_name ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Sector
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{sector ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Industry
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{industry ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Next Earnings
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {nextEarnings
                        ? new Date(nextEarnings + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Consensus
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{consensusLabel ?? '—'}</dd>
                  </div>
                </>
              )}
            </div>
          </div>
          {!isFundOrEtfSecurity(security) &&
            security.expense_ratio_generic != null &&
            Number.isFinite(security.expense_ratio_generic) && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Expense ratio
                </dt>
                <dd className="mt-1 text-sm text-gray-900">{security.expense_ratio_generic}%</dd>
              </div>
            )}
        </dl>
      </div>

      {/* ── Fund/ETF: Monitoring (unchanged) ───────────────────────────────── */}
      {isFundOrEtfSecurity(security) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Monitoring</h2>
          <div className="mt-6 space-y-6">
            {(getBroadAssetClass(security) === 'equity' ||
              getBroadAssetClass(security) === 'fixed income') && (
              <FundMonitoringPanel security={security} />
            )}
          </div>
        </div>
      )}

      {/* ── Fund/ETF: Total Performance (unchanged) ─────────────────────────── */}
      {isFundOrEtfSecurity(security) && (
        <FundReturnTable security={security} />
      )}

      {/* ── Fund/ETF: Alternatives comparison ───────────────────────────────── */}
      {isFundOrEtfSecurity(security) && (
        <FundComparisonPanel security={security} />
      )}

      {/* ── Fund/ETF: Thesis (unchanged) ────────────────────────────────────── */}
      {isFundOrEtfSecurity(security) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Thesis</h2>
          <div className="mt-6 space-y-6">
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Investment Thesis
              </h3>
              <div className="mt-3 space-y-3">
                <label htmlFor="security-thesis" className="sr-only">Investment thesis</label>
                <textarea
                  id="security-thesis"
                  value={thesisDraft}
                  onChange={(e) => setThesisDraft(e.target.value)}
                  rows={8}
                  placeholder="Describe the investment thesis for this fund or ETF…"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => thesisMutation.mutate()}
                    disabled={thesisMutation.isPending}
                    className="rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {thesisMutation.isPending ? 'Saving…' : 'Save thesis'}
                  </button>
                  {thesisSavedFlash && <span className="text-sm text-green-700">Saved.</span>}
                </div>
                {thesisMutation.isError && (
                  <p className="text-sm text-red-600">
                    {thesisMutation.error instanceof Error
                      ? thesisMutation.error.message
                      : 'Failed to save thesis. Check Supabase permissions (RLS).'}
                  </p>
                )}
              </div>
            </section>
            <div className="border-t border-gray-100" />
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Risks</h3>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-500">
                Content to be added.
              </div>
            </section>
            <div className="border-t border-gray-100" />
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Exit Criteria</h3>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-500">
                Content to be added.
              </div>
            </section>
            <div className="border-t border-gray-100" />
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Review Schedule</h3>
              {reviewSchedule ? (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Cadence</p>
                      <p className="mt-1 capitalize text-gray-900">{reviewSchedule.cadence.replace('_', '-')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Last Reviewed</p>
                      <p className="mt-1 text-gray-900">
                        {reviewSchedule.last_reviewed_at
                          ? new Date(reviewSchedule.last_reviewed_at).toLocaleDateString()
                          : <span className="text-gray-400">Never</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Next Review</p>
                      <p className={`mt-1 font-medium ${isOverdue(reviewSchedule.next_review_at) ? 'text-red-600' : isDueSoon(reviewSchedule.next_review_at) ? 'text-amber-600' : 'text-gray-900'}`}>
                        {new Date(reviewSchedule.next_review_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                  No review schedule set. Click "Set Schedule" to configure a review cadence.
                </div>
              )}
            </section>
            <div className="border-t border-gray-100" />
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Review History</h3>
              <ReviewLogSection securityId={security.security_id} />
            </section>
          </div>
        </div>
      )}

      {/* ── Fund/ETF: Documents (review-evidence PDFs + uploads) ─────────────── */}
      {isFundOrEtfSecurity(security) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <DocumentsFolderPanel
            bucket={SECURITY_DOCS_BUCKET}
            folder={security.security_id}
            scopeLabel={security.security_id}
            emptyHint="Review-evidence PDFs are saved here automatically when you mark a review complete."
          />
        </div>
      )}

      {/* ── Stock: Tab bar ───────────────────────────────────────────────────── */}
      {!isFundOrEtfSecurity(security) && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            {(['overview', 'monitor', 'documents'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 pb-3 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* ── Stock: Overview tab ─────────────────────────────────────────────── */}
      {!isFundOrEtfSecurity(security) && activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Scorecard */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Scorecard</h2>
            <div className="mt-6">
              <StockScorecardPanels security={security} />
            </div>
          </div>

          {/* Total Returns */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <StockReturnTable security={security} />
          </div>

          {/* Analysts (+ Alerts) | News — side by side */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            {/* Left column: Analysts then Alerts */}
            <div className="space-y-6">
              {/* Analysts */}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Analysts</h2>
                <div className="mt-6">
                  <AnalystCoveragePanel security={security} />
                </div>
              </div>

              {/* Alerts */}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Alerts</h2>
                <div className="mt-6 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-400">
                  Content to be added.
                </div>
              </div>
            </div>

            {/* News */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">News</h2>
              <NewsAlertsPanel security={security} />
            </div>
          </div>

          {/* Thesis, Risks, Exit Criteria, Review Schedule, Review History (moved from Research) */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Investment Thesis
              </h3>
              <div className="mt-3 space-y-3">
                <label htmlFor="security-thesis" className="sr-only">Investment thesis</label>
                <textarea
                  id="security-thesis"
                  value={thesisDraft}
                  onChange={(e) => setThesisDraft(e.target.value)}
                  rows={8}
                  placeholder="Describe the investment thesis for this holding…"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => thesisMutation.mutate()}
                    disabled={thesisMutation.isPending}
                    className="rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {thesisMutation.isPending ? 'Saving…' : 'Save thesis'}
                  </button>
                  {thesisSavedFlash && <span className="text-sm text-green-700">Saved.</span>}
                </div>
                {thesisMutation.isError && (
                  <p className="text-sm text-red-600">
                    {thesisMutation.error instanceof Error
                      ? thesisMutation.error.message
                      : 'Failed to save thesis. Check Supabase permissions (RLS).'}
                  </p>
                )}
              </div>
            </section>

            <div className="border-t border-gray-100" />

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Risks</h3>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-500">
                Content to be added.
              </div>
            </section>

            <div className="border-t border-gray-100" />

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Exit Criteria</h3>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-500">
                Content to be added.
              </div>
            </section>

            <div className="border-t border-gray-100" />

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Review Schedule</h3>
              {reviewSchedule ? (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Cadence</p>
                      <p className="mt-1 capitalize text-gray-900">{reviewSchedule.cadence.replace('_', '-')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Last Reviewed</p>
                      <p className="mt-1 text-gray-900">
                        {reviewSchedule.last_reviewed_at
                          ? new Date(reviewSchedule.last_reviewed_at).toLocaleDateString()
                          : <span className="text-gray-400">Never</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Next Review</p>
                      <p className={`mt-1 font-medium ${isOverdue(reviewSchedule.next_review_at) ? 'text-red-600' : isDueSoon(reviewSchedule.next_review_at) ? 'text-amber-600' : 'text-gray-900'}`}>
                        {new Date(reviewSchedule.next_review_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                  No review schedule set. Click "Set Schedule" to configure a review cadence.
                </div>
              )}
            </section>

            <div className="border-t border-gray-100" />

            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Review History</h3>
              <ReviewLogSection securityId={security.security_id} />
            </section>
          </div>
          </div>
        </div>
      )}

      {/* ── Stock: Monitor tab ──────────────────────────────────────────────── */}
      {!isFundOrEtfSecurity(security) && activeTab === 'monitor' && (
        <div className="space-y-6">

          {/* Scorecard — TODO: wire to captured metrics from most recent review */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Scorecard</h2>
              {reviewSchedule && (
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(true)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Review
                </button>
              )}
            </div>
            <div className="mt-6">
              <StockScorecardPanels security={security} />
            </div>
          </div>

          {/* Alternatives comparison tables */}
          <AlternativesPanel security={security} />

          {/* AI research reports + pre-earnings briefs */}
          <SecurityResearchPanel securityId={security.security_id} />

          {/* Transcripts (moved from Research) */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Transcripts</h2>

            {transcriptLoading && (
              <p className="text-sm text-gray-400">Loading transcript…</p>
            )}

            {!transcriptLoading && !transcript && (
              <p className="text-sm text-gray-400">No transcript available.</p>
            )}

            {!transcriptLoading && transcript && (
              <TranscriptViewer
                transcript={transcript}
                companyName={companyName}
                executives={executives ?? []}
              />
            )}
          </div>

          {/* Financials (moved from Research) */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <button
              type="button"
              onClick={() => setFinancialsOpen(o => !o)}
              className="flex w-full items-center justify-between"
            >
              <h2 className="text-base font-semibold text-gray-900">Financials</h2>
              <svg
                className={`h-4 w-4 text-gray-900 transition-transform ${financialsOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {financialsOpen && (
              <div className="mt-6">
                <FinancialsSection security={security} />
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Stock: Documents tab ────────────────────────────────────────────── */}
      {!isFundOrEtfSecurity(security) && activeTab === 'documents' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <DocumentsFolderPanel
            bucket={SECURITY_DOCS_BUCKET}
            folder={security.security_id}
            scopeLabel={security.security_id}
            emptyHint="Upload research notes, filings, and other files for this security here."
          />
        </div>
      )}

      {atRiskModalOpen && (
        <AtRiskModal
          symbol={security.security_id}
          assetClass={security.broad_asset_class}
          isFund={isFundOrEtfSecurity(security)}
          onConfirm={(metrics, notes) => addAtRiskMutation.mutate({ metrics, notes })}
          onCancel={() => setAtRiskModalOpen(false)}
          isSubmitting={addAtRiskMutation.isPending}
        />
      )}

      <AddProspectModal
        open={prospectModalOpen}
        onClose={() => setProspectModalOpen(false)}
        presetSecurityId={security.security_id}
      />

      <CreateActionItemModal
        open={addActionOpen}
        onClose={() => setAddActionOpen(false)}
        defaultSecurityId={security.security_id}
      />

      {reviewModalOpen && (
        <MarkReviewedModal
          open={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          securityId={security.security_id}
          securitySymbol={security.security_id}
          currentCadence={reviewSchedule?.cadence ?? 'quarterly'}
          mode="review"
          isFund={isFundOrEtfSecurity(security)}
          security={security}
          lastEarnings={lastEarnings}
          nextEarnings={nextEarnings}
        />
      )}
    </div>
  )
}
