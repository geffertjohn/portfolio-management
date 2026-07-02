import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  startOrResumeDraft, saveReviewDraft, completeReview, nextReviewDateFor,
  CADENCE_LABELS, PORTFOLIO_CADENCES,
  type PortfolioCadence, type ReviewChecklistItem,
} from '@/lib/portfolioReviews'
import {
  saveHoldingReviews, fetchHoldingReviewsForLog, fetchHoldingReviewsByPortfolio, emptyAssessment, resolveTierInfo,
  type HoldingAssessment, type MonitorConviction,
} from '@/lib/holdingReviews'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { usePortfolio, usePositions, useResolvedModelPortfolio } from '@/hooks/usePortfolio'
import { DetailPageState } from '@/components/DetailPageState'
import { AttributionMovers } from '@/components/AttributionMovers'
import { PositionSizingCheck } from '@/components/PositionSizingCheck'
import { HoldingMonitorGrid } from '@/components/HoldingMonitorGrid'
import { ThesisScorecardSection } from '@/components/ThesisScorecardSection'
import { WatchlistStatusSection } from '@/components/WatchlistStatusSection'
import { DeepReviewSection } from '@/components/DeepReviewSection'
import { ConvictionRankingSection } from '@/components/ConvictionRankingSection'
import { PortfolioConstructionSection } from '@/components/PortfolioConstructionSection'
import { formatDate } from '@/lib/fundFormat'

const SUMMARY = '__summary__'

function isCadence(v: string | undefined): v is PortfolioCadence {
  return !!v && (PORTFOLIO_CADENCES as string[]).includes(v)
}

