import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchReviewSchedules, isOverdue, isDueSoon } from '@/lib/reviewSchedules'
import { fetchActionItems } from '@/lib/actionItems'
import { fetchUnacknowledgedAlerts, acknowledgeAlert } from '@/lib/alertRules'
import { fetchActiveAtRisk } from '@/lib/atRisk'
import { fetchActiveProspects } from '@/lib/prospects'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDate } from '@/lib/fundFormat'

export function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: schedules = [] } = useQuery({
    queryKey: QUERY_KEYS.reviewSchedules,
    queryFn: fetchReviewSchedules,
  })

  const { data: actionItems = [] } = useQuery({
    queryKey: QUERY_KEYS.actionItems,
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

  const ackMutation = useMutation({
    mutationFn: (id: number) => acknowledgeAlert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alertEvents }),
  })

  const overdueReviews = schedules.filter((s) => isOverdue(s.next_review_at))
  const dueSoonReviews = schedules.filter((s) => isDueSoon(s.next_review_at) && !isOverdue(s.next_review_at))
  const overdueActions = actionItems.filter((a) => a.due_date && new Date(a.due_date) < new Date())
  const highPriorityActions = actionItems.filter((a) => a.priority === 'high')

  const statCards = [
    { label: 'Overdue Reviews', value: overdueReviews.length, color: overdueReviews.length > 0 ? 'text-red-600' : 'text-gray-900', link: '/reviews', sublabel: `${dueSoonReviews.length} due within 14 days` },
    { label: 'Open Action Items', value: actionItems.length, color: actionItems.length > 0 ? 'text-amber-600' : 'text-gray-900', link: '/actions', sublabel: `${highPriorityActions.length} high priority` },
    { label: 'Unacknowledged Alerts', value: alerts.length, color: alerts.length > 0 ? 'text-red-600' : 'text-gray-900', link: null, sublabel: 'Performance threshold breaches' },
    { label: 'At-Risk', value: atRisk.length, color: 'text-gray-900', link: '/at-risk', sublabel: 'Held securities flagged for replacement' },
    { label: 'Watchlist', value: prospects.length, color: 'text-gray-900', link: '/watchlist', sublabel: 'Buy candidates under consideration' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-gray-600">Portfolio monitoring overview.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label}
            role={card.link ? 'button' : undefined}
            onClick={() => card.link && navigate(card.link)}
            className={`rounded-lg border border-gray-200 bg-white p-5 shadow-sm ${card.link ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className={`mt-2 text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="mt-1 text-xs text-gray-500">{card.sublabel}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Overdue Reviews */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Overdue Reviews</h2>
            <button onClick={() => navigate('/reviews')} className="text-xs text-blue-600 hover:underline">View all</button>
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
        </div>

        {/* Open Action Items */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Open Action Items</h2>
            <button onClick={() => navigate('/actions')} className="text-xs text-blue-600 hover:underline">View all</button>
          </div>
          {actionItems.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No open action items.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {actionItems.slice(0, 5).map((item) => (
                <li key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    {item.security_symbol && (
                      <p className="text-xs text-gray-500">{item.security_symbol}</p>
                    )}
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
        </div>

        {/* Unacknowledged Alerts */}
        {alerts.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-sm lg:col-span-2">
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
                      {alert.metric_field} = {alert.actual_value ?? '—'} (threshold: {alert.threshold_value})
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
          </div>
        )}
      </div>
    </div>
  )
}
