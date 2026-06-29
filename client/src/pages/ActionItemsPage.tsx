import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchActionItems, updateActionItemStatus, deleteActionItem, type ActionStatus, type ActionPriority } from '@/lib/actionItems'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { CreateActionItemModal } from '@/components/CreateActionItemModal'
import { StatusBadge } from '@/components/StatusBadge'
import { ActionItemTimeline } from '@/components/ActionItemTimeline'
import { formatDate } from '@/lib/fundFormat'

type FilterStatus = ActionStatus | 'all'

const PRIORITY_ORDER: ActionPriority[] = ['high', 'medium', 'low']

export function ActionItemsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('open')
  const [createOpen, setCreateOpen] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.actionItems, filterStatus],
    queryFn: () => fetchActionItems(filterStatus !== 'all' ? { status: filterStatus } : undefined),
    staleTime: 1000 * 30, // 30 s — action items change frequently
  })

  const sortedItems = [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER.indexOf(a.priority)
    const pb = PRIORITY_ORDER.indexOf(b.priority)
    if (pa !== pb) return pa - pb
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ActionStatus }) =>
      updateActionItemStatus(id, status),
    onSuccess: () => {
      setMutationError(null)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItems })
    },
    onError: (err) => setMutationError(err instanceof Error ? err.message : 'Failed to update status'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteActionItem(id),
    onSuccess: () => {
      setMutationError(null)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItems })
    },
    onError: (err) => setMutationError(err instanceof Error ? err.message : 'Failed to delete action item'),
  })

  const isOverdue = (dueDate: string | null) =>
    dueDate != null && new Date(dueDate) < new Date() && filterStatus !== 'closed'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Action Items</h1>
          <p className="mt-1 text-gray-600">Track follow-up tasks across securities and portfolios.</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
          New Action Item
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-2">
        {(['open', 'in_progress', 'closed', 'all'] as FilterStatus[]).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
              filterStatus === s ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
            {s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {mutationError && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5">
          <p className="text-sm text-red-700">{mutationError}</p>
          <button onClick={() => setMutationError(null)} className="ml-4 text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {isLoading ? (
        <p className="mt-8 text-gray-500">Loading…</p>
      ) : sortedItems.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-gray-500">No action items found.</p>
          <button onClick={() => setCreateOpen(true)}
            className="mt-3 text-sm font-medium text-gray-700 underline">Create one</button>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Title</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-gray-900 sm:table-cell">Linked To</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-gray-900 sm:table-cell">Due Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Priority</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sortedItems.map((item) => {
                const isExpanded = expandedId === item.id
                return (
                  <React.Fragment key={item.id}>
                    <tr className={isOverdue(item.due_date) ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          {/* Expand toggle */}
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600"
                            title="Show history"
                          >
                            {isExpanded ? (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                              </svg>
                            ) : (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </button>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">{item.title}</p>
                            {item.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>}
                            {item.due_date && (
                              <p className={`mt-0.5 text-xs sm:hidden ${isOverdue(item.due_date) ? 'font-medium text-red-600' : 'text-gray-400'}`}>
                                Due {formatDate(item.due_date)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-gray-700 sm:table-cell">
                        {item.security_id && item.security_symbol ? (
                          <button onClick={() => navigate(`/security/${item.security_id}`)}
                            className="text-blue-600 hover:underline">{item.security_symbol}</button>
                        ) : item.portfolio_name ? (
                          <button onClick={() => navigate(`/portfolio/${encodeURIComponent(item.portfolio_name!)}`)}
                            className="text-blue-600 hover:underline">{item.portfolio_name}</button>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`hidden whitespace-nowrap px-4 py-3 sm:table-cell ${isOverdue(item.due_date) ? 'font-medium text-red-700' : 'text-gray-700'}`}>
                        {item.due_date ? formatDate(item.due_date) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={item.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={item.status}
                          disabled={statusMutation.isPending}
                          onChange={(e) => statusMutation.mutate({ id: item.id, status: e.target.value as ActionStatus })}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none disabled:opacity-50">
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">
                          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>

                    {/* Status history expansion row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="bg-gray-50 px-8 py-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Status History
                          </p>
                          <ActionItemTimeline actionItemId={item.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateActionItemModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  )
}
