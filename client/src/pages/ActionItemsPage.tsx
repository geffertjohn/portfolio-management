import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  updateActionItemStatus, deleteActionItem, snoozeActionItem, createActionItem, advanceDate,
  CATEGORY_LABELS, RECURRENCE_LABELS,
  type ActionStatus, type ActionCategory, type ActionPriority, type ActionRecurrence,
} from '@/lib/actionItems'
import {
  fetchAllActions, bucketOf, BUCKET_LABELS, BUCKET_ORDER, SOURCE_LABELS,
  type UnifiedAction, type DateBucket,
} from '@/lib/actions'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { CreateActionItemModal } from '@/components/CreateActionItemModal'
import { StatusBadge } from '@/components/StatusBadge'
import { ActionItemTimeline } from '@/components/ActionItemTimeline'
import { formatDate } from '@/lib/fundFormat'

const PRIORITY_ORDER: ActionPriority[] = ['high', 'medium', 'low']
const CATEGORY_FILTERS: (ActionCategory | 'all')[] = ['all', 'security', 'portfolio', 'ic', 'compliance', 'client', 'trade', 'operational']

type SourceFilter = 'all' | 'manual' | 'derived'
type GroupBy = 'bucket' | 'category'

// Recurring-task quick-starts (manual, seeded with today's first occurrence).
const TEMPLATES: { title: string; category: ActionCategory; recurrence: ActionRecurrence; priority: ActionPriority }[] = [
  { title: 'Quarterly compliance verification', category: 'compliance', recurrence: 'quarterly', priority: 'medium' },
  { title: 'Annual IPS review', category: 'client', recurrence: 'annual', priority: 'medium' },
  { title: 'Monthly performance attribution', category: 'portfolio', recurrence: 'monthly', priority: 'low' },
  { title: 'Weekly watchlist review', category: 'security', recurrence: 'weekly', priority: 'low' },
]

const today = () => new Date().toISOString().slice(0, 10)

// Persist the working filter/view so it survives navigation (device-local UI state).
const FILTERS_KEY = 'actions_filters_v1'
interface SavedFilters { category: ActionCategory | 'all'; sourceFilter: SourceFilter; showClosed: boolean; groupBy: GroupBy }
function loadFilters(): Partial<SavedFilters> {
  try { return JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}') } catch { return {} }
}

/** A manual action counts as "active" unless closed or currently snoozed into the future. */
function isActive(a: UnifiedAction): boolean {
  if (!a.isManual) return true
  const m = a.manual!
  if (m.status === 'closed') return false
  if (m.status === 'snoozed' && m.snoozed_until && m.snoozed_until > today()) return false
  return true
}

