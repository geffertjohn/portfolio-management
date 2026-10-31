import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  updateActionItemStatus, deleteActionItem, snoozeActionItem, createActionItem, advanceDate,
  CATEGORY_LABELS, RECURRENCE_LABELS,
  type ActionStatus, type ActionCategory, type ActionPriority, type ActionRecurrence,
} from '@/lib/actionItems'
import {
  fetchAllActions, bucketOf, clusterActions, agingLabel, withinHorizon,
  BUCKET_LABELS, BUCKET_ORDER, SOURCE_LABELS, HORIZON_OPTIONS,
  type UnifiedAction, type DateBucket, type ActionCluster, type Horizon,
} from '@/lib/actions'
import { fetchLatestJobRuns, gradeAllJobs, needsAttention } from '@/lib/jobRuns'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { CreateActionItemModal } from '@/components/CreateActionItemModal'
import { AutomationPanel } from '@/components/AutomationPanel'
import { StatusBadge } from '@/components/StatusBadge'
import { ActionItemTimeline } from '@/components/ActionItemTimeline'
import { formatDate } from '@/lib/fundFormat'

const PRIORITY_ORDER: ActionPriority[] = ['high', 'medium', 'low']
const CATEGORIES: ActionCategory[] = ['security', 'portfolio', 'ic', 'compliance', 'client', 'trade', 'operational']

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

/** Module scope so the memos below can depend on `sourceFilter` and nothing else. */
function matchesSource(a: UnifiedAction, filter: SourceFilter): boolean {
  return filter === 'all' || (filter === 'manual') === a.isManual
}

// Persist the working view so it survives navigation (device-local UI state).
const FILTERS_KEY = 'actions_filters_v2'
interface SavedFilters {
  category: ActionCategory | 'all'
  sourceFilter: SourceFilter
  showClosed: boolean
  groupBy: GroupBy
  horizon: Horizon
  collapsed: string[]
}
function loadFilters(): Partial<SavedFilters> {
  try { return JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}') } catch { return {} }
}

/**
 * Collapsed by default: the forward calendar, not the worklist.
 *
 * "Upcoming" is every schedule whose date is more than a week out — 80 rows of
 * "this reports in six weeks". They are real and they stay on the page, but
 * rendering them open by default buried the ~15 rows that actually need doing.
 */
const DEFAULT_COLLAPSED = ['upcoming', 'no_date']

