/**
 * earningsCallSummaries.ts
 *
 * The committee's own read of one earnings call — sentiment, the guidance given
 * on it, and the highlights/lowlights.
 *
 * Why this is persisted when transcripts are not: the transcript itself is
 * on-demand FMP (`fetchLatestTranscript`) and deliberately never stored, so this
 * row is the ONLY durable record of what was said on a call and how we read it.
 * A summary therefore outlives the transcript window it was written from.
 *
 * Keyed to the CALL — (security_id, fiscal_year, quarter) — not to a research
 * report. A post-earnings brief requires a pre-brief by CHECK, so hanging the
 * summary off one would leave any name without a pre-brief permanently
 * unsummarised. `security_id` carries no FK, matching `research_reports`.
 */
import { supabase } from './supabase'

export type CallSentiment = 'positive' | 'neutral' | 'negative'

/** One highlight or lowlight: a bold claim, then what supports it. */
export interface CallPoint {
  title: string
  detail: string
}

export interface EarningsCallSummary {
  id: number
  securityId: string
  fiscalYear: number
  quarter: number
  callDate: string | null
  sentiment: CallSentiment
  /** The paragraph under the sentiment label: why it reads that way. */
  sentimentSummary: string
  /** Guidance management gave ON THE CALL, in prose. */
  guidance: string | null
  highlights: CallPoint[]
  lowlights: CallPoint[]
  transcriptDate: string | null
  status: 'draft' | 'final'
  createdAt: string
}

const SELECT =
  'id, security_id, fiscal_year, quarter, call_date, sentiment, sentiment_summary, ' +
  'guidance, highlights, lowlights, transcript_date, status, created_at'

/** Narrow the jsonb columns, which the generated types surface as `Json`. */
function toPoints(value: unknown): CallPoint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    if (raw === null || typeof raw !== 'object') return []
    const o = raw as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title : ''
    const detail = typeof o.detail === 'string' ? o.detail : ''
    return title || detail ? [{ title, detail }] : []
  })
}

type Row = {
  id: number
  security_id: string
  fiscal_year: number
  quarter: number
  call_date: string | null
  sentiment: string
  sentiment_summary: string
  guidance: string | null
  highlights: unknown
  lowlights: unknown
  transcript_date: string | null
  status: string
  created_at: string
}

function mapRow(r: Row): EarningsCallSummary {
  return {
    id: r.id,
    securityId: r.security_id,
    fiscalYear: r.fiscal_year,
    quarter: r.quarter,
    callDate: r.call_date,
    sentiment: r.sentiment as CallSentiment,
    sentimentSummary: r.sentiment_summary,
    guidance: r.guidance,
    highlights: toPoints(r.highlights),
    lowlights: toPoints(r.lowlights),
    transcriptDate: r.transcript_date,
    status: r.status as 'draft' | 'final',
    createdAt: r.created_at,
  }
}

/**
 * The summary for ONE specific call. `maybeSingle` because most calls have no
 * summary yet — absence is the normal case, not a bug.
 */
export async function fetchCallSummary(
  securityId: string,
  fiscalYear: number,
  quarter: number,
): Promise<EarningsCallSummary | null> {
  const { data, error } = await supabase
    .from('earnings_call_summaries')
    .select(SELECT)
    .eq('security_id', securityId.toUpperCase())
    .eq('fiscal_year', fiscalYear)
    .eq('quarter', quarter)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return data ? mapRow(data as unknown as Row) : null
}
