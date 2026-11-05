/**
 * committeeReports.ts
 *
 * **Everything the AI investment committee has written, in one list.**
 *
 * Five tables hold the committee's output — `research_reports`,
 * `earnings_call_summaries`, `risk_reports`, `ic_memos` and
 * `portfolio_review_memos` — and until this existed **every reader of them was
 * scoped to a single security, portfolio or candidate**. A security's briefs
 * were on its Commentary tab, a candidate's memo in its workspace, a
 * portfolio's risk report on its Reviews tab. There was no answer anywhere to
 * "what has the committee produced", so 115 research reports, 41 call
 * summaries and 78 risk reports sat written and unreadable in aggregate.
 *
 * **Status is deliberately NOT surfaced as a state the advisor must clear.**
 * 102 of those 115 research reports and all 41 call summaries carry
 * `status = 'draft'`, and **nothing in the app has ever written `'final'`** —
 * no code path promotes one. So "draft" never meant "provisional", it meant
 * "written by a job", and presenting it as a queue of unapproved work would
 * invent an approval step the firm does not run. These are reports delivered
 * to the advisor. The column stays (it is the record as written, and the jobs
 * still set it) but no surface renders it.
 *
 * **`ic_memos.status` is the exception and is kept**, because there it is
 * real: `pending_cio` / `approved` / `rejected` is the CIO decision, recorded
 * by `recordIcDecision`, and the Actions hub already routes on it. One table's
 * vestigial column is not another's.
 *
 * Read-only and derived. Nothing here writes.
 */

import { supabase } from './supabase'

/** Which kind of document this is. Research reports keep their own four types. */
export type CommitteeDocKind =
  | 'pre_earnings'
  | 'post_earnings'
  | 'initial'
  | 'update'
  | 'call_summary'
  | 'risk_report'
  | 'ic_memo'
  | 'portfolio_memo'

export const DOC_KIND_LABELS: Record<CommitteeDocKind, string> = {
  pre_earnings: 'Pre-earnings brief',
  post_earnings: 'Post-earnings brief',
  initial: 'Research',
  update: 'Research update',
  call_summary: 'Call summary',
  risk_report: 'Risk report',
  ic_memo: 'IC memo',
  portfolio_memo: 'Portfolio memo',
}

/** Grouping for the filter bar — the advisor thinks in these, not in tables. */
export type DocGroup = 'briefs' | 'research' | 'calls' | 'risk' | 'memos'

export const DOC_GROUP_LABELS: Record<DocGroup, string> = {
  briefs: 'Earnings briefs',
  research: 'Research',
  calls: 'Call summaries',
  risk: 'Risk',
  memos: 'Memos',
}

export const GROUP_OF: Record<CommitteeDocKind, DocGroup> = {
  pre_earnings: 'briefs',
  post_earnings: 'briefs',
  initial: 'research',
  update: 'research',
  call_summary: 'calls',
  risk_report: 'risk',
  ic_memo: 'memos',
  portfolio_memo: 'memos',
}

/**
 * One document, whichever table it came from.
 *
 * `id` is `table:rowId` because the five tables number independently and a
 * bare id would collide across them — `research_reports` 41 and
 * `earnings_call_summaries` 41 are different documents.
 */
export interface CommitteeDoc {
  id: string
  kind: CommitteeDocKind
  /** When the committee wrote it. */
  writtenAt: string
  /** The ticker or the portfolio this is about. */
  subject: string
  subjectKind: 'security' | 'portfolio'
  /** `securities2.id`, for routing. Null for a ticker the firm does not hold. */
  securityNumericId: number | null
  /** "Q3 FY2026" when the document concerns one call, else null. */
  period: string | null
  /** The one fact worth reading in a list — a rating, a verdict, a sentiment. */
  signal: string | null
  /** Red when the signal is bad news, amber when mixed. Drives the badge only. */
  tone: DocTone
  /** First line of prose, for the list. */
  excerpt: string | null
}

const day = (v: string) => v.slice(0, 10)

function periodLabel(fy: number | null, q: number | null): string | null {
  return fy != null && q != null ? `Q${q} FY${fy}` : null
}

