/**
 * externalResearch.ts
 *
 * Data-access layer for `external_research` — sell-side research reports the
 * advisor uploads (Raymond James today), parsed from the PDF cover page by
 * `lib/researchPdfParse.ts`.
 *
 * Distinct from `research_reports`, which holds the AI investment team's OWN
 * output. This table is the street's view: rating, target price, and the
 * analyst's own recommendation/valuation narrative, with the source PDF kept in
 * the `Security Documents` bucket and referenced by `doc_path`.
 *
 * Recorded for display and as AI-committee input — it never drives a trade.
 * `security_id` is the text ticker (no FK; a report may cover a name not held).
 * Soft-deleted via `deleted_at`.
 */
import { supabase } from './supabase'
import type { Json } from '@/types/database.types'
import type { ParsedAnalyst, ParsedResearch } from './researchPdfParse'

export type ParseStatus = 'parsed' | 'manual' | 'partial'

export interface ExternalResearch {
  id: number
  security_id: string
  firm: string
  report_type: string | null
  title: string | null
  published_at: string | null
  rating_label: string | null
  rating_value: number | null
  prior_rating_label: string | null
  target_price: number | null
  prior_target_price: number | null
  price_at_publication: number | null
  suitability: string | null
  recommendation_text: string | null
  valuation_text: string | null
  analysts: ParsedAnalyst[] | null
  market_data: Record<string, string> | null
  doc_path: string | null
  source_filename: string | null
  parse_status: ParseStatus
  raw_header: string | null
  created_at: string
  deleted_at: string | null
}

const COLS =
  'id, security_id, firm, report_type, title, published_at, rating_label, rating_value, ' +
  'prior_rating_label, target_price, prior_target_price, price_at_publication, suitability, ' +
  'recommendation_text, valuation_text, analysts, market_data, doc_path, source_filename, ' +
  'parse_status, raw_header, created_at, deleted_at'