export function ActionItemsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const saved = loadFilters()
  const [category, setCategory] = useState<ActionCategory | 'all'>(saved.category ?? 'all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(saved.sourceFilter ?? 'all')
  const [showClosed, setShowClosed] = useState(saved.showClosed ?? false)
  const [groupBy, setGroupBy] = useState<GroupBy>(saved.groupBy ?? 'bucket')
  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ category, sourceFilter, showClosed, groupBy }))
  }, [category, sourceFilter, showClosed, groupBy])
  const [createOpen, setCreateOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const { data: actions = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.allActions,
    queryFn: fetchAllActions,
    staleTime: 1000 * 30,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allActions })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItems })
  }
  const onErr = (err: unknown) => setMutationError(err instanceof Error ? err.message : 'Action failed')

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ActionStatus }) => updateActionItemStatus(id, status),
    onSuccess: () => { setMutationError(null); invalidate() }, onError: onErr,
  })
  const snoozeMutation = useMutation({
    mutationFn: (id: number) => snoozeActionItem(id, advanceDate(today(), 'weekly', 1)),
    onSuccess: () => { setMutationError(null); invalidate() }, onError: onErr,
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteActionItem(id),
    onSuccess: () => { setMutationError(null); invalidate() }, onError: onErr,
  })
  const bulkMutation = useMutation({
    mutationFn: async (op: 'close' | 'snooze') => {
      const ids = [...selected]
      await Promise.all(ids.map((id) =>
        op === 'close' ? updateActionItemStatus(id, 'closed') : snoozeActionItem(id, advanceDate(today(), 'weekly', 1))))
    },
    onSuccess: () => { setMutationError(null); setSelected(new Set()); invalidate() }, onError: onErr,
  })
  const templateMutation = useMutation({
    mutationFn: (t: typeof TEMPLATES[number]) => createActionItem({
      title: t.title, category: t.category, priority: t.priority,
      recurrence: t.recurrence, due_date: today(),
    }),
    onSuccess: () => { setMutationError(null); setTemplatesOpen(false); invalidate() }, onError: onErr,
  })

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => actions.filter((a) => {
    if (category !== 'all' && a.category !== category) return false
    if (sourceFilter === 'manual' && !a.isManual) return false
    if (sourceFilter === 'derived' && a.isManual) return false
    if (!showClosed && !isActive(a)) return false
    return true
  }), [actions, category, sourceFilter, showClosed])

  const sortActions = (arr: UnifiedAction[]) => [...arr].sort((a, b) => {
    const p = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    if (p !== 0) return p
    if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return 0
  })

  // ── Group ─────────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, UnifiedAction[]>()
    for (const a of filtered) {
      const key = groupBy === 'bucket' ? bucketOf(a.dueDate) : a.category
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    const orderedKeys = groupBy === 'bucket'
      ? BUCKET_ORDER.filter((b) => map.has(b))
      : (CATEGORY_FILTERS.filter((c) => c !== 'all') as ActionCategory[]).filter((c) => map.has(c))
    return orderedKeys.map((k) => ({
      key: k,
      label: groupBy === 'bucket' ? BUCKET_LABELS[k as DateBucket] : CATEGORY_LABELS[k as ActionCategory],
      items: sortActions(map.get(k)!),
    }))
  }, [filtered, groupBy])

  const manualIdsInView = filtered.filter((a) => a.isManual).map((a) => a.manual!.id)
  const allSelected = manualIdsInView.length > 0 && manualIdsInView.every((id) => selected.has(id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(manualIdsInView))
  const toggleOne = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const exportCsv = () => {
    const rows = [['Category', 'Source', 'Title', 'Linked', 'Due', 'Priority', 'Status']]
    for (const a of filtered) rows.push([
      CATEGORY_LABELS[a.category], SOURCE_LABELS[a.source], a.title,
      a.linkedLabel ?? '', a.dueDate ?? '', a.priority,
      a.isManual ? a.manual!.status : 'active',
    ])
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'actions.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const activeCount = actions.filter(isActive).length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Actions</h1>
          <p className="mt-1 text-gray-600">
            Every open task — reviews, IC decisions, alerts, at-risk timers, rebalances, and manual follow-ups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Export CSV
          </button>
          <div className="relative">
            <button onClick={() => setTemplatesOpen((o) => !o)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Templates ▾
            </button>
            {templatesOpen && (
              <div className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {TEMPLATES.map((t) => (
                  <button key={t.title} onClick={() => templateMutation.mutate(t)}
                    className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                    {t.title}
                    <span className="ml-1 text-xs text-gray-400">· {RECURRENCE_LABELS[t.recurrence]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setCreateOpen(true)}
            className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
            New Action
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              category === c ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
            {c === 'all' ? `All (${activeCount})` : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Source + view controls */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Source:</span>
          {(['all', 'manual', 'derived'] as SourceFilter[]).map((s) => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className={`rounded px-2 py-0.5 capitalize ${sourceFilter === s ? 'bg-gray-200 font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Group by:</span>
          {(['bucket', 'category'] as GroupBy[]).map((g) => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={`rounded px-2 py-0.5 ${groupBy === g ? 'bg-gray-200 font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
              {g === 'bucket' ? 'Due date' : 'Category'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-gray-500">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed
        </label>
      </div>

      {mutationError && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5">
          <p className="text-sm text-red-700">{mutationError}</p>
          <button onClick={() => setMutationError(null)} className="ml-4 text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm">
          <span className="font-medium text-gray-700">{selected.size} selected</span>
          <button onClick={() => bulkMutation.mutate('close')} disabled={bulkMutation.isPending}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-100 disabled:opacity-50">Close</button>
          <button onClick={() => bulkMutation.mutate('snooze')} disabled={bulkMutation.isPending}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-100 disabled:opacity-50">Snooze 1w</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-800">Clear</button>
        </div>
      )}

      {isLoading ? (
        <p className="mt-8 text-gray-500">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-gray-500">Nothing to act on. 🎉</p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {manualIdsInView.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Select all manual tasks in view
            </label>
          )}
          {groups.map((group) => (
            <div key={group.key}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                {group.label}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">{group.items.length}</span>
              </h2>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {group.items.map((a) => (
                      <ActionRow
                        key={a.key} action={a} navigate={navigate}
                        selected={a.isManual ? selected.has(a.manual!.id) : false}
                        onToggleSelect={a.isManual ? () => toggleOne(a.manual!.id) : undefined}
                        expanded={a.isManual ? expandedId === a.manual!.id : false}
                        onToggleExpand={a.isManual ? () => setExpandedId(expandedId === a.manual!.id ? null : a.manual!.id) : undefined}
                        onStatus={(status) => a.isManual && statusMutation.mutate({ id: a.manual!.id, status })}
                        onSnooze={() => a.isManual && snoozeMutation.mutate(a.manual!.id)}
                        onDelete={() => a.isManual && deleteMutation.mutate(a.manual!.id)}
                        busy={statusMutation.isPending || deleteMutation.isPending || snoozeMutation.isPending}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateActionItemModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

// ── One row: manual (editable) or derived (route-to-source) ──────────────────
function ActionRow({
  action: a, navigate, selected, onToggleSelect, expanded, onToggleExpand,
  onStatus, onSnooze, onDelete, busy,
}: {
  action: UnifiedAction
  navigate: (to: string) => void
  selected: boolean
  onToggleSelect?: () => void
  expanded: boolean
  onToggleExpand?: () => void
  onStatus: (status: ActionStatus) => void
  onSnooze: () => void
  onDelete: () => void
  busy: boolean
}) {
  const overdue = a.dueDate != null && new Date(a.dueDate) < new Date() && (!a.isManual || a.manual!.status !== 'closed')
  const recurrence = a.isManual ? a.manual!.recurrence : 'none'
  return (
    <>
      <tr className={overdue ? 'bg-red-50' : ''}>
        <td className="w-8 pl-4">
          {a.isManual && onToggleSelect && (
            <input type="checkbox" checked={selected} onChange={onToggleSelect} />
          )}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-start gap-2">
            {a.isManual && onToggleExpand && (
              <button type="button" onClick={onToggleExpand} className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600" title="History">
                <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-medium text-gray-900">{a.title}</p>
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  {SOURCE_LABELS[a.source]}
                </span>
                {recurrence !== 'none' && (
                  <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">↻ {RECURRENCE_LABELS[recurrence]}</span>
                )}
              </div>
              {a.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{a.subtitle}</p>}
              <p className="mt-0.5 text-xs text-gray-400">
                {CATEGORY_LABELS[a.category]}
                {a.linkedLabel && <> · {a.linkedLabel}</>}
                {a.dueDate && <> · <span className={overdue ? 'font-medium text-red-600' : ''}>Due {formatDate(a.dueDate)}</span></>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3"><StatusBadge variant={a.priority} /></td>
        <td className="whitespace-nowrap px-3 py-3 text-right">
          {a.isManual ? (
            <div className="flex items-center justify-end gap-2">
              <select value={a.manual!.status} disabled={busy}
                onChange={(e) => onStatus(e.target.value as ActionStatus)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none disabled:opacity-50">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting">Waiting</option>
                <option value="blocked">Blocked</option>
                <option value="closed">Closed</option>
              </select>
              <button onClick={onSnooze} disabled={busy} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50">Snooze</button>
              <button onClick={onDelete} disabled={busy} className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">Delete</button>
            </div>
          ) : (
            <button onClick={() => a.route && navigate(a.route)} disabled={!a.route}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              Open →
            </button>
          )}
        </td>
      </tr>
      {a.isManual && expanded && (
        <tr>
          <td colSpan={4} className="bg-gray-50 px-10 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Status History</p>
            <ActionItemTimeline actionItemId={a.manual!.id} />
          </td>
        </tr>
      )}
    </>
  )
}