/** A manual action counts as "active" unless closed or snoozed into the future. */
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
  const [searchParams, setSearchParams] = useSearchParams()

  const [category, setCategory] = useState<ActionCategory | 'all'>(saved.category ?? 'all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(saved.sourceFilter ?? 'all')
  const [showClosed, setShowClosed] = useState(saved.showClosed ?? false)
  const [groupBy, setGroupBy] = useState<GroupBy>(saved.groupBy ?? 'bucket')
  const [horizon, setHorizon] = useState<Horizon>(saved.horizon ?? 0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(saved.collapsed ?? DEFAULT_COLLAPSED))
  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({
      category, sourceFilter, showClosed, groupBy, horizon, collapsed: [...collapsed],
    }))
  }, [category, sourceFilter, showClosed, groupBy, horizon, collapsed])

  const [createOpen, setCreateOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set())
  const [mutationError, setMutationError] = useState<string | null>(null)

  // The job-health action routes here with ?automation=1 — a panel has no URL
  // of its own, and an action that cannot open what it describes is a dead end.
  const automationOpen = searchParams.get('automation') === '1'
  const setAutomationOpen = (open: boolean) => setSearchParams(open ? { automation: '1' } : {}, { replace: true })

  const { data: actions = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.allActions,
    queryFn: fetchAllActions,
    staleTime: 1000 * 30,
  })
  const { data: jobRuns } = useQuery({
    queryKey: QUERY_KEYS.jobRuns,
    queryFn: fetchLatestJobRuns,
    staleTime: 1000 * 60,
  })
  const unhealthyJobs = jobRuns ? gradeAllJobs(jobRuns).filter(needsAttention).length : 0

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
  // `visible` is the universe the facet counts are drawn from: everything the
  // closed/horizon switches allow, before the category and source picks. Facet
  // counts computed off the final list would read 0 for every option you have
  // not chosen, which is the one number that cannot help you choose.
  const visible = useMemo(
    () => actions.filter((a) => (showClosed || isActive(a)) && withinHorizon(a.dueDate, horizon)),
    [actions, showClosed, horizon],
  )
  const filtered = useMemo(
    () => visible.filter((a) =>
      (category === 'all' || a.category === category) && matchesSource(a, sourceFilter)),
    [visible, category, sourceFilter],
  )

  const categoryCounts = useMemo(() => {
    const bySource = visible.filter((a) => matchesSource(a, sourceFilter))
    const m = new Map<ActionCategory | 'all', number>([['all', bySource.length]])
    for (const a of bySource) m.set(a.category, (m.get(a.category) ?? 0) + 1)
    return m
  }, [visible, sourceFilter])
  const sourceCounts = useMemo(() => {
    const byCat = visible.filter((a) => category === 'all' || a.category === category)
    return {
      all: byCat.length,
      manual: byCat.filter((a) => a.isManual).length,
      derived: byCat.filter((a) => !a.isManual).length,
    }
  }, [visible, category])

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
      : CATEGORIES.filter((c) => map.has(c))
    return orderedKeys.map((k) => {
      const items = sortActions(map.get(k)!)
      return {
        key: k,
        label: groupBy === 'bucket' ? BUCKET_LABELS[k as DateBucket] : CATEGORY_LABELS[k as ActionCategory],
        count: items.length,
        clusters: clusterActions(items),
      }
    })
  }, [filtered, groupBy])

  const bucketCounts = useMemo(() => {
    const m = new Map<DateBucket, number>()
    for (const a of filtered) m.set(bucketOf(a.dueDate), (m.get(bucketOf(a.dueDate)) ?? 0) + 1)
    return m
  }, [filtered])

  const manualIdsInView = filtered.filter((a) => a.isManual).map((a) => a.manual!.id)
  const allSelected = manualIdsInView.length > 0 && manualIdsInView.every((id) => selected.has(id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(manualIdsInView))
  const toggleOne = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value); else next.add(value)
    return next
  }

  /** Band tiles navigate within the page: expand the bucket and scroll to it. */
  const focusBucket = (b: DateBucket) => {
    if (groupBy !== 'bucket') setGroupBy('bucket')
    setCollapsed((prev) => { const n = new Set(prev); n.delete(b); return n })
    requestAnimationFrame(() => {
      document.getElementById(`group-${b}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

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

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Actions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Reviews, IC decisions, alerts, at-risk timers, rebalances and manual follow-ups — one list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutomationOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Automation
            {unhealthyJobs > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-700">{unhealthyJobs}</span>
            )}
          </button>
          <button onClick={exportCsv}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Export
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

      {/* ── Summary band ─────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {BUCKET_ORDER.map((b) => {
          const n = bucketCounts.get(b) ?? 0
          const alarming = b === 'overdue' && n > 0
          return (
            <button key={b} onClick={() => focusBucket(b)} disabled={n === 0}
              className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default disabled:opacity-50 ${
                alarming ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}>
              <p className={`text-xl font-semibold tabular-nums ${alarming ? 'text-red-700' : 'text-gray-900'}`}>{n}</p>
              <p className="text-xs text-gray-500">{BUCKET_LABELS[b]}</p>
            </button>
          )
        })}
      </div>

      {mutationError && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5">
          <p className="text-sm text-red-700">{mutationError}</p>
          <button onClick={() => setMutationError(null)} className="ml-4 text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* ── Sidebar + list ───────────────────────────────────────────────── */}
      <div className="mt-5 gap-6 lg:flex">
        <aside className="mb-5 shrink-0 lg:mb-0 lg:w-52">
          <FacetList
            title="Category"
            options={[
              { value: 'all' as const, label: 'All', count: categoryCounts.get('all') ?? 0 },
              ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c], count: categoryCounts.get(c) ?? 0 })),
            ]}
            selected={category}
            onSelect={setCategory}
          />
          <FacetList
            title="Source"
            className="mt-5"
            options={[
              { value: 'all' as const, label: 'All', count: sourceCounts.all },
              { value: 'derived' as const, label: 'Automatic', count: sourceCounts.derived },
              { value: 'manual' as const, label: 'Manual', count: sourceCounts.manual },
            ]}
            selected={sourceFilter}
            onSelect={setSourceFilter}
          />

          <div className="mt-5">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">View</p>
            <div className="space-y-2 text-sm">
              <div>
                <p className="mb-1 text-xs text-gray-500">Group by</p>
                <div className="flex gap-1">
                  {(['bucket', 'category'] as GroupBy[]).map((g) => (
                    <button key={g} onClick={() => setGroupBy(g)}
                      className={`rounded px-2 py-1 text-xs ${groupBy === g ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {g === 'bucket' ? 'Due date' : 'Category'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {/* The forward calendar is long by nature; this trims how far it reaches. */}
                <p className="mb-1 text-xs text-gray-500">Horizon</p>
                <div className="flex flex-wrap gap-1">
                  {HORIZON_OPTIONS.map((h) => (
                    <button key={h} onClick={() => setHorizon(h)}
                      className={`rounded px-2 py-1 text-xs ${horizon === h ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {h === 0 ? 'All' : `${h}d`}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-1.5 pt-1 text-xs text-gray-500">
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
                Show closed
              </label>
              {manualIdsInView.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  Select all manual
                </label>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {selected.size > 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm">
              <span className="font-medium text-gray-700">{selected.size} selected</span>
              <button onClick={() => bulkMutation.mutate('close')} disabled={bulkMutation.isPending}
                className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-100 disabled:opacity-50">Close</button>
              <button onClick={() => bulkMutation.mutate('snooze')} disabled={bulkMutation.isPending}
                className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-100 disabled:opacity-50">Snooze 1w</button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-800">Clear</button>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
              <p className="text-sm text-gray-500">Nothing to act on.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const isCollapsed = collapsed.has(group.key)
                return (
                  <section key={group.key} id={`group-${group.key}`}>
                    <button onClick={() => setCollapsed((prev) => toggleSet(prev, group.key))}
                      className="mb-1.5 flex w-full items-center gap-2 text-left">
                      <svg className={`h-3 w-3 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                      <h2 className="text-sm font-semibold text-gray-900">{group.label}</h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-500">
                        {group.count}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                              <th className="w-8" />
                              <th className="px-3 py-2">Task</th>
                              <th className="hidden px-3 py-2 md:table-cell">Linked</th>
                              <th className="px-3 py-2">Due</th>
                              <th className="px-3 py-2">Priority</th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {group.clusters.map((c) => (
                              <ClusterRows
                                key={c.key} cluster={c} navigate={navigate}
                                open={openClusters.has(c.key)}
                                onToggleOpen={() => setOpenClusters((p) => toggleSet(p, c.key))}
                                selected={selected} onToggleSelect={toggleOne}
                                expandedId={expandedId}
                                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                                onStatus={(id, status) => statusMutation.mutate({ id, status })}
                                onSnooze={(id) => snoozeMutation.mutate(id)}
                                onDelete={(id) => deleteMutation.mutate(id)}
                                busy={statusMutation.isPending || deleteMutation.isPending || snoozeMutation.isPending}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <CreateActionItemModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <AutomationPanel open={automationOpen} onClose={() => setAutomationOpen(false)} />
    </div>
  )
}

// ── Sidebar facet ───────────────────────────────────────────────────────────
function FacetList<T extends string>({
  title, options, selected, onSelect, className = '',
}: {
  title: string
  options: { value: T; label: string; count: number }[]
  selected: T
  onSelect: (v: T) => void
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <ul className="space-y-0.5">
        {options.map((o) => (
          <li key={o.value}>
            <button onClick={() => onSelect(o.value)}
              className={`flex w-full items-center justify-between rounded px-2 py-1 text-sm ${
                selected === o.value ? 'bg-gray-900 font-medium text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <span>{o.label}</span>
              <span className={`tabular-nums text-xs ${selected === o.value ? 'text-gray-300' : 'text-gray-400'}`}>
                {o.count}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── One cluster: a single row, or a summary line over its members ───────────
function ClusterRows({
  cluster, open, onToggleOpen, ...rest
}: {
  cluster: ActionCluster
  open: boolean
  onToggleOpen: () => void
} & RowHandlers) {
  if (cluster.label == null) return <ActionRow action={cluster.items[0]} {...rest} />

  const overdue = cluster.items[0].dueDate != null && new Date(cluster.items[0].dueDate) < new Date()
  return (
    <>
      <tr className="bg-gray-50/60">
        <td className="w-8" />
        <td colSpan={5} className="px-3 py-2">
          <button onClick={onToggleOpen} className="flex items-center gap-2 text-left">
            <svg className={`h-3 w-3 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-sm font-medium text-gray-800">{cluster.label}</span>
            {overdue && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                {agingLabel(cluster.items[0].dueDate)}
              </span>
            )}
            <span className="text-xs text-gray-400">{open ? 'Hide' : 'Show'}</span>
          </button>
        </td>
      </tr>
      {open && cluster.items.map((a) => <ActionRow key={a.key} action={a} indent {...rest} />)}
    </>
  )
}

interface RowHandlers {
  navigate: (to: string) => void
  selected: Set<number>
  onToggleSelect: (id: number) => void
  expandedId: number | null
  onToggleExpand: (id: number) => void
  onStatus: (id: number, status: ActionStatus) => void
  onSnooze: (id: number) => void
  onDelete: (id: number) => void
  busy: boolean
}

// ── One row: manual (editable) or derived (route-to-source) ─────────────────
function ActionRow({
  action: a, indent = false, navigate, selected, onToggleSelect,
  expandedId, onToggleExpand, onStatus, onSnooze, onDelete, busy,
}: { action: UnifiedAction; indent?: boolean } & RowHandlers) {
  const id = a.isManual ? a.manual!.id : null
  const closed = a.isManual && a.manual!.status === 'closed'
  const overdue = a.dueDate != null && new Date(a.dueDate) < new Date() && !closed
  const recurrence = a.isManual ? a.manual!.recurrence : 'none'
  const expanded = id != null && expandedId === id
  const aging = agingLabel(a.dueDate)

  return (
    <>
      {/* An overdue row is marked on its edge and on its date, not washed red:
          48 red rows is a red page, which signals nothing at all. */}
      <tr className={overdue ? 'border-l-2 border-l-red-400' : ''}>
        <td className="w-8 pl-3 align-top">
          {id != null && (
            <input type="checkbox" className="mt-3" checked={selected.has(id)} onChange={() => onToggleSelect(id)} />
          )}
        </td>
        <td className={`py-2 pr-3 ${indent ? 'pl-6' : 'px-3'}`}>
          <div className="flex items-start gap-2">
            {id != null && (
              <button type="button" onClick={() => onToggleExpand(id)} title="Status history"
                className="mt-1 shrink-0 text-gray-300 hover:text-gray-600">
                <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`font-medium ${closed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{a.title}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  {SOURCE_LABELS[a.source]}
                </span>
                {recurrence !== 'none' && (
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                    ↻ {RECURRENCE_LABELS[recurrence]}
                  </span>
                )}
              </div>
              {a.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{a.subtitle}</p>}
            </div>
          </div>
        </td>
        <td className="hidden whitespace-nowrap px-3 py-2 align-top text-xs text-gray-500 md:table-cell">
          <span className="mt-0.5 block">{a.linkedLabel ?? '—'}</span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 align-top text-xs">
          {a.dueDate ? (
            <>
              <span className={overdue ? 'font-medium text-red-600' : 'text-gray-600'}>{formatDate(a.dueDate)}</span>
              {/* How late matters as much as late: a four-month miss and a
                  one-day miss are different problems with the same badge. */}
              {aging && <span className={`mt-0.5 block ${overdue ? 'text-red-400' : 'text-gray-400'}`}>{aging}</span>}
            </>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-3 py-2 align-top"><StatusBadge variant={a.priority} /></td>
        <td className="whitespace-nowrap px-3 py-2 text-right align-top">
          {id != null ? (
            <div className="flex items-center justify-end gap-2">
              <select value={a.manual!.status} disabled={busy}
                onChange={(e) => onStatus(id, e.target.value as ActionStatus)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none disabled:opacity-50">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting">Waiting</option>
                <option value="blocked">Blocked</option>
                <option value="closed">Closed</option>
              </select>
              <button onClick={() => onSnooze(id)} disabled={busy}
                className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50">Snooze</button>
              <button onClick={() => onDelete(id)} disabled={busy}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">Delete</button>
            </div>
          ) : (
            <button onClick={() => a.route && navigate(a.route)} disabled={!a.route}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              Open →
            </button>
          )}
        </td>
      </tr>
      {expanded && id != null && (
        <tr>
          <td colSpan={6} className="bg-gray-50 px-10 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Status history</p>
            <ActionItemTimeline actionItemId={id} />
          </td>
        </tr>
      )}
    </>
  )
}