/** First sentence or so of a prose field, trimmed for a list row. */
function excerptOf(v: unknown, max = 160): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s+/g, ' ')
  if (!s) return null
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`
}

export type DocTone = 'good' | 'warn' | 'bad' | 'neutral'

type ToneMap = Record<string, DocTone>

const THESIS_TONE: ToneMap = { intact: 'good', at_risk: 'warn', broken: 'bad' }
/** `hold` is NEUTRAL, not good: it is the absence of a change, not approval. */
const RATING_TONE: ToneMap = {
  buy: 'good', add: 'good', hold: 'neutral', trim: 'warn', sell: 'bad',
}
const VERDICT_TONE: ToneMap = { pass: 'good', warn: 'warn', veto: 'bad' }
/** A `neutral` call sentiment is amber — the committee read it and found no
 *  clear direction, which is a weaker answer than a positive one. */
const SENTIMENT_TONE: ToneMap = { positive: 'good', neutral: 'warn', negative: 'bad' }
const IC_TONE: ToneMap = {
  approved: 'good', approve: 'good', pending_cio: 'warn', watchlist: 'warn',
  rejected: 'bad', reject: 'bad',
}

/** Newest first. The only ordering a feed of written documents can justify. */
export function sortCommitteeDocs(docs: CommitteeDoc[]): CommitteeDoc[] {
  return [...docs].sort((a, b) => b.writtenAt.localeCompare(a.writtenAt))
}

/** How many of each group, for the filter bar's counts. */
export function countByGroup(docs: CommitteeDoc[]): Record<DocGroup, number> {
  const out: Record<DocGroup, number> = { briefs: 0, research: 0, calls: 0, risk: 0, memos: 0 }
  for (const d of docs) out[GROUP_OF[d.kind]]++
  return out
}

/**
 * Where a document opens.
 *
 * A security document goes to that security's **Commentary tab**, which is
 * where every brief, summary and report is actually rendered. A ticker with no
 * `securities2` row is a watchlist idea — `research_reports.security_id` has no
 * FK precisely so an unheld candidate can carry research — and those open the
 * on-demand research page instead, since there is no held-security page to go
 * to.
 */
export function docHref(doc: CommitteeDoc): string {
  if (doc.subjectKind === 'portfolio') return `/portfolio/${encodeURIComponent(doc.subject)}`
  if (doc.securityNumericId != null) return `/security/${doc.securityNumericId}`
  return `/research/${encodeURIComponent(doc.subject)}`
}

/**
 * Every committee document, newest first.
 *
 * Six reads in parallel — the five deliverable tables plus the ticker→id
 * lookup that makes a row clickable. `limit` bounds each table, not the total,
 * so one chatty source cannot crowd the others out of the feed.
 */
export async function fetchCommitteeDocs(limit = 200): Promise<CommitteeDoc[]> {
  const [research, calls, risk, memos, portfolioMemos, securities] = await Promise.all([
    supabase
      .from('research_reports')
      .select('id, security_id, report_type, fiscal_year, quarter, rating, thesis_status, thesis, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('earnings_call_summaries')
      .select('id, security_id, fiscal_year, quarter, sentiment, sentiment_summary, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('risk_reports')
      .select('id, portfolio_name, security_id, scope, verdict, notes, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('ic_memos')
      .select('id, portfolio_name, security_id, recommendation, decision, status, rationale, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('portfolio_review_memos')
      .select('id, portfolio_name, summary, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('securities2').select('id, security_id'),
  ])
  for (const r of [research, calls, risk, memos, portfolioMemos, securities]) {
    if (r.error) throw r.error
  }

  const numericId = new Map<string, number>()
  for (const s of securities.data ?? []) {
    if (s.security_id) numericId.set(s.security_id, s.id)
  }
  const idOf = (ticker: string | null) => (ticker ? numericId.get(ticker) ?? null : null)

  const docs: CommitteeDoc[] = []

  for (const r of research.data ?? []) {
    if (!r.security_id) continue
    const kind = r.report_type as CommitteeDocKind
    // A post-earnings brief's verdict on the thesis is the fact worth reading;
    // for everything else the rating is.
    const thesis = typeof r.thesis_status === 'string' ? r.thesis_status : null
    const rating = typeof r.rating === 'string' ? r.rating : null
    docs.push({
      id: `research:${r.id}`,
      kind,
      writtenAt: r.created_at,
      subject: r.security_id,
      subjectKind: 'security',
      securityNumericId: idOf(r.security_id),
      period: periodLabel(r.fiscal_year, r.quarter),
      signal: thesis ? `Thesis ${thesis.replace(/_/g, ' ')}` : rating ? rating.toUpperCase() : null,
      tone: thesis ? THESIS_TONE[thesis] ?? 'neutral' : rating ? RATING_TONE[rating] ?? 'neutral' : 'neutral',
      excerpt: excerptOf(r.thesis),
    })
  }

  for (const c of calls.data ?? []) {
    if (!c.security_id) continue
    const s = typeof c.sentiment === 'string' ? c.sentiment : null
    docs.push({
      id: `call:${c.id}`,
      kind: 'call_summary',
      writtenAt: c.created_at,
      subject: c.security_id,
      subjectKind: 'security',
      securityNumericId: idOf(c.security_id),
      period: periodLabel(c.fiscal_year, c.quarter),
      signal: s ? s[0].toUpperCase() + s.slice(1) : null,
      tone: s ? SENTIMENT_TONE[s] ?? 'neutral' : 'neutral',
      excerpt: excerptOf(c.sentiment_summary),
    })
  }

  for (const r of risk.data ?? []) {
    // A candidate-scoped risk report is about a ticker; a portfolio-scoped one
    // about a book. Both exist in this table and they route differently.
    const onSecurity = r.scope === 'candidate' && !!r.security_id
    const subject = onSecurity ? r.security_id! : r.portfolio_name
    if (!subject) continue
    const v = typeof r.verdict === 'string' ? r.verdict : null
    docs.push({
      id: `risk:${r.id}`,
      kind: 'risk_report',
      writtenAt: r.created_at,
      subject,
      subjectKind: onSecurity ? 'security' : 'portfolio',
      securityNumericId: onSecurity ? idOf(r.security_id) : null,
      period: null,
      signal: v ? v.toUpperCase() : null,
      tone: v ? VERDICT_TONE[v] ?? 'neutral' : 'neutral',
      excerpt: excerptOf(r.notes),
    })
  }

  for (const m of memos.data ?? []) {
    const subject = m.security_id ?? m.portfolio_name
    if (!subject) continue
    // Here status IS meaningful — it is the CIO decision, not a draft flag.
    const state = (typeof m.decision === 'string' && m.decision)
      || (typeof m.status === 'string' ? m.status : null)
    docs.push({
      id: `memo:${m.id}`,
      kind: 'ic_memo',
      writtenAt: m.created_at,
      subject,
      subjectKind: m.security_id ? 'security' : 'portfolio',
      securityNumericId: idOf(m.security_id),
      period: null,
      signal: state ? state.replace(/_/g, ' ') : null,
      tone: state ? IC_TONE[state] ?? 'neutral' : 'neutral',
      excerpt: excerptOf(m.rationale),
    })
  }

  for (const m of portfolioMemos.data ?? []) {
    if (!m.portfolio_name) continue
    docs.push({
      id: `pmemo:${m.id}`,
      kind: 'portfolio_memo',
      writtenAt: m.created_at,
      subject: m.portfolio_name,
      subjectKind: 'portfolio',
      securityNumericId: null,
      period: null,
      signal: null,
      tone: 'neutral',
      excerpt: excerptOf(m.summary),
    })
  }

  return sortCommitteeDocs(docs)
}

// ── Written in the last N days ──────────────────────────────────────────────

/**
 * How much the committee produced recently, by group.
 *
 * The dashboard's headline. It answers "has the committee been working" with a
 * number rather than a feeling, which matters because the jobs run unattended
 * and their output had no aggregate view at all.
 */
export function producedSince(docs: CommitteeDoc[], sinceDay: string): number {
  return docs.filter((d) => day(d.writtenAt) >= sinceDay).length
}
