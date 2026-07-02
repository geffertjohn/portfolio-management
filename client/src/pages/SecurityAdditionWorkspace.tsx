import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchCandidate, saveCandidateDraft, completeCandidate,
  ADDITION_STAGES, DECISION_LABELS, DECISION_BADGE,
  type AdditionChecklistItem, type FieldDef, type AdditionDecision,
} from '@/lib/securityAdditions'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { usePortfolio } from '@/hooks/usePortfolio'
import { DetailPageState } from '@/components/DetailPageState'
import { ICReviewPanel } from '@/components/ICReviewPanel'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'

const SUMMARY = '__summary__'
const IC_REVIEW = '__ic_review__'

export function SecurityAdditionWorkspace() {
  const { portfolioId, additionId } = useParams<{ portfolioId: string; additionId: string }>()
  const id = portfolioId ? decodeURIComponent(portfolioId) : ''
  const candidateId = additionId ? parseInt(additionId, 10) : NaN
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: portfolio } = usePortfolio(id)
  const { data: candidate, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.securityAddition(candidateId),
    queryFn: () => fetchCandidate(candidateId),
    enabled: Number.isFinite(candidateId),
    gcTime: 0,
  })

  const [content, setContent] = useState<Record<string, unknown>>({})
  const [checklist, setChecklist] = useState<AdditionChecklistItem[]>([])
  const [active, setActive] = useState<string>(ADDITION_STAGES[0].key)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!candidate) return
    setContent(candidate.content ?? {})
    setChecklist(candidate.checklist?.length ? candidate.checklist : ADDITION_STAGES.map((s) => ({ key: s.key, label: s.label, done: false, notes: null })))
    setDirty(false)
  }, [candidate])

  const saveMut = useMutation({
    mutationFn: () => saveCandidateDraft(candidateId, { content, checklist }),
    onSuccess: () => setDirty(false),
  })
  const completeMut = useMutation({
    mutationFn: () => completeCandidate(candidateId, { content, checklist }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securityAdditions(id) })
      navigate(`/portfolio/${encodeURIComponent(id)}`)
    },
  })

  // Debounced autosave (1.5s idle).
  useEffect(() => {
    if (!dirty || !Number.isFinite(candidateId) || saveMut.isPending) return
    const t = setTimeout(() => saveMut.mutate(), 1500)
    return () => clearTimeout(t)
  }, [dirty, content, checklist]) // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (key: string, value: string) => {
    setContent((prev) => ({ ...prev, [key]: value === '' ? null : value }))
    setDirty(true)
  }
  const toggleDone = (key: string) => {
    setChecklist((prev) => prev.map((it) => (it.key === key ? { ...it, done: !it.done } : it)))
    setDirty(true)
  }

  if (isLoading || error || !candidate) {
    return (
      <DetailPageState
        backTo={`/portfolio/${encodeURIComponent(id)}`}
        backLabel="← Back to portfolio"
        loading={isLoading}
        error={error}
        notFound={!candidate}
        errorTitle="Failed to load candidate"
        notFoundText="Candidate not found."
      />
    )
  }

  const stages = [
    ...ADDITION_STAGES.map((s) => ({ key: s.key, label: s.label })),
    { key: IC_REVIEW, label: 'IC Review · AI committee' },
    { key: SUMMARY, label: 'Summary & complete' },
  ]
  const doneCount = checklist.filter((it) => it.done).length
  const activeStage = ADDITION_STAGES.find((s) => s.key === active)
  const activeItem = checklist.find((it) => it.key === active)
  const decision = (content.decision as AdditionDecision | null) ?? null

  const field = (f: FieldDef) => {
    const val = (content[f.key] as string | null) ?? ''
    const base = 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500'
    return (
      <div key={f.key}>
        <label className="block text-sm font-medium text-gray-700">{f.label}</label>
        {f.guidance && <p className="mt-0.5 text-xs text-gray-400">{f.guidance}</p>}
        {f.type === 'textarea' ? (
          <AutoGrowTextarea
            value={val}
            onChange={(v) => setField(f.key, v)}
            placeholder={f.placeholder}
            className={`${base} min-h-[4.5rem] resize-none overflow-hidden leading-relaxed`}
          />
        ) : f.type === 'select' ? (
          <select value={val} onChange={(e) => setField(f.key, e.target.value)} className={base}>
            <option value="">—</option>
            {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <div className="relative">
            <input
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={val}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.placeholder}
              className={base}
            />
            {f.unit && f.type === 'number' && <span className="pointer-events-none absolute right-3 top-2 text-sm text-gray-400">{f.unit}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <Link to={`/portfolio/${encodeURIComponent(id)}`} className="text-sm text-gray-600 hover:text-gray-900">
        ← Back to {portfolio?.name ?? 'portfolio'}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Add Security</h1>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-sm font-medium text-gray-700">{candidate.security_id}</span>
          <span className="text-sm text-gray-500">{id}</span>
          {candidate.status === 'completed' && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Completed</span>}
          {decision && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DECISION_BADGE[decision]}`}>{DECISION_LABELS[decision]}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{doneCount}/{ADDITION_STAGES.length} stages</span>
          <button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !dirty}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
          </button>
          <button type="button" onClick={() => completeMut.mutate()} disabled={completeMut.isPending}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {completeMut.isPending ? 'Completing…' : 'Complete'}
          </button>
        </div>
      </div>

      {completeMut.isError && (
        <p className="mt-3 text-sm text-red-600">{completeMut.error instanceof Error ? completeMut.error.message : 'Something went wrong'}</p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[210px_1fr]">
        <nav className="space-y-1">
          {stages.map((s) => {
            const it = checklist.find((i) => i.key === s.key)
            return (
              <button key={s.key} type="button" onClick={() => setActive(s.key)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${active === s.key ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                {it && <span className={it.done ? 'text-green-400' : active === s.key ? 'text-gray-400' : 'text-gray-300'}>{it.done ? '✓' : '○'}</span>}
                <span className="flex-1">{s.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          {active === IC_REVIEW ? (
            <ICReviewPanel additionId={candidateId} ticker={candidate.security_id} />
          ) : active === SUMMARY ? (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Summary &amp; complete</h2>
              <ul className="space-y-1 text-sm">
                {ADDITION_STAGES.map((s) => {
                  const it = checklist.find((i) => i.key === s.key)
                  return (
                    <li key={s.key} className="flex items-center gap-2">
                      <span className={it?.done ? 'text-green-600' : 'text-gray-300'}>{it?.done ? '✓' : '○'}</span>
                      <span className="text-gray-700">{s.label}</span>
                      {s.output && it?.done && <span className="text-xs text-gray-400">→ {s.output}</span>}
                    </li>
                  )
                })}
              </ul>
              <p className="text-sm text-gray-600">Decision: {decision ? DECISION_LABELS[decision] : <span className="text-gray-400">not set (Approval Decision stage)</span>}</p>
              <button type="button" onClick={() => completeMut.mutate()} disabled={completeMut.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {completeMut.isPending ? 'Completing…' : 'Complete'}
              </button>
            </div>
          ) : activeStage ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{activeStage.label}</h2>
                  {activeStage.purpose && <p className="mt-1 text-sm text-gray-500">{activeStage.purpose}</p>}
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={activeItem?.done ?? false} onChange={() => toggleDone(activeStage.key)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500" />
                  Mark done
                </label>
              </div>
              {activeStage.guidance && (
                <ul className="rounded-md border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500 space-y-1">
                  {activeStage.guidance.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              )}
              <div className="space-y-4">
                {activeStage.fields.map((f) => field(f))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
