import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  fetchReviewSchedules, isOverdue, isDueSoon, reviewDueDay, upcomingEarnings,
} from '@/lib/reviewSchedules'
import { fetchPortfolioReviewSchedules, CADENCE_LABELS } from '@/lib/portfolioReviews'
import { fetchActionItems } from '@/lib/actionItems'
import { fetchUnacknowledgedAlerts, acknowledgeAlert } from '@/lib/alertRules'
import { fetchActiveAtRisk } from '@/lib/atRisk'
import { fetchActiveProspects } from '@/lib/prospects'
import { fetchAllActions, bucketOf, BUCKET_LABELS, BUCKET_ORDER } from '@/lib/actions'
import { CATEGORY_LABELS, type ActionCategory } from '@/lib/actionItems'
import {
  fetchCommitteeDocs, countByGroup, producedSince, DOC_GROUP_LABELS, type DocGroup,
} from '@/lib/committeeReports'
import {
  fetchLatestJobRuns, gradeAllJobs, needsAttention, JOB_HEALTH_LABELS, fmtRunTime,
} from '@/lib/jobRuns'
import {
  fetchLatestImportRuns, ychartsAsOf, daysSince, fmtImportDate,
  missedScheduledRefresh, lastExpectedRefresh, refreshDueLabel,
} from '@/lib/importRuns'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { CommitteeFeed } from '@/components/CommitteeFeed'
import { formatDate } from '@/lib/fundFormat'

/**
 * Dashboard.
 *
 * **Restructured Nov 2026 around what the committee WROTE, not only what the
 * advisor owes.** The page had six stat cards over the Action Center band, and
 * four of them — overdue reviews, portfolio reviews, open actions, alerts —
 * restated counts the band already carried from the same `fetchAllActions`
 * model, so the same fact was printed three times (band, card, list) while the
 * committee's 230-odd written documents appeared nowhere at all. The
 * duplicated cards are gone; the two that survive (At-Risk, Watchlist) are
 * inventory, not a worklist, which is why they are not in the band.
 *
 * The page now reads top to bottom as: what is owed (Action Center), what was
 * written (Committee Reports), what is coming (earnings this week), whether the
 * machinery that produces it is working (automation + data freshness), then the
 * detail lists the band can only count.
 */

const GROUP_ORDER: DocGroup[] = ['briefs', 'research', 'calls', 'risk', 'memos']
/** Recent enough that "the committee has been working" is a fact, not a feeling. */
const RECENT_DAYS = 7

