import { useEffect, useState } from 'react'
import type { ActionCategory } from '@/lib/actionItems'
import type { GroupBy, Horizon, SourceFilter } from '@/lib/actions'

/**
 * The Actions page's working view, persisted per device.
 *
 * Extracted from `ActionItemsPage` (audit §22) because it owns a **storage
 * schema**, and a storage schema living inline in a 651-line page is how the
 * shape and the key version drift apart. Six pieces of state, one key, one
 * place that knows how to read a value written by an older build.
 *
 * This is device-local UI state and nothing else — the one legitimate use of
 * localStorage in this app, alongside nothing now that the write-only
 * notification settings page is gone. **Never put a governed value here**: the
 * committee only ever sees Supabase, which is why the firm-settings store was
 * deleted and must not come back.
 */

const FILTERS_KEY = 'actions_filters_v2'

/**
 * Collapsed by default: the forward calendar, not the worklist.
 *
 * "Upcoming" is every schedule whose date is more than a week out — 80 rows of
 * "this reports in six weeks". They are real and they stay on the page, but
 * rendering them open by default buried the ~15 rows that actually need doing.
 */
export const DEFAULT_COLLAPSED = ['upcoming', 'no_date']

export interface ActionFilters {
  category: ActionCategory | 'all'
  sourceFilter: SourceFilter
  showClosed: boolean
  groupBy: GroupBy
  horizon: Horizon
  collapsed: Set<string>
}

interface SavedFilters {
  category: ActionCategory | 'all'
  sourceFilter: SourceFilter
  showClosed: boolean
  groupBy: GroupBy
  horizon: Horizon
  collapsed: string[]
}

/**
 * A read must never throw. The value can be absent, truncated, or written by a
 * build with a different shape, and none of those is a reason to fail to render
 * the page — the defaults are all perfectly good.
 */
function loadFilters(): Partial<SavedFilters> {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Partial<SavedFilters> : {}
  } catch {
    return {}
  }
}

export interface UseActionFilters extends ActionFilters {
  setCategory: (v: ActionCategory | 'all') => void
  setSourceFilter: (v: SourceFilter) => void
  setShowClosed: (v: boolean) => void
  setGroupBy: (v: GroupBy) => void
  setHorizon: (v: Horizon) => void
  setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useActionFilters(): UseActionFilters {
  const [saved] = useState(loadFilters)

  const [category, setCategory] = useState<ActionCategory | 'all'>(saved.category ?? 'all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(saved.sourceFilter ?? 'all')
  const [showClosed, setShowClosed] = useState(saved.showClosed ?? false)
  const [groupBy, setGroupBy] = useState<GroupBy>(saved.groupBy ?? 'bucket')
  const [horizon, setHorizon] = useState<Horizon>(saved.horizon ?? 0)
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(saved.collapsed ?? DEFAULT_COLLAPSED),
  )

  useEffect(() => {
    // A write must never throw either — private windows and blocked site data
    // both make setItem raise, and losing a remembered filter is not a reason
    // to break the page.
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({
        category, sourceFilter, showClosed, groupBy, horizon, collapsed: [...collapsed],
      }))
    } catch { /* device-local convenience only */ }
  }, [category, sourceFilter, showClosed, groupBy, horizon, collapsed])

  return {
    category, sourceFilter, showClosed, groupBy, horizon, collapsed,
    setCategory, setSourceFilter, setShowClosed, setGroupBy, setHorizon, setCollapsed,
  }
}
