/**
 * strategicAllocation.ts
 *
 * The firm's published **Strategic Asset Allocation Models** — parsing one
 * vintage out of the Raymond James PDF, diffing it against the vintage before
 * it, and reporting where the live model portfolios have drifted from it.
 *
 * Pure and React-free: the parser takes already-extracted text, so it is
 * testable without a PDF reader and the same function serves the preview and
 * the write.
 *
 * **Three things about this document are worth knowing before touching it.**
 *
 * 1. **Its fourteen rows are exactly `ASSET_CLASS_ROWS`, in order.** This is
 *    where the app's asset-class vocabulary came from, which is why the parse
 *    maps straight onto `AssetClassKey` with no translation table beyond the
 *    two labels the PDF spells differently.
 * 2. **A vintage is keyed on the month PRINTED IN THE DOCUMENT**, never on the
 *    upload time. An older document can legitimately be uploaded later —
 *    uploading January after October must file January behind October rather
 *    than make it look current.
 * 3. **Nothing here touches `model_portfolio_data`, in either direction.** The
 *    advisor maintains the models; this is the published reference they are
 *    maintained against, and it neither writes them nor reports on them. It did
 *    briefly carry a read-only drift report; that was removed on request in Nov
 *    2026 along with the comparison behind it, rather than left as an unused
 *    export. `git log` has it if it is ever wanted back.
 */
import { ASSET_CLASS_ROWS, type AssetClassKey } from './modelPortfolios'

// ── The five published risk profiles ─────────────────────────────────────────

export const STRATEGIC_PROFILES = [
  'conservative', 'moderate_conservative', 'moderate', 'moderate_growth', 'growth',
] as const

export type StrategicProfile = typeof STRATEGIC_PROFILES[number]

/** Column headings, left to right, as the document prints them. */
export const PROFILE_LABELS: Record<StrategicProfile, string> = {
  conservative:          'Conservative',
  moderate_conservative: 'Moderate Conservative',
  moderate:              'Moderate',
  moderate_growth:       'Moderate Growth',
  growth:                'Growth',
}

// ── Row labels ───────────────────────────────────────────────────────────────

/**
 * How each asset class is written IN THE PDF.
 *
 * Twelve of the fourteen match `ASSET_CLASS_ROWS` word for word. The two that
 * do not are the banded rows: the document calls them "ALTERNATIVE
 * INVESTMENTS/MANAGED FUTURES" and "CASH & CASH ALTERNATIVES". Both are leaf
 * rows carrying a figure despite being styled like the EQUITY and FIXED INCOME
 * group headers.
 */
const PDF_ROW_LABEL: Record<AssetClassKey, string> = {
  large_cap_blend:              'US Large Cap Blend',
  large_cap_growth:             'US Large Cap Growth',
  large_cap_value:              'US Large Cap Value',
  us_mid_cap:                   'US Mid Cap Equity',
  us_small_cap:                 'US Small Cap Equity',
  non_us_developed:             'Non-US Developed Market Equity',
  emerging_market:              'Emerging Market Equity',
  ig_intermediate_fixed_income: 'Investment Grade Intermediate Maturity Fixed Income',
  ig_short_fixed_income:        'Investment Grade Short Maturity Fixed Income',
  non_ig_fixed_income:          'Non-Investment Grade Fixed Income',
  non_us_fixed_income:          'Non-US Fixed Income',
  multi_sector_fixed_income:    'Multi-Sector Fixed Income',
  alternatives:                 'ALTERNATIVE INVESTMENTS/MANAGED FUTURES',
  cash:                         'CASH & CASH ALTERNATIVES',
}

/** The rows the EQUITY band totals. */
export const EQUITY_KEYS: AssetClassKey[] = [
  'large_cap_blend', 'large_cap_growth', 'large_cap_value',
  'us_mid_cap', 'us_small_cap', 'non_us_developed', 'emerging_market',
]

/** The rows the FIXED INCOME band totals. */
export const FIXED_INCOME_KEYS: AssetClassKey[] = [
  'ig_intermediate_fixed_income', 'ig_short_fixed_income',
  'non_ig_fixed_income', 'non_us_fixed_income', 'multi_sector_fixed_income',
]

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

// ── Types ────────────────────────────────────────────────────────────────────

/** `weights[profile][assetClassKey]` in percent points, as printed. */
export type ProfileWeights = Record<StrategicProfile, Partial<Record<AssetClassKey, number>>>