export function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: schedules = [] } = useQuery({
    queryKey: QUERY_KEYS.reviewSchedules,
    queryFn: fetchReviewSchedules,
  })
  const { data: actionItems = [] } = useQuery({
    queryKey: [...QUERY_KEYS.actionItems, 'open'],
    queryFn: () => fetchActionItems({ status: 'open' }),
  })
  const { data: alerts = [] } = useQuery({
    queryKey: QUERY_KEYS.alertEvents,
    queryFn: fetchUnacknowledgedAlerts,
  })
  const { data: atRisk = [] } = useQuery({
    queryKey: QUERY_KEYS.atRisk,
    queryFn: fetchActiveAtRisk,
  })
  const { data: prospects = [] } = useQuery({
    queryKey: QUERY_KEYS.prospects,
    queryFn: fetchActiveProspects,
  })
  const { data: portfolioSchedules = [] } = useQuery({
    queryKey: QUERY_KEYS.portfolioReviewSchedules,
    queryFn: fetchPortfolioReviewSchedules,
  })
  // `fetchAllActions` fans out across nine sources and takes seconds. Its
  // loading state is load-bearing: rendering 0 while it resolves says "nothing
  // is overdue" on the front page of an audit-defence tool, which is a false
  // statement, not a placeholder.
  const { data: allActions = [], isLoading: actionsLoading } = useQuery({
    queryKey: QUERY_KEYS.allActions,
    queryFn: fetchAllActions,
  })
  const { data: committeeDocs = [], isLoading: docsLoading } = useQuery({
    queryKey: QUERY_KEYS.committeeDocs,
    queryFn: () => fetchCommitteeDocs(),
    staleTime: 5 * 60 * 1000,
  })
  const { data: jobRuns } = useQuery({
    queryKey: QUERY_KEYS.jobRuns,
    queryFn: fetchLatestJobRuns,
  })
  const { data: importRuns } = useQuery({
    queryKey: QUERY_KEYS.importRuns,
    queryFn: fetchLatestImportRuns,
  })

  const ackMutation = useMutation({
    mutationFn: (id: number) => acknowledgeAlert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alertEvents }),
  })

  // Unified action counts for the Action Center band (the same model /actions reads).
  const activeActions = allActions.filter((a) => (a.isManual ? a.manual!.status !== 'closed' : true))
  const bucketCounts = BUCKET_ORDER.map((b) => ({
    bucket: b,
    label: BUCKET_LABELS[b],
    count: activeActions.filter((a) => bucketOf(a.dueDate) === b).length,
  })).filter((x) => x.bucket !== 'no_date')
  const categoryCounts = (Object.keys(CATEGORY_LABELS) as ActionCategory[])
    .map((c) => ({ category: c, label: CATEGORY_LABELS[c], count: activeActions.filter((a) => a.category === c).length }))
    .filter((x) => x.count > 0)

  const overdueReviews = schedules.filter((s) => isOverdue(reviewDueDay(s.next_review_at)))
  const overduePortfolioReviews = portfolioSchedules.filter((s) => isOverdue(s.next_review_at))
  const dueSoonPortfolioReviews = portfolioSchedules.filter(
    (s) => isDueSoon(s.next_review_at) && !isOverdue(s.next_review_at))

  const docCounts = countByGroup(committeeDocs)
  const recentDocs = producedSince(
    committeeDocs,
    new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10),
  )

  const calls = upcomingEarnings(schedules, today, 7)

  const jobs = jobRuns ? gradeAllJobs(jobRuns) : []
  const unhealthyJobs = jobs.filter(needsAttention)

  const ycharts = importRuns ? ychartsAsOf(importRuns) : null
  const refreshMissed = importRuns ? missedScheduledRefresh(importRuns) : false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-gray-600">Portfolio monitoring overview.</p>
      </div>

      {/* ── What is owed ──────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Action Center</h2>
          <Link to="/actions" className="text-xs text-blue-600 hover:underline">View all actions</Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {bucketCounts.map(({ bucket, label, count }) => (
            <button key={bucket} onClick={() => navigate('/actions')}
              className={`rounded-md border px-3 py-2 text-left hover:bg-gray-50 ${
                !actionsLoading && bucket === 'overdue' && count > 0
                  ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
              }`}>
              <p className={`text-xl font-bold ${
                !actionsLoading && bucket === 'overdue' && count > 0 ? 'text-red-600' : 'text-gray-900'
              }`}>
                {actionsLoading ? <span className="text-gray-300">—</span> : count}
              </p>
              <p className="text-xs text-gray-500">{label}</p>
            </button>
          ))}
          {/* Inventory, not a worklist — which is why these are not in the band
              above and did not fold into it. A watchlist idea is not overdue. */}
          <button onClick={() => navigate('/at-risk')}
            className="ml-auto rounded-md border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50">
            <p className="text-xl font-bold text-gray-900">{atRisk.length}</p>
            <p className="text-xs text-gray-500">At-Risk</p>
          </button>
          <button onClick={() => navigate('/watchlist')}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50">
            <p className="text-xl font-bold text-gray-900">{prospects.length}</p>
            <p className="text-xs text-gray-500">Watchlist</p>
          </button>
        </div>
        {!actionsLoading && categoryCounts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {categoryCounts.map(({ category, label, count }) => (
              <button key={category} onClick={() => navigate('/actions')} className="hover:text-gray-800">
                {label}: <span className="font-medium text-gray-700">{count}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── What the committee wrote ──────────────────────────────────────── */}
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Committee Reports</h2>
            <p className="text-xs text-gray-500">
              {docsLoading
                ? 'Reading the committee’s output…'
                : `${recentDocs} written in the last ${RECENT_DAYS} days · ${committeeDocs.length} in all`}
            </p>
          </div>
          <Link to="/committee" className="text-xs text-blue-600 hover:underline">View all reports →</Link>
        </div>
        {!docsLoading && committeeDocs.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
            {GROUP_ORDER.filter((g) => docCounts[g] > 0).map((g) => (
              <Link key={g} to="/committee" className="hover:text-gray-800">
                {DOC_GROUP_LABELS[g]}: <span className="font-medium text-gray-700">{docCounts[g]}</span>
              </Link>
            ))}
          </div>
        )}
        <CommitteeFeed docs={committeeDocs.slice(0, 6)} />
      </section>

      {/* ── What is coming, and whether the machinery works ───────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Earnings this week */}
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Earnings This Week</h2>
            <Link to="/reviews" className="text-xs text-blue-600 hover:underline">Calendar</Link>
          </div>
          {calls.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No held stock reports in the next 7 days.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {calls.map((c) => (
                <li key={c.symbol} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <button
                      onClick={() => c.securityNumericId != null && navigate(`/security/${c.securityNumericId}`)}
                      className="text-sm font-medium text-blue-600 hover:underline">{c.symbol}</button>
                    {/* The review the call will schedule — release + 1 day. */}
                    <p className="text-xs text-gray-500">Review due {formatDate(c.reviewDueOn)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-600">
                    {c.inDays === 0 ? 'Today' : c.inDays === 1 ? 'Tomorrow' : formatDate(c.callOn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Automation health */}
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Automation</h2>
            <Link to="/actions?automation=1" className="text-xs text-blue-600 hover:underline">Details</Link>
          </div>
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No run history yet.</p>
          ) : unhealthyJobs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">
              All {jobs.length} scheduled routines ran as expected.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {unhealthyJobs.map((s) => (
                <li key={s.def.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">{s.def.label}</p>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      {JOB_HEALTH_LABELS[s.health]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {s.latest ? `Last run ${fmtRunTime(s.latest.started_at)}` : 'Never run'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Data freshness */}
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Data Freshness</h2>
            <Link to="/settings/import-export" className="text-xs text-blue-600 hover:underline">Imports</Link>
          </div>
          <div className="space-y-3 px-4 py-3">
            {/* YCharts figures carry no as-of date of their own, so a months-old
                number renders identically to a fresh one — the import stamp is
                the only provenance there is. */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">YCharts workbook</p>
              {ycharts ? (
                <>
                  <p className={`text-sm font-semibold ${daysSince(ycharts) > 45 ? 'text-amber-700' : 'text-gray-900'}`}>
                    {fmtImportDate(ycharts)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {daysSince(ycharts)} day{daysSince(ycharts) === 1 ? '' : 's'} old
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">Never imported</p>
              )}
            </div>
            {/* A missed run leaves NO row, so absence is the only evidence and
                it is only readable against when a run was due. */}
            {refreshMissed && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                The scheduled refresh has not landed — {refreshDueLabel(lastExpectedRefresh())}.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ── The detail the band can only count ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Overdue Reviews{overdueReviews.length > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {overdueReviews.length}
                </span>
              )}
            </h2>
            <Link to="/reviews" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {overdueReviews.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No overdue reviews. 🎉</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {overdueReviews.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <button onClick={() => s.security_numeric_id != null && navigate(`/security/${s.security_numeric_id}`)}
                      className="text-sm font-medium text-blue-600 hover:underline">{s.symbol}</button>
                    <p className="text-xs text-gray-500">{s.name}</p>
                  </div>
                  <span className="text-xs text-red-600">Due {formatDate(s.next_review_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Portfolio Reviews Due{overduePortfolioReviews.length > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {overduePortfolioReviews.length}
                </span>
              )}
            </h2>
            <Link to="/portfolio" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {overduePortfolioReviews.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">
              No overdue portfolio reviews.{dueSoonPortfolioReviews.length > 0
                && ` ${dueSoonPortfolioReviews.length} due within 14 days.`}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {overduePortfolioReviews.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <button onClick={() => navigate(`/portfolio/${encodeURIComponent(s.portfolio_name)}`)}
                      className="text-sm font-medium text-blue-600 hover:underline">{s.portfolio_name}</button>
                    <p className="text-xs text-gray-500">{CADENCE_LABELS[s.cadence]} review</p>
                  </div>
                  <span className="text-xs text-red-600">Due {formatDate(s.next_review_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Open Action Items{actionItems.length > 0 && (
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {actionItems.length}
                </span>
              )}
            </h2>
            <Link to="/actions" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {actionItems.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No open action items.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {actionItems.slice(0, 5).map((item) => (
                <li key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    {item.security_symbol && <p className="text-xs text-gray-500">{item.security_symbol}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.priority === 'high' && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">High</span>
                    )}
                    {item.due_date && (
                      <span className={`text-xs ${new Date(item.due_date) < new Date() ? 'text-red-600' : 'text-gray-500'}`}>
                        {formatDate(item.due_date)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {alerts.length > 0 && (
          <section className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-sm">
            <div className="border-b border-red-200 bg-red-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-red-900">Performance Alerts</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <button onClick={() => alert.security_numeric_id != null && navigate(`/security/${alert.security_numeric_id}`)}
                      className="text-sm font-medium text-blue-600 hover:underline">
                      {alert.security_symbol ?? alert.security_id}
                    </button>
                    <p className="text-xs text-gray-600">
                      {alert.message ?? `${alert.metric_field} = ${alert.actual_value ?? '—'} (threshold: ${alert.threshold_value})`}
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(alert.triggered_at)}</p>
                  </div>
                  <button onClick={() => ackMutation.mutate(alert.id)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    Acknowledge
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
