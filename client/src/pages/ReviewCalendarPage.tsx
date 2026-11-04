import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  fetchReviewSchedules, isOverdue, isDueSoon, redatedStockSchedules, applyScheduleRedates,
  fetchUnscheduledHeldSecurities, ensureReviewSchedules,
  reviewDueDay, type ReviewCadence,
} from '@/lib/reviewSchedules'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { fetchSecurityById, isFundOrEtfSecurity, refreshSecuritiesFromFMP } from '@/lib/securities'
import { MarkReviewedModal } from '@/components/MarkReviewedModal'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate } from '@/lib/fundFormat'

type Filter = 'all' | 'overdue' | 'due_soon'

export function ReviewCalendarPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [reviewing, setReviewing] = useState<{
    securityId: string; symbol: string; cadence: ReviewCadence
    lastEarnings: string | null; nextEarnings: string | null
    /** Classified from the embedded columns at click time (see `stocksIn` below). */
    isFund: boolean
    /** securities2.id — needed to load the full record a fund review's PDF is built from. */
    numericId: number | null
  } | null>(null)

  const queryClient = useQueryClient()
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.reviewSchedules,
    queryFn: fetchReviewSchedules,
  })

  // Stock review dates are earnings-driven, and this page reads the STORED
  // earnings columns (it cannot fetch per row while rendering). Top up any that
  // have gone stale, once per mount, then refetch so the dates shown are right.
  const [refreshing, setRefreshing] = useState(false)
  const [refreshedCount, setRefreshedCount] = useState<number | null>(null)
  const [redatedCount, setRedatedCount] = useState<number | null>(null)
  const [seededCount, setSeededCount] = useState<number | null>(null)
  const didRefresh = useRef(false)

  // Two corrections, and the second does NOT depend on the first.
  //
  // Topping up a stale earnings date only fires for a date that is null or in
  // the past. MSI's was already correct at Nov 4 while its SCHEDULE still read
  // Oct 30 from a superseded estimate — so gating the re-date on "the refresh
  // changed something" would have left exactly the row that prompted this.
  useEffect(() => {
    if (didRefresh.current || schedules.length === 0) return
    didRefresh.current = true

    const stocksIn = (rows: typeof schedules) => rows.filter((s) => s.symbol && !isFundOrEtfSecurity(s))
    const today = new Date().toISOString().slice(0, 10)
    // STRICTLY before today, as it has always been: a stock whose call is TODAY
    // has a review due tomorrow, and refreshing it would advance the stored
    // date past that call and skip the review entirely.
    const isStale = (d: string | null | undefined) => d == null || d.slice(0, 10) < today

    setRefreshing(true)
    void (async () => {
      // A held stock with NO schedule row is invisible to everything here, and
      // the two corrections below cannot reach it: the top-up reads schedule
      // rows and the re-date is a per-row UPDATE. So find them first.
      let unscheduled = await fetchUnscheduledHeldSecurities()

      // Refresh BOTH sets of stale earnings dates in one call. Widening this to
      // the unscheduled stocks is what breaks the circularity: TSM's stored
      // date was three weeks past, and `seededStockSchedules` refuses to date a
      // schedule from a stale date, so without this it could never be seeded
      // and so could never be refreshed.
      const stale = [
        ...stocksIn(schedules).filter((s) => isStale(s.next_earnings_release)).map((s) => s.symbol),
        ...unscheduled.filter((c) => isStale(c.next_earnings_release)).map((c) => c.security_id),
      ]

      let rows = schedules
      if (stale.length > 0) {
        const n = await refreshSecuritiesFromFMP(stale)
        setRefreshedCount(n)
        // Re-read so the seed and re-date below see the dates FMP just supplied.
        if (n > 0) {
          rows = await fetchReviewSchedules()
          unscheduled = await fetchUnscheduledHeldSecurities()
        }
      }

      // The SAME function the purchase path calls, so the two cannot diverge
      // on what a new holding's schedule looks like. It matters here: this used
      // to call `seededStockSchedules`, which skips funds — so four held mutual
      // funds (VBTLX, VIGAX, VMSAX, VVIAX) stayed unscheduled while the stock
      // gap read as closed.
      const seeded = await ensureReviewSchedules(unscheduled.map((c) => c.security_id))
      if (seeded > 0) {
        setSeededCount(seeded)
        rows = await fetchReviewSchedules()
      }

      const redates = redatedStockSchedules(stocksIn(rows))
      if (redates.length > 0) {
        await applyScheduleRedates(redates)
        setRedatedCount(redates.length)
      }
      if (stale.length > 0 || seeded > 0 || redates.length > 0) {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reviewSchedules })
      }
    })()
      .catch(() => {})
      .finally(() => setRefreshing(false))
  }, [schedules, queryClient])

  // A FUND review freezes its scorecard evidence to a PDF, which is built from
  // the full securities2 record — and `fetchReviewSchedules` embeds only the few
  // columns the classifier needs. So load the record on demand when a fund row
  // is picked, and render the modal only once it is in hand: the modal takes one
  // `fundSecurity` prop precisely so there is no half-configured state to open.
  // Keyed on QUERY_KEYS.security(id), so this shares the detail page's cache.
  const fundRecordNeeded = reviewing?.isFund === true && reviewing.numericId != null
  const {
    data: fundRecord, isLoading: fundRecordLoading, isError: fundRecordError,
  } = useQuery({
    queryKey: QUERY_KEYS.security(reviewing?.numericId ?? -1),
    queryFn: () => fetchSecurityById(reviewing!.numericId!),
    enabled: fundRecordNeeded,
  })

  // Not reachable by the same means as the stock path: a fund with no usable
  // record must say so, never quietly fall through and be written as a stock.
  const fundRecordFailed =
    reviewing?.isFund === true &&
    (reviewing.numericId == null || fundRecordError || (!fundRecordLoading && fundRecord === null))

  const filtered = schedules.filter((s) => {
    if (filter === 'overdue') return isOverdue(reviewDueDay(s.next_review_at))
    if (filter === 'due_soon') return isDueSoon(reviewDueDay(s.next_review_at)) && !isOverdue(reviewDueDay(s.next_review_at))
    return true
  })

  const overdueCount = schedules.filter((s) => isOverdue(reviewDueDay(s.next_review_at))).length
  const dueSoonCount = schedules.filter((s) => isDueSoon(reviewDueDay(s.next_review_at)) && !isOverdue(reviewDueDay(s.next_review_at))).length

  function rowStatus(nextReviewAt: string) {
    const nextReview = reviewDueDay(nextReviewAt)
    if (isOverdue(nextReview)) return 'overdue'
    if (isDueSoon(nextReview)) return 'due_soon'
    return null
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Review Calendar</h1>
          <p className="mt-1 text-gray-600">
            Complete quarterly, semi-annual, and annual security reviews.{' '}
            <a href="/actions" className="text-blue-600 hover:underline">See all actions →</a>
          </p>
          {refreshing && (
            <p className="mt-1 text-xs text-gray-400">Refreshing stock earnings dates from FMP…</p>
          )}
          {!refreshing && refreshedCount != null && refreshedCount > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              Updated earnings dates for {refreshedCount} stock{refreshedCount === 1 ? '' : 's'}.
            </p>
          )}
          {/* Said separately: a held security with no schedule was invisible
              to every review surface, so starting one is a governed write, not
              routine upkeep. Securities, not stocks — four held mutual funds
              were in this state. */}
          {!refreshing && seededCount != null && seededCount > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              Started a review schedule for {seededCount} held securit{seededCount === 1 ? 'y' : 'ies'} that had none.
            </p>
          )}
          {/* Said separately from the line above: a re-dated review is a date
              the advisor was being shown wrongly, not routine data upkeep. */}
          {!refreshing && redatedCount != null && redatedCount > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              Re-dated {redatedCount} review{redatedCount === 1 ? '' : 's'} whose earnings date had moved.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {(['all', 'overdue', 'due_soon'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                filter === f ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}>
              {f === 'all' ? `All (${schedules.length})` :
               f === 'overdue' ? `Overdue (${overdueCount})` :
               `Due Soon (${dueSoonCount})`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="mt-8 text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-gray-500">
            {filter === 'all'
              ? 'No review schedules set. Open a security and set a review cadence from the monitoring tab.'
              : `No ${filter === 'overdue' ? 'overdue' : 'upcoming'} reviews.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Security</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Cadence</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Last Reviewed</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Next Review</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((s) => {
                const status = rowStatus(s.next_review_at)
                return (
                  <tr key={s.id} className={status === 'overdue' ? 'bg-red-50' : status === 'due_soon' ? 'bg-amber-50' : ''}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        onClick={() => { if (s.security_numeric_id != null) navigate(`/security/${s.security_numeric_id}`) }}
                        className="font-medium text-blue-600 hover:underline"
                        disabled={s.security_numeric_id == null}
                      >
                        {s.symbol}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{s.name ?? '—'}</td>
                    <td className="px-4 py-3 capitalize text-gray-700">{s.cadence.replace('_', '-')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {s.last_reviewed_at ? formatDate(s.last_reviewed_at) : <span className="text-gray-400">Never</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(reviewDueDay(s.next_review_at))}</td>
                    <td className="px-4 py-3">
                      {status ? <StatusBadge variant={status} /> : <span className="text-xs text-gray-400">On track</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => setReviewing({
                          securityId: s.security_id, symbol: s.symbol, cadence: s.cadence,
                          lastEarnings: s.last_earnings_release, nextEarnings: s.next_earnings_release,
                          isFund: isFundOrEtfSecurity(s), numericId: s.security_numeric_id,
                        })}
                        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
                        Mark Reviewed
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {reviewing && (!reviewing.isFund || fundRecord) && (
        <MarkReviewedModal
          open={true}
          onClose={() => setReviewing(null)}
          securityId={reviewing.securityId}
          securitySymbol={reviewing.symbol}
          currentCadence={reviewing.cadence}
          fundSecurity={reviewing.isFund ? fundRecord ?? null : null}
          lastEarnings={reviewing.lastEarnings}
          nextEarnings={reviewing.nextEarnings}
        />
      )}

      {reviewing?.isFund && !fundRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            {fundRecordFailed ? (
              <>
                <h2 className="text-sm font-semibold text-gray-900">
                  Can&rsquo;t review {reviewing.symbol} from here
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  A fund review saves a scorecard evidence PDF, and {reviewing.symbol}&rsquo;s
                  full record could not be loaded. Open the security page and review it there.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setReviewing(null)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const id = reviewing.numericId
                      setReviewing(null)
                      if (id != null) navigate(`/security/${id}`)
                    }}
                    disabled={reviewing.numericId == null}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
                    Open {reviewing.symbol} →
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">Loading {reviewing.symbol} evidence…</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
