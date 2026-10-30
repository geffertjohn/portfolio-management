import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import {
  fetchRelatedSecurities,
  isFundOrEtfSecurity,
  refreshSecurityFromFMP,
  setScorecardCohort,
} from '@/lib/securities'
import type { ScorecardCohort } from '@/lib/fundScorecard'
import { fetchAtRiskBySecurity } from '@/lib/atRisk'
import { RemoveFromAtRiskModal } from '@/components/RemoveFromAtRiskModal'
import { FundHeaderMetricsRow } from '@/components/FundHeaderMetricsRow'
import { DetailPageState } from '@/components/DetailPageState'
import { FundMonitoringPanel } from '@/components/FundMonitoringPanel'
import { StockScorecardPanels } from '@/components/StockScorecardPanels'
import { AlternativesPanel } from '@/components/AlternativesPanel'
import { CreateActionItemModal } from '@/components/CreateActionItemModal'
import { MarkReviewedModal } from '@/components/MarkReviewedModal'
import { ReviewLogSection } from '@/components/ReviewLogSection'
import { fetchReviewScheduleBySecurity, isOverdue, isDueSoon } from '@/lib/reviewSchedules'
import { fetchPortfoliosHoldingSecurity } from '@/lib/positions'
import { useSecurityDetail } from '@/hooks/useSecurityDetail'
import { useSecurityBackLink } from '@/hooks/useSecurityBackLink'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fetchEarningsDates, fetchProfile, fetchQuote } from '@/lib/fmpMarket'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { fmtUsd, EMPTY } from '@/lib/formatters'
import { fetchAnalystData } from '@/lib/fmpAnalyst'
import { FinancialsSection } from '@/components/FinancialsSection'
import { DocumentsFolderPanel } from '@/components/DocumentsFolderPanel'
import { SecurityResearchPanel } from '@/components/SecurityResearchPanel'
import { TipRanksPanel } from '@/components/TipRanksPanel'
import { SECURITY_DOCS_BUCKET } from '@/lib/documents'
import { SecurityThesisPanel } from '@/components/SecurityThesisPanel'

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
  const [addActionOpen, setAddActionOpen] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'monitor' | 'commentary'>('overview')
  const [financialsOpen, setFinancialsOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: security, isLoading, error } = useSecurityDetail(id)

  const isStock = security ? !isFundOrEtfSecurity(security) : false
  // Transcripts and call summaries are now per-quarter inside the Commentary
  // timeline, which fetches the one call it is asked to open. The page no longer
  // pulls the latest transcript up front — eight quarters of them is tens of
  // thousands of words, and the advisor opens one.

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

  // Write-through: the cross-security lists (Review Calendar, review schedules)
  // read the STORED earnings dates and cannot fetch per row, so persist what we
  // just fetched live whenever it differs. Fire-and-forget — a failed write must
  // never disturb the page.
  useEffect(() => {
    if (!isStock || !security?.security_id || !earningsDates) return
    const stale =
      earningsDates.lastEarnings !== security.last_earnings_release ||
      earningsDates.nextEarnings !== security.next_earnings_release
    if (stale) void refreshSecurityFromFMP(security.security_id).catch(() => {})
  }, [isStock, security?.security_id, security?.last_earnings_release, security?.next_earnings_release, earningsDates])
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
  // Price in the header. This is the only place the stock page shows a price:
  // the Analysts card that used to carry it was removed from Overview (Oct 2026).
  // Same seam as everywhere else — TanStack owns the REST baseline, quoteStream
  // owns the live last-trade leg, and the REST value stands in until the first
  // tick (or indefinitely when the socket is down). `useLiveQuote` takes null to
  // subscribe to nothing, which is how funds opt out: FMP does not stream them.
  const { data: quote } = useQuery({
    queryKey: QUERY_KEYS.quote(security?.security_id ?? ''),
    queryFn: () => fetchQuote(security!.security_id),
    enabled: isStock && !!security?.security_id,
    staleTime: 1000 * 60,
    retry: false,
  })
  const live = useLiveQuote(isStock ? security?.security_id : null)
  const price = live?.price ?? quote?.price ?? null

  const companyName = (isStock ? profile?.companyName : null) ?? security?.security_name ?? null
  const description = (isStock ? profile?.description : null) ?? security?.long_description ?? null
  const sector = (isStock ? profile?.sector : null) ?? security?.morningstar_sector ?? null
  const industry = (isStock ? profile?.industry : null) ?? security?.morningstar_industry ?? null

  // The cohort a fund is REVIEWED against. Deliberately separate from the
  // Category / Peer group tabs below it: those switch what you are looking at,
  // and the whole point is to be able to read both without changing which one
  // the review judges the fund by.
  const cohortMutation = useMutation({
    mutationFn: (cohort: ScorecardCohort) => setScorecardCohort(id, cohort),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: QUERY_KEYS.security(id) }) },
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

  // Clearing a flag needs a recorded reason, so the badge opens the modal
  // rather than removing on click.
  const [removeAtRiskOpen, setRemoveAtRiskOpen] = useState(false)

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
                  onClick={() => setRemoveAtRiskOpen(true)}
                  className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
                  title="Click to remove from the at-risk list"
                >
                  At-Risk
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
              {/* Review is the header's primary action for BOTH asset types now
                  (Oct 2026) — it used to sit on the stock Monitor tab's scorecard
                  card, which hid the one thing the page exists to do behind a tab.
                  Still gated on a schedule: no schedule, nothing to record against. */}
              {reviewSchedule && (
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(true)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Review
                </button>
              )}

              {/* "+ Watchlist" and "Flag at-risk" were removed from this header
                  (Oct 2026). The watchlist capability is not lost — /watchlist
                  opens AddProspectModal, which picks its own ticker. Flagging
                  at-risk is no longer a manual act anywhere: the at-risk-review
                  job owns that list, and AddToAtRiskModal was deleted with it.
                  The advisor's remaining act is an override removal, which the
                  At-Risk badge above still offers and which requires a reason. */}
              {isStock && (
                <button
                  type="button"
                  onClick={() => setAddActionOpen(true)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  title="Create a follow-up action for this security"
                >
                  + Action
                </button>
              )}

            </div>

            <p className="text-xs text-gray-400">
              Last updated {security.updated_at ? new Date(security.updated_at).toLocaleDateString() : '—'}
            </p>
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
                isFundOrEtfSecurity(security) ? 'grid-cols-3' : 'grid-cols-6'
              }`}
            >
              {isFundOrEtfSecurity(security) ? (
                <FundHeaderMetricsRow
                  msCategory={security.category_name ?? null}
                  category={security.ycharts_benchmark_category ?? null}
                  peerGroupName={security.peer_group_name ?? null}
                />
              ) : (
                <>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Price
                      {live != null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-600">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                          Live
                        </span>
                      )}
                    </dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums text-gray-900">
                      {price != null ? fmtUsd(price) : EMPTY}
                    </dd>
                  </div>
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

          {/* Review cohort — the stored setting, not the view tabs. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Cohort</span>
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-100 p-0.5 text-xs font-medium">
              {([['category', 'Category'], ['peer', 'Peer group']] as [ScorecardCohort, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={cohortMutation.isPending || security.scorecard_cohort === value}
                  onClick={() => cohortMutation.mutate(value)}
                  className={`rounded px-3 py-1 transition-colors disabled:cursor-default ${
                    security.scorecard_cohort === value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {security.scorecard_cohort == null && (
              <span className="text-xs text-amber-700">
                Not set — reviews can&rsquo;t be automated for this fund until a cohort is chosen
              </span>
            )}
            {cohortMutation.isError && (
              <span className="text-xs text-red-600">Could not save — try again</span>
            )}
          </div>

          <div className="mt-6 space-y-6">
            {(getBroadAssetClass(security) === 'equity' ||
              getBroadAssetClass(security) === 'fixed income') && (
              <FundMonitoringPanel security={security} />
            )}
          </div>
        </div>
      )}

      {/* ── Fund/ETF: Thesis (unchanged) ────────────────────────────────────── */}
      {isFundOrEtfSecurity(security) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Review</h2>
          <div className="mt-6 space-y-6">
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
            {(['overview', 'monitor', 'commentary'] as const).map((tab) => (
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
      {/*
        Overview is the ownership case: what the street thinks, then what we
        think. The Scorecard, Total Performance, News, Alerts and the review
        schedule/history were removed here (Oct 2026) and live on Monitor, so
        this tab is not a second copy of them.
        The price those cards used to carry now lives in the header's metrics row.
        Funds are untouched and keep their own layout above.
      */}
      {!isFundOrEtfSecurity(security) && activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Whole-street coverage, weighted by analyst track record. Sits ABOVE
              the thesis deliberately: the outside view is context for our own,
              and reading it second invites anchoring on it. */}
          <TipRanksPanel securityId={security.security_id} />
          {/* The thesis is its own document of record (append-only, PDF per version). */}
          <SecurityThesisPanel ticker={security.security_id} securityName={security.security_name} />
        </div>
      )}
      {/* ── Stock: Monitor tab ──────────────────────────────────────────────── */}
      {!isFundOrEtfSecurity(security) && activeTab === 'monitor' && (
        <div className="space-y-6">

          {/* Scorecard — TODO: wire to captured metrics from most recent review */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Scorecard</h2>
            <div className="mt-6">
              <StockScorecardPanels security={security} />
            </div>
          </div>

          {/* Alternatives comparison tables */}
          <AlternativesPanel security={security} />

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

      {/* ── Stock: Commentary tab ───────────────────────────────────────────── */}
      {/*
        Everything said ABOUT the security. Renamed from "Documents" (Oct 2026)
        when the briefs and transcripts moved here off Monitor — Monitor is the
        measurement surface (scorecard, alternatives, financials) and this is the
        narrative one.

        The separate Transcripts block is gone (Oct 2026). It could only ever
        show the LATEST call, so the moment a brief was more than a quarter old
        the evidence behind it was unreachable from this page. Every document
        written around a call — both briefs, the committee's summary, the
        transcript — now sits on that call's own row in one table, and the call
        is still read before our conclusions: the summary leads the modal the
        transcript opens in.
      */}
      {!isFundOrEtfSecurity(security) && activeTab === 'commentary' && (
        <div className="space-y-6">

          {/* The commentary record: standing research, then eight quarters of
              briefs, call summaries and transcripts as one table. The latest-only
              Transcripts block that used to lead this tab is folded in — every
              quarter's call is now reachable, not just the most recent. */}
          <SecurityResearchPanel
            securityId={security.security_id}
            companyName={companyName}
            lastEarningsDate={lastEarnings}
            nextEarningsDate={nextEarnings}
          />

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <DocumentsFolderPanel
              bucket={SECURITY_DOCS_BUCKET}
              folder={security.security_id}
              scopeLabel={security.security_id}
              emptyHint="Upload research notes, filings, and other files for this security here."
            />
          </div>

        </div>
      )}

      {removeAtRiskOpen && activeAtRiskEntry && (
        <RemoveFromAtRiskModal
          entryId={activeAtRiskEntry.id}
          symbol={security.security_id}
          metrics={activeAtRiskEntry.metrics_detail}
          onClose={() => setRemoveAtRiskOpen(false)}
        />
      )}

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
