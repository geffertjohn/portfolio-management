/**
 * SecurityThesisPanel.tsx
 *
 * The investment thesis for a stock: the current version of record, the full
 * revision history, and the editor for the open draft.
 *
 * One thesis per SECURITY — it does not vary by portfolio, and most of these
 * names are held in several. Published versions are immutable (the database
 * enforces it), so the editor only ever writes to a draft, and "Save as thesis"
 * is a deliberate, one-way act that renders and uploads the PDF in the same
 * step.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import {
  fetchThesisHistory, startOrResumeThesisDraft, saveThesisDraft, discardThesisDraft,
  publishThesis, fetchThesisSeedFromResearch,
  type SecurityThesis, type ThesisPoint, type ThesisDraftFields,
} from '@/lib/securityTheses'
import type { Rating, Conviction } from '@/lib/researchReports'
import {
  RECOMMENDATION_OPTIONS, RECOMMENDATION_LABELS, RECOMMENDATION_COLORS,
  CONVICTION_OPTIONS, CONVICTION_LABELS,
} from '@/lib/reviewLog'
import { buildThesisPdf } from '@/lib/thesisPdf'
import { uploadFile, getSignedUrl, SECURITY_DOCS_BUCKET } from '@/lib/documents'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { EMPTY } from '@/lib/formatters'

interface Props {
  ticker: string
  securityName: string | null
}

const blankPoint = (prefix: string, n: number): ThesisPoint => ({
  key: `${prefix}-${n}`, reason: '', context: '',
})

function fmtWhen(iso: string | null): string {
  if (!iso) return EMPTY
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function SecurityThesisPanel({ ticker, securityName }: Props) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [revisePrompt, setRevisePrompt] = useState(false)
  const [reviseReason, setReviseReason] = useState('')
  const [openHistory, setOpenHistory] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const { data: versions = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.securityTheses(ticker),
    queryFn: () => fetchThesisHistory(ticker),
  })

  const draft = versions.find((v) => v.status === 'draft') ?? null
  const current = versions.find((v) => v.status === 'current') ?? null
  const past = versions.filter((v) => v.status === 'superseded')

  // ── Draft edit state ──────────────────────────────────────────────────────
  const [thesis, setThesis] = useState('')
  const [bull, setBull] = useState<ThesisPoint[]>([])
  const [bear, setBear] = useState<ThesisPoint[]>([])
  const [rating, setRating] = useState<Rating | ''>('')
  const [conviction, setConviction] = useState<Conviction | ''>('')
  const [sourceIds, setSourceIds] = useState<number[]>([])

  // Seed from the draft row on identity only. Including the editable fields
  // would let a background refetch (TanStack refetches on window focus) wipe
  // edits in progress — the trap that lost Alt-ticker edits before.
  const seededFor = useRef<number | null>(null)
  useEffect(() => {
    if (!draft || seededFor.current === draft.id) return
    seededFor.current = draft.id
    setThesis(draft.thesis ?? '')
    setBull(draft.bullCase)
    setBear(draft.bearCase)
    setRating(draft.rating ?? '')
    setConviction(draft.conviction ?? '')
    setSourceIds(draft.sourceReportIds)
    setEditing(true)
  }, [draft])

  const fields = (): ThesisDraftFields => ({
    thesis: thesis.trim() ? thesis : null,
    bullCase: bull.filter((p) => p.reason.trim() || p.context.trim()),
    bearCase: bear.filter((p) => p.reason.trim() || p.context.trim()),
    rating: rating || null,
    conviction: conviction || null,
    sourceReportIds: sourceIds,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securityTheses(ticker) })

  const startDraft = useMutation({
    mutationFn: (reason?: string) => startOrResumeThesisDraft(ticker, reason),
    onSuccess: () => { setErr(null); setRevisePrompt(false); setReviseReason(''); invalidate() },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not open a draft.'),
  })

  const save = useMutation({
    mutationFn: () => saveThesisDraft(draft!.id, fields()),
    onSuccess: () => { setErr(null); invalidate() },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not save the draft.'),
  })

  const discard = useMutation({
    mutationFn: () => discardThesisDraft(draft!.id),
    onSuccess: () => { seededFor.current = null; setEditing(false); invalidate() },
  })

  const seed = useMutation({
    mutationFn: () => fetchThesisSeedFromResearch(ticker),
    onSuccess: (s) => {
      // Fill only what is still empty — never overwrite the advisor's own words.
      if (!thesis.trim() && s.thesis) setThesis(s.thesis)
      if (bull.length === 0) setBull(s.bullCase)
      if (bear.length === 0) setBear(s.bearCase)
      if (!rating && s.rating) setRating(s.rating)
      if (!conviction && s.conviction) setConviction(s.conviction)
      setSourceIds((prev) => [...new Set([...prev, ...s.sourceReportIds])])
      setErr(
        s.sourceReportIds.length === 0
          ? 'No AI research found for this ticker yet.'
          : s.sourcedFrom && s.sourcedFrom !== 'initial'
            // Be explicit: a brief is a read on one quarter, not a reason to own
            // the company. Pasting one into a thesis of record is a trap.
            ? 'Drafted from an earnings brief — there is no foundational research report for this ticker. Rewrite it as a durable thesis before adopting.'
            : null,
      )
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not read the research reports.'),
  })

  /**
   * Publish. The PDF is built and uploaded FIRST, and only then is the row
   * promoted — the database rejects a published row without a document path, so
   * a failed upload leaves the draft exactly as it was rather than creating a
   * thesis of record with no evidence behind it.
   */
  const publish = useMutation({
    mutationFn: async () => {
      const f = fields()
      if (!f.thesis) throw new Error('A thesis needs its statement before it can be adopted.')
      const authoredAt = new Date()
      const { blob, filename } = buildThesisPdf({
        ticker, securityName,
        version: draft!.version,
        revisionReason: draft!.revisionReason,
        thesis: f.thesis, bullCase: f.bullCase, bearCase: f.bearCase,
        rating: f.rating, conviction: f.conviction, authoredAt,
      })
      // Persist the path the server RETURNS — it date-prefixes and sanitises the
      // name, so a path derived here points at a file that does not exist.
      const path = await uploadFile(ticker, new File([blob], filename, { type: 'application/pdf' }), SECURITY_DOCS_BUCKET)
      await publishThesis(draft!.id, ticker, f, path)
    },
    onSuccess: () => {
      seededFor.current = null
      setEditing(false)
      setErr(null)
      invalidate()
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.documentsFiles(SECURITY_DOCS_BUCKET) })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not adopt the thesis.'),
  })

  async function openPdf(path: string | null) {
    if (!path) return
    try {
      window.open(await getSignedUrl(path, SECURITY_DOCS_BUCKET), '_blank', 'noopener')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the document.')
    }
  }

  // ── Point list editor ─────────────────────────────────────────────────────
  const pointEditor = (
    label: string,
    hint: string,
    points: ThesisPoint[],
    setPoints: (p: ThesisPoint[]) => void,
    prefix: string,
    accent: string,
  ) => (
    <div>
      <div className="flex items-baseline justify-between">
        <h4 className={`text-sm font-semibold ${accent}`}>{label}</h4>
        <span className="text-xs text-gray-400">{hint}</span>
      </div>
      <div className="mt-2 space-y-2">
        {points.map((p, i) => (
          <div key={p.key} className="rounded-md border border-gray-200 p-2">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-4 shrink-0 text-right text-xs text-gray-400">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  value={p.reason}
                  onChange={(e) => setPoints(points.map((q, j) => j === i ? { ...q, reason: e.target.value } : q))}
                  placeholder="Reason — the claim in a line"
                  className="block w-full rounded border border-gray-300 px-2 py-1 text-sm font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
                />
                <AutoGrowTextarea
                  value={p.context}
                  onChange={(v) => setPoints(points.map((q, j) => j === i ? { ...q, context: v } : q))}
                  placeholder="Context — the evidence behind it"
                  className="block w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setPoints(points.filter((_, j) => j !== i))}
                className="mt-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label={`Remove ${label} point ${i + 1}`}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPoints([...points, blankPoint(prefix, points.length + 1)])}
          className="rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50"
        >
          + Add {label.toLowerCase()} point
        </button>
      </div>
    </div>
  )

  const pointList = (points: ThesisPoint[], accent: string) =>
    points.length === 0 ? (
      <p className="mt-2 text-sm text-gray-400">None recorded.</p>
    ) : (
      <ol className="mt-2 space-y-2">
        {points.map((p, i) => (
          <li key={p.key} className="flex gap-2 text-sm">
            <span className="w-4 shrink-0 text-right text-xs text-gray-400">{i + 1}</span>
            <div className="min-w-0">
              <p className={`font-medium ${accent}`}>{p.reason || EMPTY}</p>
              {p.context && <p className="text-gray-600">{p.context}</p>}
            </div>
          </li>
        ))}
      </ol>
    )

  const badges = (v: SecurityThesis) => (
    <div className="flex flex-wrap items-center gap-2">
      {v.rating && (
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${RECOMMENDATION_COLORS[v.rating]}`}>
          {RECOMMENDATION_LABELS[v.rating]}
        </span>
      )}
      {v.conviction && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
          {CONVICTION_LABELS[v.conviction]}
        </span>
      )}
    </div>
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Investment Thesis</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            One thesis for {ticker}, independent of which portfolios hold it. Adopted versions cannot be edited.
          </p>
        </div>
        {!editing && !isLoading && (
          current ? (
            <button
              type="button"
              onClick={() => setRevisePrompt(true)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Revise thesis
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startDraft.mutate(undefined)}
              disabled={startDraft.isPending}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {startDraft.isPending ? 'Opening…' : 'Write thesis'}
            </button>
          )
        )}
      </div>

      {err && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {/* Revision reason gate — a change of view is always on the record. */}
      {revisePrompt && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">What changed?</p>
          <p className="mt-0.5 text-xs text-amber-800">
            Recorded with the new version. The current thesis is kept, unchanged, as history.
          </p>
          <AutoGrowTextarea
            value={reviseReason}
            onChange={setReviseReason}
            placeholder="e.g. Competitive position impaired by the Q3 pricing move"
            className="mt-2 block w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-amber-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!reviseReason.trim() || startDraft.isPending}
              onClick={() => startDraft.mutate(reviseReason)}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {startDraft.isPending ? 'Opening…' : 'Start revision'}
            </button>
            <button
              type="button"
              onClick={() => { setRevisePrompt(false); setReviseReason('') }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      {editing && draft && (
        <div className="mt-5 space-y-5 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Draft · version {draft.version}
            </span>
            <button
              type="button"
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
              className="rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              {seed.isPending ? 'Reading…' : 'Draft from AI research'}
            </button>
          </div>

          {draft.revisionReason && (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              <span className="font-semibold">Reason: </span>{draft.revisionReason}
            </p>
          )}

          <div>
            <p className="text-sm font-semibold text-gray-800">Thesis</p>
            <AutoGrowTextarea
              value={thesis}
              onChange={setThesis}
              placeholder="Why this company is worth owning."
              maxHeightPx={400}
              className="mt-1.5 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
            />
          </div>

          {pointEditor('Bull case', 'the key reasons to own it', bull, setBull, 'bull', 'text-green-800')}
          {pointEditor('Bear case', 'risks and headwinds', bear, setBear, 'bear', 'text-red-800')}

          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="thesis-rating" className="block text-xs font-medium text-gray-600">Rating</label>
              <select
                id="thesis-rating"
                value={rating}
                onChange={(e) => setRating(e.target.value as Rating | '')}
                className="mt-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
              >
                <option value="">—</option>
                {RECOMMENDATION_OPTIONS.map((r) => (
                  <option key={r} value={r}>{RECOMMENDATION_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="thesis-conviction" className="block text-xs font-medium text-gray-600">Conviction</label>
              <select
                id="thesis-conviction"
                value={conviction}
                onChange={(e) => setConviction(e.target.value as Conviction | '')}
                className="mt-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
              >
                <option value="">—</option>
                {CONVICTION_OPTIONS.map((c) => (
                  <option key={c} value={c}>{CONVICTION_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={() => publish.mutate()}
              disabled={publish.isPending || !thesis.trim()}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {publish.isPending ? 'Adopting…' : 'Save as thesis'}
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              onClick={() => { if (window.confirm('Discard this draft?')) discard.mutate() }}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:text-red-700"
            >
              Discard
            </button>
            <span className="text-xs text-gray-400">
              Adopting renders the PDF and locks this version permanently.
            </span>
          </div>
        </div>
      )}

      {/* ── Current version ──────────────────────────────────────────────── */}
      {!editing && (
        <div className="mt-5">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !current ? (
            <p className="rounded-md border border-dashed border-gray-300 bg-gray-50/50 p-4 text-sm text-gray-500">
              No thesis recorded for {ticker} yet.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {badges(current)}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>Version {current.version} · adopted {fmtWhen(current.authoredAt)}</span>
                  {current.evidenceDocPath && (
                    <button
                      type="button"
                      onClick={() => openPdf(current.evidenceDocPath)}
                      className="font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      PDF
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{current.thesis}</p>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-semibold text-green-800">Bull case</h4>
                  {pointList(current.bullCase, 'text-green-900')}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-red-800">Bear case</h4>
                  {pointList(current.bearCase, 'text-red-900')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History ──────────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Previous versions ({past.length})
          </h3>
          <ul className="mt-2 divide-y divide-gray-100">
            {past.map((v) => (
              <li key={v.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenHistory(openHistory === v.id ? null : v.id)}
                    className="text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    {openHistory === v.id ? '▾' : '▸'} Version {v.version} · adopted {fmtWhen(v.authoredAt)}
                  </button>
                  <div className="flex items-center gap-3">
                    {badges(v)}
                    {v.evidenceDocPath && (
                      <button
                        type="button"
                        onClick={() => openPdf(v.evidenceDocPath)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        PDF
                      </button>
                    )}
                  </div>
                </div>
                {openHistory === v.id && (
                  <div className="mt-2 space-y-3 rounded-md bg-gray-50 p-3">
                    {v.revisionReason && (
                      <p className="text-xs text-amber-900">
                        <span className="font-semibold">Revision reason: </span>{v.revisionReason}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-gray-700">{v.thesis}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h5 className="text-xs font-semibold text-green-800">Bull case</h5>
                        {pointList(v.bullCase, 'text-green-900')}
                      </div>
                      <div>
                        <h5 className="text-xs font-semibold text-red-800">Bear case</h5>
                        {pointList(v.bearCase, 'text-red-900')}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