export function PortfolioReviewWorkspace() {
  const { portfolioId, cadence: cadenceParam } = useParams<{ portfolioId: string; cadence: string }>()
  const id = portfolioId ? decodeURIComponent(portfolioId) : ''
  const cadence = isCadence(cadenceParam) ? cadenceParam : null
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: portfolio, isLoading: pLoading, error: pError } = usePortfolio(id)
  const { data: positions = [] } = usePositions(id, !!portfolio)
  const modelPortfolio = useResolvedModelPortfolio(portfolio)

  // Prior conviction per security (most recent from history) — a hint in the
  // annual conviction-ranking section. Only fetched for the annual cadence.
  const { data: holdingHistory = [] } = useQuery({
    queryKey: QUERY_KEYS.holdingReviews(id),
    queryFn: () => fetchHoldingReviewsByPortfolio(id),
    enabled: !!id && cadence === 'annual',
  })
  const recentConviction = useMemo(() => {
    const map: Record<string, MonitorConviction> = {}
    for (const r of holdingHistory) {
      if (r.conviction && !(r.securityId in map)) map[r.securityId] = r.conviction
    }
    return map
  }, [holdingHistory])

  // The cadence's current due date (for a new draft's review_date).
  const { data: schedules = [] } = useQuery({
    queryKey: QUERY_KEYS.portfolioReviewSchedulesFor(id),
    queryFn: () => import('@/lib/portfolioReviews').then((m) => m.fetchPortfolioReviewSchedulesFor(id)),
    enabled: !!id,
  })
  const dueDate = schedules.find((s) => s.cadence === cadence)?.next_review_at ?? null

  // Start or resume the draft once the due date is known.
  const { data: init, isLoading: dLoading, error: dError } = useQuery({
    queryKey: ['review_workspace', id, cadence],
    queryFn: async () => {
      const draft = await startOrResumeDraft(id, cadence!, dueDate)
      const holdings = await fetchHoldingReviewsForLog(draft.id)
      return { draft, holdings }
    },
    enabled: !!id && !!cadence && schedules.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    // Drop the cache on unmount so a return visit re-runs start-or-resume
    // (after completing, there's no open draft → a fresh one is created then,
    // not via a mid-session refetch).
    gcTime: 0,
  })

  // ── Edit state (seeded from the draft) ──────────────────────────────────
  const [items, setItems] = useState<ReviewChecklistItem[]>([])
  const [notes, setNotes] = useState('')
  const [reviewedDate, setReviewedDate] = useState(new Date().toISOString().slice(0, 10))
  const [nextDate, setNextDate] = useState('')
  const [assessments, setAssessments] = useState<Record<string, HoldingAssessment>>({})
  const [active, setActive] = useState<string>('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!init || !cadence) return
    setItems(init.draft.checklist)
    setNotes(init.draft.notes ?? '')
    const today = new Date().toISOString().slice(0, 10)
    setReviewedDate(today)
    setNextDate(init.draft.nextReviewAt?.slice(0, 10) ?? nextReviewDateFor(cadence, new Date()).slice(0, 10))
    const map: Record<string, HoldingAssessment> = {}
    for (const h of init.holdings) {
      map[h.securityId] = { ...emptyAssessment(h.securityId), ...h }
    }
    setAssessments(map)
    setActive(init.draft.checklist[0]?.key ?? SUMMARY)
    setDirty(false)
  }, [init, cadence])

  const draftId = init?.draft.id ?? null

  // ── Mutations ───────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async () => {
      if (draftId == null) return
      await saveReviewDraft(draftId, {
        checklist: items,
        notes: notes.trim() || null,
        nextReviewAt: nextDate ? new Date(nextDate + 'T00:00:00') : null,
      })
      await saveHoldingReviews(draftId, id, Object.values(assessments))
    },
    onSuccess: () => setDirty(false),
  })

  const completeMut = useMutation({
    mutationFn: async () => {
      if (draftId == null || !cadence) throw new Error('No draft')
      const reviewedAt = new Date(reviewedDate + 'T00:00:00')
      await saveHoldingReviews(draftId, id, Object.values(assessments), reviewedAt)
      await completeReview({
        reviewLogId: draftId,
        portfolioName: id,
        cadence,
        checklist: items,
        notes: notes.trim() || null,
        reviewedAt,
        reviewDate: init?.draft.reviewDate ? new Date(init.draft.reviewDate) : null,
        nextReviewAt: nextDate ? new Date(nextDate + 'T00:00:00') : null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolioReviews(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolioReviewSchedulesFor(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolioReviewSchedules })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.holdingReviews(id) })
      // Don't invalidate the workspace query here — it would refetch while still
      // mounted and spawn a fresh draft. gcTime:0 drops it on unmount instead.
      navigate(`/portfolio/${encodeURIComponent(id)}`)
    },
  })

  // Debounced autosave (1.5s idle) — also save manually / on complete.
  useEffect(() => {
    if (!dirty || draftId == null || saveMut.isPending) return
    const t = setTimeout(() => saveMut.mutate(), 1500)
    return () => clearTimeout(t)
  }, [dirty, draftId, items, notes, nextDate, assessments]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Editing helpers ──────────────────────────────────────────────────────
  const markDirty = () => setDirty(true)
  const toggleDone = (key: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, done: !it.done } : it)))
    markDirty()
  }
  const setSectionNotes = (key: string, value: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, notes: value || null } : it)))
    markDirty()
  }
  const setHoldingField = (
    securityId: string,
    field: keyof HoldingAssessment,
    value: string | number | boolean | null,
  ) => {
    setAssessments((prev) => {
      const cur = prev[securityId] ?? emptyAssessment(securityId)
      const v = value === '' ? null : value
      return { ...prev, [securityId]: { ...cur, [field]: v } }
    })
    markDirty()
  }

  if (pLoading || pError || !portfolio || !cadence) {
    return (
      <DetailPageState
        backTo={`/portfolio/${encodeURIComponent(id)}`}
        backLabel="← Back to portfolio"
        loading={pLoading}
        error={pError}
        notFound={!portfolio || !cadence}
        errorTitle="Failed to load review"
        notFoundText={!cadence ? 'Unknown review cadence.' : 'Portfolio not found.'}
      />
    )
  }

  const sections = [...items.map((it) => ({ key: it.key, label: it.label })), { key: SUMMARY, label: 'Summary & complete' }]
  const doneCount = items.filter((it) => it.done).length
  const activeItem = items.find((it) => it.key === active)
  const saveLabel = saveMut.isPending ? 'Saving…' : dirty ? 'Save draft' : 'Saved'

  return (
    <div>
      <Link to={`/portfolio/${encodeURIComponent(id)}`} className="text-sm text-gray-600 hover:text-gray-900">
        ← Back to {portfolio.name}
      </Link>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{CADENCE_LABELS[cadence]} Review</h1>
          <span className="text-sm text-gray-500">{portfolio.name}</span>
          {init?.draft.reviewDate && (
            <span className="text-xs text-gray-400">Due {formatDate(init.draft.reviewDate)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{doneCount}/{items.length} sections</span>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || (!dirty && !saveMut.isError)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saveLabel}
          </button>
          <button
            type="button"
            onClick={() => completeMut.mutate()}
            disabled={completeMut.isPending || dLoading || draftId == null}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {completeMut.isPending ? 'Completing…' : 'Complete review'}
          </button>
        </div>
      </div>

      {(dError || completeMut.isError) && (
        <p className="mt-3 text-sm text-red-600">
          {(dError ?? completeMut.error) instanceof Error ? (dError ?? completeMut.error as Error).message : 'Something went wrong'}
        </p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Section nav */}
        <nav className="space-y-1">
          {sections.map((s) => {
            const it = items.find((i) => i.key === s.key)
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  active === s.key ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {it && <span className={it.done ? 'text-green-400' : active === s.key ? 'text-gray-400' : 'text-gray-300'}>{it.done ? '✓' : '○'}</span>}
                <span className="flex-1">{s.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Active section */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          {dLoading ? (
            <p className="text-sm text-gray-500">Loading review…</p>
          ) : active === SUMMARY ? (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Summary &amp; complete</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700">Summary notes <span className="text-gray-400">(optional)</span></label>
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); markDirty() }}
                  rows={3}
                  placeholder="Key findings, decisions, follow-ups…"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date reviewed</label>
                  <input type="date" value={reviewedDate} onChange={(e) => setReviewedDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Next review due</label>
                  <input type="date" value={nextDate} onChange={(e) => { setNextDate(e.target.value); markDirty() }}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
                </div>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {items.map((it) => (
                  <li key={it.key} className="flex items-center gap-2">
                    <span className={it.done ? 'text-green-600' : 'text-gray-300'}>{it.done ? '✓' : '○'}</span>
                    <span className="text-gray-700">{it.label}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => completeMut.mutate()}
                disabled={completeMut.isPending || draftId == null}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {completeMut.isPending ? 'Completing…' : 'Complete review'}
              </button>
            </div>
          ) : activeItem ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{activeItem.label}</h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={activeItem.done} onChange={() => toggleDone(activeItem.key)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                  Mark reviewed
                </label>
              </div>

              {active === 'performance_attribution' && <AttributionMovers portfolioId={id} days={30} />}
              {active === 'position_sizing' && <PositionSizingCheck positions={positions} modelPortfolio={modelPortfolio} portfolioName={id} />}
              {active === 'full_monitoring' && (
                <HoldingMonitorGrid positions={positions} assessments={assessments} onChange={setHoldingField} />
              )}
              {active === 'thesis_scorecards' && (
                <ThesisScorecardSection positions={positions} assessments={assessments} onChange={setHoldingField} />
              )}
              {active === 'watchlist_status' && (
                <WatchlistStatusSection positions={positions} assessments={assessments} onChange={setHoldingField} />
              )}
              {active === 'deep_review' && (
                <DeepReviewSection positions={positions} assessments={assessments} onChange={setHoldingField} />
              )}
              {active === 'conviction_rankings' && (
                <ConvictionRankingSection positions={positions} assessments={assessments} tierInfo={resolveTierInfo(modelPortfolio)} recentConviction={recentConviction} onChange={setHoldingField} />
              )}
              {active === 'portfolio_construction' && (
                <PortfolioConstructionSection positions={positions} />
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">Section notes <span className="text-gray-400">(optional)</span></label>
                <textarea
                  value={activeItem.notes ?? ''}
                  onChange={(e) => setSectionNotes(activeItem.key, e.target.value)}
                  rows={2}
                  placeholder="Notes for this section…"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