export interface ParsedVintage {
  /** First of the printed month, `YYYY-MM-01`. */
  effectiveMonth: string
  /** As printed, e.g. "October 2026". */
  label: string
  weights: ProfileWeights
  /**
   * Parsed but NOT stored: the printed EQUITY and FIXED INCOME band totals,
   * used only to check the rows beneath them add up. Storing a total beside
   * the rows it totals is how the two start disagreeing.
   */
  printedTotals: { equity: number[]; fixedIncome: number[] }
  /** Non-fatal: the parse is usable, but say so before writing. */
  warnings: string[]
}

export class StrategicAllocationParseError extends Error {}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Collapse the page to one line.
 *
 * Row labels wrap mid-phrase in the extracted text ("Investment Grade
 * Intermediate Maturity\nFixed Income"), so every label has to be matched
 * across whitespace. The `AL TERNATIVE` fix is not cosmetic: the PDF's
 * letter-spacing puts a real space inside the word, in both the band row and
 * the cash row, and without it neither row is found.
 */
export function normalizePdfText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/AL\s+TERNATIVE/gi, 'ALTERNATIVE')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `Investment Grade …` → a regex tolerating a line break between any words. */
function labelPattern(label: string): string {
  return label
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
}

/** Five consecutive percentages, one per profile column. */
const FIVE_PCTS = '\\s+(-?\\d+(?:\\.\\d+)?)\\s*%' .repeat(5)

function readRow(text: string, label: string): number[] | null {
  const m = new RegExp(labelPattern(label) + FIVE_PCTS, 'i').exec(text)
  if (!m) return null
  return m.slice(1, 6).map(Number)
}

/**
 * Parse one vintage out of the text of the document's **first page**.
 *
 * Passing the whole document is safe: the definitions and disclosure pages
 * mention the same asset-class names, but never followed by five percentages,
 * so the row pattern cannot match there.
 *
 * Throws when the document is not this document. A half-parsed set of governed
 * weights is worse than a refusal — the caller shows the error and writes
 * nothing.
 */
export function parseStrategicAllocationPdfText(raw: string): ParsedVintage {
  const text = normalizePdfText(raw)
  const warnings: string[] = []

  const monthMatch = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{4})\\b`, 'i').exec(text)
  if (!monthMatch) {
    throw new StrategicAllocationParseError(
      'No month and year found in the document. Expected a header like "OCTOBER 2026".',
    )
  }
  const monthIndex = MONTHS.indexOf(monthMatch[1].toLowerCase())
  const year = Number(monthMatch[2])
  const effectiveMonth = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`
  const label = `${monthMatch[1][0].toUpperCase()}${monthMatch[1].slice(1).toLowerCase()} ${year}`

  const weights = Object.fromEntries(
    STRATEGIC_PROFILES.map((p) => [p, {} as Partial<Record<AssetClassKey, number>>]),
  ) as ProfileWeights

  const missing: string[] = []
  for (const row of ASSET_CLASS_ROWS) {
    const values = readRow(text, PDF_ROW_LABEL[row.key])
    if (!values) { missing.push(PDF_ROW_LABEL[row.key]); continue }
    STRATEGIC_PROFILES.forEach((profile, i) => { weights[profile][row.key] = values[i] })
  }

  if (missing.length === ASSET_CLASS_ROWS.length) {
    throw new StrategicAllocationParseError(
      'No allocation rows found. This does not look like a Strategic Asset Allocation Models document.',
    )
  }
  if (missing.length > 0) {
    throw new StrategicAllocationParseError(
      `${missing.length} of ${ASSET_CLASS_ROWS.length} rows could not be read: ${missing.join(', ')}. ` +
      'Refusing a partial parse — every row of a published model set has to be read or none of it.',
    )
  }

  const equityTotals = readRow(text, 'EQUITY')
  const fixedTotals = readRow(text, 'FIXED INCOME')
  if (!equityTotals || !fixedTotals) {
    warnings.push('The EQUITY / FIXED INCOME band totals could not be read, so the rows were not checked against them.')
  } else {
    STRATEGIC_PROFILES.forEach((profile, i) => {
      const eq = sumOf(weights[profile], EQUITY_KEYS)
      const fi = sumOf(weights[profile], FIXED_INCOME_KEYS)
      if (Math.abs(eq - equityTotals[i]) > 0.051) {
        warnings.push(`${PROFILE_LABELS[profile]}: equity rows total ${fmt(eq)}% against a printed ${fmt(equityTotals[i])}%.`)
      }
      if (Math.abs(fi - fixedTotals[i]) > 0.051) {
        warnings.push(`${PROFILE_LABELS[profile]}: fixed income rows total ${fmt(fi)}% against a printed ${fmt(fixedTotals[i])}%.`)
      }
    })
  }

  // The whole book must add up, or a column was misread.
  for (const profile of STRATEGIC_PROFILES) {
    const total = sumOf(weights[profile], ASSET_CLASS_ROWS.map((r) => r.key))
    if (Math.abs(total - 100) > 0.051) {
      warnings.push(`${PROFILE_LABELS[profile]}: the fourteen rows total ${fmt(total)}%, not 100%.`)
    }
  }

  return {
    effectiveMonth,
    label,
    weights,
    printedTotals: { equity: equityTotals ?? [], fixedIncome: fixedTotals ?? [] },
    warnings,
  }
}

