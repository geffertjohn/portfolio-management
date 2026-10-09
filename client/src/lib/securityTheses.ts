/**
 * securityTheses.ts
 *
 * The investment thesis for a SECURITY — why this company is worth owning,
 * independent of which portfolios hold it. 92 of the 96 held securities sit in
 * more than one portfolio (one in ten), so a per-portfolio thesis would mean up
 * to ten documents of record for one stock with nothing forcing them to agree.
 * "Why this security for THIS portfolio" (fit, sizing, funding) is a separate
 * portfolio-level process and does not belong here.
 *
 * Versions are APPEND-ONLY and this is regulator-facing evidence: once
 * published, a version's text, rating, conviction and PDF never change. That is
 * enforced in the database by the `security_theses_append_only` trigger, not
 * just here — so a stray query cannot quietly rewrite history. The only
 * transitions the DB permits are draft -> current and current -> superseded.
 *
 * Stocks only, by decision. Funds/ETFs keep the scorecard + review-evidence
 * flow; they have no thesis document.
 */
import { supabase } from './supabase'
import type { Json } from '@/types/database.types'
import type { Conviction } from './researchReports'

/**
 * One reason, with the context that makes it evidence rather than an assertion.
 * Same shape as `research_reports.watch_items`, so both render without
 * branching — and `key` is stable across revisions, so a later version can say
 * which specific reason stopped holding.
 */
export interface ThesisReason {
  key: string
  title: string
  rationale: string
}

/**
 * A metric block. In the bull case it answers "what makes that a reason?" for
 * one thesis reason, named by `reasonKey`; a reason may carry several. In the
 * bear case `reasonKey` is null -- a risk is not evidence for a reason to own.
 */
export interface ThesisPoint {
  key: string
  reasonKey: string | null
  label: string
  context: string
}

export type ThesisStatus = 'draft' | 'current' | 'superseded'

export interface SecurityThesis {
  id: number
  securityId: string
  version: number
  status: ThesisStatus
  thesis: ThesisReason[]
  bullCase: ThesisPoint[]
  bearCase: ThesisPoint[]
  conviction: Conviction | null
  revisionReason: string | null
  sourceReportIds: number[]
  evidenceDocPath: string | null
  authoredAt: string | null
  createdAt: string
  updatedAt: string
}

// One string literal, not a concatenation: the schema-typed client infers the
// row shape from the literal, and a built-up string collapses it to an error type.
const COLS = 'id, security_id, version, status, thesis, bull_case, bear_case, conviction, revision_reason, source_report_ids, evidence_doc_path, authored_at, created_at, updated_at'

/** A jsonb column round-trips as unknown; narrow it without trusting the shape. */
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function toReasons(v: unknown): ThesisReason[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null) return []
    const o = raw as Record<string, unknown>
    return [{ key: str(o.key), title: str(o.title), rationale: str(o.rationale) }]
  })
}

function toPoints(v: unknown): ThesisPoint[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null) return []
    const o = raw as Record<string, unknown>
    return [{
      key: str(o.key),
      reasonKey: typeof o.reasonKey === 'string' ? o.reasonKey : null,
      label: str(o.label),
      context: str(o.context),
    }]
  })
}

function toIds(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return v.filter((n): n is number => typeof n === 'number')
}

type Row = Record<string, unknown>

