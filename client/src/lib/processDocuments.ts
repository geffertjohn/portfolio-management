/**
 * processDocuments — the firm's portfolio construction & monitoring process.
 *
 * The standard the AI committee measures a book against. Authored in
 * Settings → Investment Committee, stored in Supabase (NOT as a file: the
 * committee runs headless and reads SQL), and versioned append-only so a memo
 * written in March is reconstructable against the process as it stood then.
 *
 * SCOPE IS FIRM-WIDE. `model_portfolio_data.investment_philosophy` and
 * `.investment_process` are NOT absorbed and remain the per-model mandate — the
 * firm document says how the firm constructs and monitors ANY book, the model
 * fields say what THIS strategy's rubric is. The committee prompt states which
 * wins where they overlap.
 *
 * The pure half (markdown → citable sections, key reconciliation) is in
 * `processSections.ts`.
 */

import { supabase } from './supabase'
import type { ProcessSection } from './processSections'

export type ProcessDocumentStatus = 'draft' | 'current' | 'superseded'

/** One value today. See the column comment: the structure is ready, the vocabulary minimal. */
export const PROCESS_DOCUMENT_KIND = 'portfolio_process' as const

export interface ProcessDocument {
  id: number
  kind: string
  title: string
  version: number
  status: ProcessDocumentStatus
  sections: ProcessSection[]
  revision_reason: string | null
  adopted_at: string | null
  created_at: string
  updated_at: string
}

const COLUMNS = 'id,kind,title,version,status,sections,revision_reason,adopted_at,created_at,updated_at'

/**
 * `sections` is `jsonb`, so it arrives as `Json` and has to be narrowed at the
 * return boundary — the standing convention for a DB column whose domain type
 * is richer than its storage type. A row whose sections are not an array reads
 * as empty rather than throwing: the document is governance, and a render
 * failure on the committee's own standard page would be worse than a visibly
 * empty one.
 */
function mapRow(row: Record<string, unknown>): ProcessDocument {
  const raw = row.sections
  const sections = Array.isArray(raw) ? (raw as unknown as ProcessSection[]) : []
  return { ...(row as unknown as ProcessDocument), sections }
}

/** The adopted document — what the committee reads. `null` when none is adopted yet. */
export async function fetchCurrentProcessDocument(): Promise<ProcessDocument | null> {
  const { data, error } = await supabase
    .from('process_documents')
    .select(COLUMNS)
    .eq('kind', PROCESS_DOCUMENT_KIND)
    .eq('status', 'current')
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data as Record<string, unknown>) : null
}

/** The open draft, if one exists. */
export async function fetchProcessDraft(): Promise<ProcessDocument | null> {
  const { data, error } = await supabase
    .from('process_documents')
    .select(COLUMNS)
    .eq('kind', PROCESS_DOCUMENT_KIND)
    .eq('status', 'draft')
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data as Record<string, unknown>) : null
}

/** Every version, newest first — the lineage, which is this table's audit record. */
export async function fetchProcessHistory(): Promise<ProcessDocument[]> {
  const { data, error } = await supabase
    .from('process_documents')
    .select(COLUMNS)
    .eq('kind', PROCESS_DOCUMENT_KIND)
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export async function fetchProcessVersion(id: number): Promise<ProcessDocument | null> {
  const { data, error } = await supabase
    .from('process_documents')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data as Record<string, unknown>) : null
}

/**
 * Open a draft, or return the one already open.
 *
 * A new draft is seeded from the adopted version so a revision starts from what
 * is in force rather than from a blank page, and its version is `current + 1`.
 * `process_documents_one_draft` allows exactly one, so a second caller resumes
 * rather than colliding.
 */
export async function startOrResumeProcessDraft(): Promise<ProcessDocument> {
  const existing = await fetchProcessDraft()
  if (existing) return existing

  const live = await fetchCurrentProcessDocument()
  const { data, error } = await supabase
    .from('process_documents')
    .insert({
      kind: PROCESS_DOCUMENT_KIND,
      title: live?.title ?? 'Portfolio Construction & Monitoring Process',
      version: (live?.version ?? 0) + 1,
      status: 'draft',
      sections: (live?.sections ?? []) as unknown as never,
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return mapRow(data as Record<string, unknown>)
}

export interface ProcessDraftFields {
  title: string
  sections: ProcessSection[]
  revisionReason: string | null
}

export async function saveProcessDraft(id: number, fields: ProcessDraftFields): Promise<void> {
  const { error } = await supabase
    .from('process_documents')
    .update({
      title: fields.title,
      sections: fields.sections as unknown as never,
      revision_reason: fields.revisionReason,
    })
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw error
}

export async function discardProcessDraft(id: number): Promise<void> {
  const { error } = await supabase
    .from('process_documents')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw error
}

/**
 * Adopt a draft as the standard in force.
 *
 * **The live version is retired BEFORE the draft is promoted.**
 * `process_documents_one_current` is a partial unique index, so promoting first
 * fails — the same ordering `publishThesis` observes, for the same reason.
 *
 * A failure between the two steps leaves NO current document rather than two,
 * which is the safe direction: the committee reports a missing standard loudly,
 * where two would have it silently grade against whichever it read first.
 */
export async function adoptProcessDocument(id: number, fields: ProcessDraftFields): Promise<void> {
  const live = await fetchCurrentProcessDocument()
  if (live) {
    const { error } = await supabase
      .from('process_documents')
      .update({ status: 'superseded' })
      .eq('id', live.id)
    if (error) throw error
  }

  const { error } = await supabase
    .from('process_documents')
    .update({
      title: fields.title,
      sections: fields.sections as unknown as never,
      revision_reason: fields.revisionReason,
      status: 'current',
      adopted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw error
}