function mapRow(r: Record<string, unknown>): ExternalResearch {
  return {
    id: r.id as number,
    security_id: r.security_id as string,
    firm: r.firm as string,
    report_type: (r.report_type as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    published_at: (r.published_at as string | null) ?? null,
    rating_label: (r.rating_label as string | null) ?? null,
    rating_value: (r.rating_value as number | null) ?? null,
    prior_rating_label: (r.prior_rating_label as string | null) ?? null,
    target_price: (r.target_price as number | null) ?? null,
    prior_target_price: (r.prior_target_price as number | null) ?? null,
    price_at_publication: (r.price_at_publication as number | null) ?? null,
    suitability: (r.suitability as string | null) ?? null,
    recommendation_text: (r.recommendation_text as string | null) ?? null,
    valuation_text: (r.valuation_text as string | null) ?? null,
    analysts: (r.analysts as ParsedAnalyst[] | null) ?? null,
    market_data: (r.market_data as Record<string, string> | null) ?? null,
    doc_path: (r.doc_path as string | null) ?? null,
    source_filename: (r.source_filename as string | null) ?? null,
    parse_status: r.parse_status as ParseStatus,
    raw_header: (r.raw_header as string | null) ?? null,
    created_at: r.created_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** All non-deleted reports for a security, newest published first. */
export async function fetchExternalResearch(securityId: string): Promise<ExternalResearch[]> {
  const { data, error } = await supabase
    .from('external_research')
    .select(COLS)
    .eq('security_id', securityId.toUpperCase())
    .is('deleted_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
}

/** The most recent report for a security, or null. Used to detect rating/target changes. */
export async function fetchLatestExternalResearch(securityId: string): Promise<ExternalResearch | null> {
  const { data, error } = await supabase
    .from('external_research')
    .select(COLS)
    .eq('security_id', securityId.toUpperCase())
    .is('deleted_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data as unknown as Record<string, unknown>) : null
}

export interface NewExternalResearch {
  security_id: string
  firm: string
  report_type?: string | null
  title?: string | null
  published_at?: string | null
  rating_label?: string | null
  rating_value?: number | null
  prior_rating_label?: string | null
  target_price?: number | null
  prior_target_price?: number | null
  price_at_publication?: number | null
  suitability?: string | null
  recommendation_text?: string | null
  valuation_text?: string | null
  analysts?: ParsedAnalyst[] | null
  market_data?: Record<string, string> | null
  doc_path?: string | null
  source_filename?: string | null
  parse_status?: ParseStatus
  raw_header?: string | null
}

export async function insertExternalResearch(input: NewExternalResearch): Promise<number> {
  const { data, error } = await supabase
    .from('external_research')
    .insert({
      ...input,
      security_id: input.security_id.toUpperCase(),
      parse_status: input.parse_status ?? 'parsed',
      // jsonb columns: the domain shapes are structurally JSON, but the generated
      // `Json` type needs an explicit cast at the write boundary.
      analysts: (input.analysts ?? null) as unknown as Json,
      market_data: (input.market_data ?? null) as unknown as Json,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

/** Soft-delete. The underlying PDF in Storage is removed separately. */
export async function deleteExternalResearch(id: number): Promise<void> {
  const { error } = await supabase
    .from('external_research')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/* ── derived helpers ───────────────────────────────────────────────────────── */

/**
 * Turn a parsed PDF into an insert payload. Kept here (not in the parser) so the
 * parser stays free of any DB shape.
 */
export function toInsert(
  parsed: ParsedResearch,
  extra: { securityId: string; docPath: string | null; sourceFilename: string; priorRatingLabel?: string | null },
): NewExternalResearch {
  return {
    security_id: extra.securityId,
    firm: parsed.firm,
    report_type: parsed.reportType,
    title: parsed.title,
    published_at: parsed.publishedAt,
    rating_label: parsed.ratingLabel,
    rating_value: parsed.ratingValue,
    prior_rating_label: extra.priorRatingLabel ?? null,
    target_price: parsed.targetPrice,
    prior_target_price: parsed.priorTargetPrice,
    price_at_publication: parsed.priceAtPublication,
    suitability: parsed.suitability,
    recommendation_text: parsed.recommendationText,
    valuation_text: parsed.valuationText,
    analysts: parsed.analysts.length ? parsed.analysts : null,
    market_data: Object.keys(parsed.marketData).length ? parsed.marketData : null,
    doc_path: extra.docPath,
    source_filename: extra.sourceFilename,
    parse_status: parsed.missing.length ? 'partial' : 'parsed',
    raw_header: parsed.rawHeader,
  }
}

/**
 * Tailwind classes for a rating badge. Raymond James scores 1 (Strong Buy) to
 * 4 (Underperform); anything unscored renders neutral.
 */
export function ratingTone(ratingValue: number | null): string {
  switch (ratingValue) {
    case 1: return 'bg-green-100 text-green-800 ring-green-200'
    case 2: return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 3: return 'bg-amber-50 text-amber-700 ring-amber-200'
    case 4:
    case 5: return 'bg-red-50 text-red-700 ring-red-200'
    default: return 'bg-gray-100 text-gray-600 ring-gray-200'
  }
}

/** Fractional upside from a price to the target, e.g. 0.0895 for +8.95%. */
export function targetUpside(target: number | null, price: number | null): number | null {
  if (target == null || price == null || price <= 0) return null
  return target / price - 1
}

/** Direction of the target-price revision printed on the report (↑ / ↓). */
export function targetDirection(target: number | null, prior: number | null): 'up' | 'down' | null {
  if (target == null || prior == null || target === prior) return null
  return target > prior ? 'up' : 'down'
}

/**
 * Whether a newly-imported report is a negative revision worth an action item:
 * a rating downgrade (a HIGHER RJ number is worse), or a target cut of at least
 * `cutThreshold`.
 */
export function isNegativeRevision(
  next: { rating_value: number | null; target_price: number | null; prior_target_price: number | null },
  priorRatingValue: number | null,
  cutThreshold = 0.1,
): { downgrade: boolean; targetCut: number | null } {
  const downgrade =
    next.rating_value != null && priorRatingValue != null && next.rating_value > priorRatingValue

  let targetCut: number | null = null
  if (next.target_price != null && next.prior_target_price != null && next.prior_target_price > 0) {
    const change = next.target_price / next.prior_target_price - 1
    if (change <= -cutThreshold) targetCut = change
  }
  return { downgrade, targetCut }
}