function mapRow(r: Row): SecurityThesis {
  return {
    id: r.id as number,
    securityId: r.security_id as string,
    version: r.version as number,
    status: r.status as ThesisStatus,
    thesis: toReasons(r.thesis),
    bullCase: toPoints(r.bull_case),
    bearCase: toPoints(r.bear_case),
    conviction: (r.conviction as Conviction | null) ?? null,
    revisionReason: (r.revision_reason as string | null) ?? null,
    sourceReportIds: toIds(r.source_report_ids),
    evidenceDocPath: (r.evidence_doc_path as string | null) ?? null,
    authoredAt: (r.authored_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/** Every version for a security, newest first. Includes the open draft if there is one. */
export async function fetchThesisHistory(securityId: string): Promise<SecurityThesis[]> {
  const { data, error } = await supabase
    .from('security_theses')
    .select(COLS)
    .eq('security_id', securityId)
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as Row))
}

/** Fields an editor can change while a version is still a draft. */
export interface ThesisDraftFields {
  thesis: ThesisReason[]
  bullCase: ThesisPoint[]
  bearCase: ThesisPoint[]
  conviction: Conviction | null
  sourceReportIds?: number[]
}

function draftPayload(f: ThesisDraftFields): Record<string, unknown> {
  return {
    thesis: f.thesis as unknown as Json,
    bull_case: f.bullCase as unknown as Json,
    bear_case: f.bearCase as unknown as Json,
    conviction: f.conviction,
    ...(f.sourceReportIds ? { source_report_ids: f.sourceReportIds as unknown as Json } : {}),
  }
}

/**
 * Open the editable draft for a security, creating it if there is none.
 *
 * v1 starts empty. A revision starts pre-filled from the current version and
 * REQUIRES a reason — the DB enforces that for every version past the first, so
 * there is no path to a silent rewrite of the firm's recorded view.
 */
export async function startOrResumeThesisDraft(
  securityId: string,
  revisionReason?: string,
): Promise<SecurityThesis> {
  const { data: open, error: openErr } = await supabase
    .from('security_theses')
    .select(COLS)
    .eq('security_id', securityId)
    .eq('status', 'draft')
    .maybeSingle()
  if (openErr) throw openErr
  if (open) return mapRow(open as Row)

  const { data: live, error: liveErr } = await supabase
    .from('security_theses')
    .select(COLS)
    .eq('security_id', securityId)
    .eq('status', 'current')
    .maybeSingle()
  if (liveErr) throw liveErr

  const current = live ? mapRow(live as Row) : null
  const version = (current?.version ?? 0) + 1

  if (version > 1 && !revisionReason?.trim()) {
    throw new Error('A revision needs a reason — say what changed and why.')
  }

  const { data, error } = await supabase
    .from('security_theses')
    .insert({
      security_id: securityId,
      version,
      status: 'draft',
      revision_reason: version > 1 ? revisionReason!.trim() : null,
      // Pre-fill from the live version so a revision is an edit, not a retype.
      thesis: (current?.thesis ?? []) as unknown as Json,
      bull_case: (current?.bullCase ?? []) as unknown as Json,
      bear_case: (current?.bearCase ?? []) as unknown as Json,
      conviction: current?.conviction ?? null,
    })
    .select(COLS)
    .single()
  if (error) throw error
  return mapRow(data as Row)
}

/** Autosave the open draft. Only ever touches a row the DB still considers a draft. */
export async function saveThesisDraft(id: number, fields: ThesisDraftFields): Promise<void> {
  const { error } = await supabase
    .from('security_theses')
    .update(draftPayload(fields))
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw error
}

/** A draft can be abandoned; a published version never can (the DB blocks it). */
export async function discardThesisDraft(id: number): Promise<void> {
  const { error } = await supabase
    .from('security_theses')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw error
}

/**
 * Publish the draft as the security's thesis of record.
 *
 * ORDER MATTERS: the live version must be retired BEFORE the new one is
 * promoted. `security_theses_one_current` is a partial unique index, so
 * promoting first fails — confirmed against the live database.
 *
 * `evidenceDocPath` must be the path the upload returned, never one derived
 * client-side: the server date-prefixes and sanitises filenames, so a guessed
 * path points at a file that does not exist and every signed URL for it fails.
 * The DB rejects a published row without a path, which is what makes
 * "no thesis of record without its document" structural rather than a habit.
 */
export async function publishThesis(
  id: number,
  securityId: string,
  fields: ThesisDraftFields,
  evidenceDocPath: string,
): Promise<void> {
  const { data: live, error: liveErr } = await supabase
    .from('security_theses')
    .select('id')
    .eq('security_id', securityId)
    .eq('status', 'current')
    .maybeSingle()
  if (liveErr) throw liveErr

  if (live) {
    const { error } = await supabase
      .from('security_theses')
      .update({ status: 'superseded' })
      .eq('id', (live as { id: number }).id)
    if (error) throw error
  }

  const { error } = await supabase
    .from('security_theses')
    .update({
      ...draftPayload(fields),
      status: 'current',
      authored_at: new Date().toISOString(),
      evidence_doc_path: evidenceDocPath,
    })
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw error
}

// ── Drafting from the AI committee ──────────────────────────────────────────

/**
 * Seed a draft from the committee's own work.
 *
 * Bull and bear live in SEPARATE rows by separate authors — the research
 * analyst writes the bull case, the devil's advocate writes the bear case — so
 * this merges two reports rather than copying one. Whatever comes back is a
 * starting point the advisor edits and then adopts; the published record is
 * authored by the advisor, with the reports it drew on recorded in
 * `source_report_ids`.
 */
export interface ThesisDraftSeed {
  /** Which kind of report this came from -- 'initial' is foundational research,
   *  anything else is an earnings brief being used as a stand-in. */
  sourcedFrom: string | null
  thesis: ThesisReason[]
  bullCase: ThesisPoint[]
  bearCase: ThesisPoint[]
  conviction: Conviction | null
  sourceReportIds: number[]
}

/**
 * Split prose into metric blocks so the advisor edits structure, not a wall of
 * text. Seeded blocks come back UNATTACHED (`reasonKey: null`) -- the committee
 * writes prose and does not know which thesis reason each figure evidences;
 * guessing that mapping would put words in the advisor's mouth. The editor
 * surfaces unattached blocks for assignment.
 */
function proseToPoints(prefix: string, text: string | null): ThesisPoint[] {
  if (!text?.trim()) return []
  const chunks = text
    .split(/\n\s*[-*•]\s+|\n{2,}|(?=\d+\.\s)/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim())
    .filter(Boolean)
  return chunks.map((chunk, i) => {
    // "Heading: detail" is the shape the agents tend to emit; keep the split
    // when there is one, otherwise the whole chunk is the label.
    const m = /^(.{3,80}?)\s*[:—-]\s+(.*)$/s.exec(chunk)
    return {
      key: `${prefix}-${i + 1}`,
      reasonKey: null,
      label: (m ? m[1] : chunk).trim(),
      context: (m ? m[2] : '').trim(),
    }
  })
}

export async function fetchThesisSeedFromResearch(securityId: string): Promise<ThesisDraftSeed> {
  const { data, error } = await supabase
    .from('research_reports')
    .select('id, author_role, report_type, thesis, bull_case, bear_case, conviction, created_at')
    .eq('security_id', securityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error

  type R = {
    id: number; author_role: string; report_type: string; thesis: string | null
    bull_case: string | null; bear_case: string | null
    conviction: string | null
  }

  // `initial` reports FIRST, newest within each group. An earnings brief is a
  // tactical read on one print -- "NVDA reports FQ2 after the close today" is
  // not a durable statement of why the company is worth owning, and seeding the
  // thesis box with one produces a document of record that reads as a note.
  // Briefs are still used as a fallback when there is no foundational report.
  const rows = [...((data ?? []) as R[])].sort(
    (a, b) => (a.report_type === 'initial' ? 0 : 1) - (b.report_type === 'initial' ? 0 : 1),
  )

  // The best available source for each piece — not necessarily the same row.
  const withThesis = rows.find((r) => r.thesis?.trim())
  const withBull = rows.find((r) => r.bull_case?.trim())
  const withBear = rows.find((r) => r.bear_case?.trim())
  const withConviction = rows.find((r) => r.conviction)

  const used = [withThesis, withBull, withBear, withConviction]
    .filter((r): r is R => !!r)
    .map((r) => r.id)

  // The committee writes prose, so a seeded thesis arrives as ONE reason to be
  // split and retitled -- a starting point, not the finished structure.
  const thesis: ThesisReason[] = withThesis?.thesis?.trim()
    ? [{ key: 'reason-1', title: 'Drafted from research -- split into named reasons', rationale: withThesis.thesis.trim() }]
    : []

  return {
    sourcedFrom: withThesis?.report_type ?? withBull?.report_type ?? withBear?.report_type ?? null,
    thesis,
    bullCase: proseToPoints('bull', withBull?.bull_case ?? null),
    bearCase: proseToPoints('bear', withBear?.bear_case ?? null),
    conviction: (withConviction?.conviction as Conviction | null) ?? null,
    sourceReportIds: [...new Set(used)],
  }
}
