/**
 * ProcessDocumentPanel — the firm's portfolio construction & monitoring
 * process, viewed and authored on Settings → Investment Committee.
 *
 * It sits above the roles deliberately: the page answers "who is the committee"
 * and this answers "what standard do they apply", and the standard is the thing
 * the advisor actually maintains. The roles below it are fixed reference text.
 *
 * View → Revise → Adopt. A draft is editable freely; an adopted version is
 * immutable and a revision opens version N+1, so the lineage is the audit
 * record. All of that is enforced in the database (`process_documents_append_only`);
 * this is the surface, not the authority.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import {
  fetchCurrentProcessDocument,
  fetchProcessDraft,
  fetchProcessHistory,
  startOrResumeProcessDraft,
  saveProcessDraft,
  discardProcessDraft,
  adoptProcessDocument,
  type ProcessDocument,
} from '@/lib/processDocuments'
import {
  parseMarkdown,
  reconcile,
  toMarkdown,
  adoptionBlockers,
  type ProcessSection,
  type SectionWarning,
} from '@/lib/processSections'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { fmtUtcLongDate } from '@/lib/formatters'

const WARNING_TEXT: Record<SectionWarning['reason'], string> = {
  'empty-key': 'has no letters or digits to make an anchor from — it was given a positional one',
  'duplicate-key': 'repeats an earlier heading — the second was given a numbered anchor',
  'empty-body': 'has no content beneath it',
}

export default function ProcessDocumentPanel() {
  const qc = useQueryClient()

  const {
    data: current,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: QUERY_KEYS.processDocument,
    queryFn: fetchCurrentProcessDocument,
  })
  const { data: draft } = useQuery({
    queryKey: QUERY_KEYS.processDraft,
    queryFn: fetchProcessDraft,
  })
  const { data: history } = useQuery({
    queryKey: QUERY_KEYS.processHistory,
    queryFn: fetchProcessHistory,
  })

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [sections, setSections] = useState<ProcessSection[]>([])
  const [revisionReason, setRevisionReason] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [warnings, setWarnings] = useState<SectionWarning[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [viewingVersion, setViewingVersion] = useState<number | null>(null)

  /**
   * Seed the editor ONCE per entry into edit mode, keyed to the draft row —
   * never on every render of the query data. A background refetch
   * (refetchOnWindowFocus fires when the advisor tabs back from the document
   * they are copying out of) would otherwise overwrite work in progress. Same
   * guard as the Alternatives panel and the review modal.
   */
  const seededFor = useRef<number | null>(null)
  useEffect(() => {
    if (!editing || !draft) return
    if (seededFor.current === draft.id) return
    seededFor.current = draft.id
    setTitle(draft.title)
    setSections(draft.sections)
    setRevisionReason(draft.revision_reason ?? '')
  }, [editing, draft])

  const startMut = useMutation({
    mutationFn: startOrResumeProcessDraft,
    onSuccess: (d) => {
      seededFor.current = d.id
      setTitle(d.title)
      setSections(d.sections)
      setRevisionReason(d.revision_reason ?? '')
      setEditing(true)
      setError(null)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.processDocument })
    },
    onError: (e: Error) => setError(e.message),
  })

  const saveMut = useMutation({
    mutationFn: (d: ProcessDocument) =>
      saveProcessDraft(d.id, { title, sections, revisionReason: revisionReason.trim() || null }),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.processDocument })
    },
    onError: (e: Error) => setError(e.message),
  })

  const adoptMut = useMutation({
    mutationFn: (d: ProcessDocument) =>
      adoptProcessDocument(d.id, { title, sections, revisionReason: revisionReason.trim() || null }),
    onSuccess: () => {
      setEditing(false)
      seededFor.current = null
      setError(null)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.processDocument })
    },
    onError: (e: Error) => setError(e.message),
  })

  const discardMut = useMutation({
    mutationFn: (d: ProcessDocument) => discardProcessDraft(d.id),
    onSuccess: () => {
      setEditing(false)
      seededFor.current = null
      setError(null)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.processDocument })
    },
    onError: (e: Error) => setError(e.message),
  })

  const blockers = useMemo(() => adoptionBlockers(title, sections), [title, sections])
  const isRevision = (draft?.version ?? 1) > 1
  const needsReason = isRevision && !revisionReason.trim()

  function applyImport() {
    const parsed = parseMarkdown(importText)
    const reconciled = reconcile(sections, parsed.sections)
    setSections(reconciled)
    if (parsed.title) setTitle(parsed.title)
    setWarnings(parsed.warnings)
    setImportOpen(false)
    setImportText('')
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImportText(await f.text())
    e.target.value = ''
  }

  function updateSection(i: number, patch: Partial<ProcessSection>) {
    setSections((prev) => prev.map((s, n) => (n === i ? { ...s, ...patch } : s)))
  }

  function removeSection(i: number) {
    setSections((prev) => prev.filter((_, n) => n !== i))
  }

  function addSection() {
    setSections((prev) => [...prev, { key: `section-${prev.length + 1}`, heading: '', body: '' }])
  }

  function move(i: number, by: number) {
    setSections((prev) => {
      const j = i + by
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const shown = viewingVersion != null ? history?.find((h) => h.version === viewingVersion) : current

  // ── Read-only view ────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              The standard the committee applies
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              The firm&rsquo;s portfolio construction &amp; monitoring process. The committee reads
              the adopted version and reports where a book departs from it.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {(history?.length ?? 0) > 0 && (
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {showHistory ? 'Hide history' : 'History'}
              </button>
            )}
            <button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {draft ? 'Resume draft' : current ? 'Revise' : 'Create the document'}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        {draft && (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A draft of version {draft.version} is open and is <strong>not</strong> what the committee
            reads — it applies the adopted version until the draft is adopted.
          </p>
        )}

        {showHistory && (history?.length ?? 0) > 0 && (
          <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
            <ul className="space-y-1">
              {history!.map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => setViewingVersion(h.status === 'current' ? null : h.version)}
                    className={`font-medium ${
                      (viewingVersion ?? current?.version) === h.version
                        ? 'text-indigo-700'
                        : 'text-gray-600 hover:text-indigo-700'
                    }`}
                  >
                    Version {h.version}
                  </button>
                  <span className="text-gray-400">
                    {h.status === 'current'
                      ? 'in force'
                      : h.status === 'draft'
                        ? 'draft'
                        : 'superseded'}
                  </span>
                  {h.adopted_at && (
                    <span className="text-gray-400">· adopted {fmtUtcLongDate(h.adopted_at)}</span>
                  )}
                  {h.revision_reason && (
                    <span className="truncate text-gray-500">· {h.revision_reason}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isLoading ? (
          <p className="mt-4 text-sm text-gray-400">Loading…</p>
        ) : loadError ? (
          /*
           * A FAILED READ MUST NOT RENDER AS "none adopted". Both leave `data`
           * undefined, so without this branch a broken query would tell the
           * advisor their standard does not exist — on the one page whose job
           * is to say what the committee is applying. Same distinction the
           * import warning draws between a missing category and an unmapped
           * one, and the one `UnpricedReason` draws for a fund.
           */
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            The process document could not be loaded, so this page cannot say what is in force.
            This is a read failure, not an empty document — do not take it as evidence that no
            standard is adopted. ({(loadError as Error).message})
          </p>
        ) : !shown ? (
          <div className="mt-4 rounded border border-dashed border-gray-300 bg-gray-50 p-4">
            <p className="text-sm text-gray-600">
              No process document has been adopted yet.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Until one is, the committee has no firm-wide standard to measure a book against and
              says so in its memos rather than inferring one. Paste or upload your existing process
              to create the first version — it does <strong>not</strong> need to match how the app is
              configured today. Where the two differ, the committee reports the gap, which is the
              point.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-base font-semibold text-gray-900">{shown.title}</h3>
              <span className="text-xs text-gray-400">
                v{shown.version}
                {shown.adopted_at ? ` · adopted ${fmtUtcLongDate(shown.adopted_at)}` : ''}
                {viewingVersion != null ? ' · superseded' : ''}
              </span>
            </div>
            <div className="mt-3 space-y-4">
              {shown.sections.map((s) => (
                <div key={s.key}>
                  <h4 className="text-sm font-semibold text-gray-800">{s.heading}</h4>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {s.body}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-gray-400">{s.key}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    )
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  return (
    <section className="rounded-lg border border-indigo-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Editing version {draft?.version ?? 1}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            The committee keeps applying the adopted version until you adopt this one.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => setImportOpen((v) => !v)}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Paste or upload
          </button>
          <button
            onClick={() => draft && saveMut.mutate(draft)}
            disabled={!draft || saveMut.isPending}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saveMut.isPending ? 'Saving…' : 'Save draft'}
          </button>
          <button
            onClick={() => draft && adoptMut.mutate(draft)}
            disabled={!draft || adoptMut.isPending || blockers.length > 0 || needsReason}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            title={blockers[0] ?? (needsReason ? 'A revision needs a reason.' : undefined)}
          >
            {adoptMut.isPending ? 'Adopting…' : 'Adopt'}
          </button>
          <button
            onClick={() => {
              setEditing(false)
              seededFor.current = null
            }}
            className="rounded px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {importOpen && (
        <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            Paste your process as text. Markdown headings (<code>##</code>) become sections; text
            before the first heading is kept as a preamble. Existing sections keep their anchors
            where the heading or the position still matches, so a memo citing one still resolves.
          </p>
          <input
            type="file"
            accept=".md,.markdown,.txt,text/plain,text/markdown"
            onChange={onFile}
            className="mt-2 block w-full text-xs text-gray-600 file:mr-3 file:rounded file:border file:border-gray-300 file:bg-white file:px-2 file:py-1 file:text-xs"
          />
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            placeholder={'# Portfolio Construction & Monitoring Process\n\n## Scope\n\n…'}
            className="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={applyImport}
              disabled={!importText.trim()}
              className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-50"
            >
              Parse into sections
            </button>
            <button
              onClick={() => {
                setImportOpen(false)
                setImportText('')
              }}
              className="rounded px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded border border-amber-200 bg-amber-50 px-3 py-2">
          {warnings.map((w, i) => (
            <li key={i} className="text-xs text-amber-800">
              &ldquo;{w.heading}&rdquo; {WARNING_TEXT[w.reason]}.
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {isRevision && (
        <div className="mt-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Reason for this revision
          </label>
          <input
            value={revisionReason}
            onChange={(e) => setRevisionReason(e.target.value)}
            placeholder="What changed, and why"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          {needsReason && (
            <p className="mt-1 text-xs text-amber-700">
              A revision records why it was made — the lineage is the audit record.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {sections.map((s, i) => (
          <div key={s.key} className="rounded border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <input
                value={s.heading}
                onChange={(e) => updateSection(i, { heading: e.target.value })}
                placeholder="Section heading"
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-medium"
              />
              <span className="shrink-0 font-mono text-[10px] text-gray-400" title="Anchor a committee memo cites. It does not change when you reword the heading.">
                {s.key}
              </span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="px-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30">↓</button>
              <button onClick={() => removeSection(i)} className="px-1 text-xs text-gray-400 hover:text-red-600">✕</button>
            </div>
            <AutoGrowTextarea
              value={s.body}
              onChange={(v) => updateSection(i, { body: v })}
              placeholder="What this clause requires"
              maxHeightPx={400}
              className="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={addSection}
          className="rounded border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          + Section
        </button>
        {draft && (
          <button
            onClick={() => discardMut.mutate(draft)}
            className="text-xs text-gray-400 hover:text-red-600"
          >
            Discard this draft
          </button>
        )}
      </div>

      {blockers.length > 0 && (
        <ul className="mt-3 space-y-1 rounded border border-gray-200 bg-gray-50 px-3 py-2">
          {blockers.map((b, i) => (
            <li key={i} className="text-xs text-gray-600">
              {b}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
          Preview as markdown
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-700">
          {toMarkdown(title, sections)}
        </pre>
      </details>
    </section>
  )
}