function sumOf(row: Partial<Record<AssetClassKey, number>>, keys: AssetClassKey[]): number {
  return keys.reduce((acc, k) => acc + (row[k] ?? 0), 0)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** The EQUITY / FIXED INCOME band figure for one profile, summed from its rows. */
export function bandTotal(
  weights: ProfileWeights, profile: StrategicProfile, band: 'equity' | 'fixed_income',
): number {
  return sumOf(weights[profile], band === 'equity' ? EQUITY_KEYS : FIXED_INCOME_KEYS)
}

// ── Diffing one vintage against the one before it ────────────────────────────

export interface WeightChange {
  profile: StrategicProfile
  assetClassKey: AssetClassKey
  label: string
  from: number | null
  to: number | null
}

/**
 * What moved between two vintages.
 *
 * **Derived on read, never stored.** The same reasoning as the portfolio Change
 * Log: a stored note is a second copy of what the two vintages already say, and
 * the two drift. Recomputing is cheap and cannot disagree with the table above
 * it.
 *
 * A row absent from one side is reported with a null, not as a zero — "not in
 * that document" and "published at 0%" are different statements, and the
 * document does publish real zeros.
 */
export function diffVintages(
  previous: ProfileWeights | null,
  next: ProfileWeights,
): WeightChange[] {
  if (!previous) return []
  const changes: WeightChange[] = []
  for (const profile of STRATEGIC_PROFILES) {
    for (const row of ASSET_CLASS_ROWS) {
      const from = previous[profile]?.[row.key] ?? null
      const to = next[profile]?.[row.key] ?? null
      if (from === null && to === null) continue
      // A float round-trip through numeric() renders 4 as 4.0000001; below a
      // twentieth of a point there is nothing a reader could act on.
      if (from !== null && to !== null && Math.abs(from - to) < 0.051) continue
      changes.push({ profile, assetClassKey: row.key, label: row.label, from, to })
    }
  }
  return changes
}

/** The vintage at which the most recent change appeared, and what it was. */
export interface LastChange {
  /** The vintage the change APPEARED IN. */
  label: string
  effectiveMonth: string
  /** The vintage it changed from. */
  previousLabel: string
  changes: WeightChange[]
}

/**
 * Walking back from `fromIndex`, the most recent vintage where anything moved.
 *
 * The published models go months without changing — on the five documents
 * through 2026 the only movement was January to February, and April, July and
 * October are identical to it. So "no changes from the last document" is the
 * usual answer and on its own it is not very informative: the question a reader
 * actually has is *when did this last move, and to what*.
 *
 * `vintages` must be NEWEST FIRST, the order `fetchStrategicVintages` returns.
 * Returns null when nothing ever changed, or when the selected vintage is the
 * earliest on file — in both cases there is no earlier movement to point at.
 */
export function findLastChange(
  vintages: { label: string; effectiveMonth: string; weights: ProfileWeights }[],
  fromIndex = 0,
): LastChange | null {
  for (let i = Math.max(0, fromIndex); i < vintages.length - 1; i++) {
    const next = vintages[i]
    const previous = vintages[i + 1]
    const changes = diffVintages(previous.weights, next.weights)
    if (changes.length > 0) {
      return {
        label: next.label,
        effectiveMonth: next.effectiveMonth,
        previousLabel: previous.label,
        changes,
      }
    }
  }
  return null
}

// ── Data access ──────────────────────────────────────────────────────────────

import { supabase } from './supabase'

export interface StrategicVintage {
  id: number
  effectiveMonth: string
  label: string
  sourceDocBucket: string | null
  sourceDocPath: string | null
  sourceFileName: string | null
  uploadedAt: string
  weights: ProfileWeights
}

function emptyWeights(): ProfileWeights {
  return Object.fromEntries(
    STRATEGIC_PROFILES.map((p) => [p, {}]),
  ) as ProfileWeights
}

/**
 * Every vintage, newest first BY THE MONTH PRINTED IN THE DOCUMENT.
 *
 * Not by `uploaded_at`: an older document uploaded today must file behind the
 * newer one it predates, or the page would show January as current and the
 * drift report would mark every model wrong.
 */
export async function fetchStrategicVintages(): Promise<StrategicVintage[]> {
  const { data: vintages, error } = await supabase
    .from('strategic_allocation_vintages')
    .select('id, effective_month, label, source_doc_bucket, source_doc_path, source_file_name, uploaded_at')
    .order('effective_month', { ascending: false })
  if (error) throw error
  if (!vintages || vintages.length === 0) return []

  const { data: rows, error: rowsError } = await supabase
    .from('strategic_allocation_weights')
    .select('vintage_id, profile, asset_class_key, weight_pct')
    .in('vintage_id', vintages.map((v) => v.id))
  if (rowsError) throw rowsError

  const byVintage = new Map<number, ProfileWeights>()
  for (const v of vintages) byVintage.set(v.id, emptyWeights())
  for (const r of rows ?? []) {
    const bag = byVintage.get(r.vintage_id)
    if (!bag) continue
    bag[r.profile as StrategicProfile][r.asset_class_key as AssetClassKey] = Number(r.weight_pct)
  }

  return vintages.map((v) => ({
    id: v.id,
    effectiveMonth: v.effective_month,
    label: v.label,
    sourceDocBucket: v.source_doc_bucket,
    sourceDocPath: v.source_doc_path,
    sourceFileName: v.source_file_name,
    uploadedAt: v.uploaded_at,
    weights: byVintage.get(v.id) ?? emptyWeights(),
  }))
}

/**
 * Write one vintage and its seventy weights.
 *
 * Re-uploading the same month REPLACES it rather than adding a second record —
 * `effective_month` is unique, and two records for one month would diff against
 * each other and report phantom changes. The weights are deleted and
 * re-inserted inside that replacement so a row dropped from a revised document
 * does not survive.
 *
 * `sourceDocPath` must be the path the upload RETURNED. The server
 * date-prefixes and sanitises the filename, so a path derived on the client
 * points at a file that does not exist (gotcha 15).
 */
export async function saveStrategicVintage(input: {
  parsed: ParsedVintage
  sourceDocBucket: string | null
  sourceDocPath: string | null
  sourceFileName: string | null
}): Promise<number> {
  const { parsed } = input
  const { data: vintage, error } = await supabase
    .from('strategic_allocation_vintages')
    .upsert({
      effective_month: parsed.effectiveMonth,
      label: parsed.label,
      source_doc_bucket: input.sourceDocBucket,
      source_doc_path: input.sourceDocPath,
      source_file_name: input.sourceFileName,
      uploaded_at: new Date().toISOString(),
    }, { onConflict: 'effective_month' })
    .select('id')
    .single()
  if (error) throw error

  const { error: clearError } = await supabase
    .from('strategic_allocation_weights')
    .delete()
    .eq('vintage_id', vintage.id)
  if (clearError) throw clearError

  const rows = STRATEGIC_PROFILES.flatMap((profile) =>
    ASSET_CLASS_ROWS.flatMap((row) => {
      const weight = parsed.weights[profile]?.[row.key]
      return weight === undefined ? [] : [{
        vintage_id: vintage.id,
        profile,
        asset_class_key: row.key,
        weight_pct: weight,
      }]
    }),
  )
  const { error: insertError } = await supabase
    .from('strategic_allocation_weights')
    .insert(rows)
  if (insertError) throw insertError

  return vintage.id
}

/** Remove a vintage. The weights cascade; the stored PDF is left in place. */
export async function deleteStrategicVintage(id: number): Promise<void> {
  const { error } = await supabase.from('strategic_allocation_vintages').delete().eq('id', id)
  if (error) throw error
}
