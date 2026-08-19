/**
 * researchPdfParse.ts
 *
 * Pure parser for sell-side research PDFs — currently the Raymond James
 * template (Apache FOP generated, stable two-column cover page).
 *
 * React-free and pdfjs-free on purpose: it takes already-extracted positioned
 * text items (see `lib/pdfExtract.ts` for the browser glue) so the same code can
 * be exercised in a plain Node harness. Everything here is best-effort — the
 * caller shows the result in a review modal before it is saved, and `missing`
 * lists the fields the parser could not find.
 *
 * Cover-page geometry (letter, 612pt wide): the narrative column sits at x≈36
 * and the metadata sidebar at x≈419, so the two are separated by an x split
 * rather than by reading order — otherwise the sidebar's market-data rows
 * interleave into the narrative paragraphs.
 */

/** One positioned text run from the PDF (pdfjs `TextItem`, reduced to what we need). */
export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
}

/** A visual line, split into horizontal runs (label / value in the sidebar). */
export interface PdfLine {
  y: number
  x: number
  runs: string[]
}

/** One extracted page: its width (for the column split) and its positioned items. */
export interface PdfPageItems {
  width: number
  items: PdfTextItem[]
}

export interface ParsedAnalyst {
  name: string
  credential: string | null
  phone: string | null
  email: string | null
}

export interface ParsedResearch {
  firm: string
  securityId: string | null
  companyName: string | null
  exchange: string | null
  industry: string | null
  title: string | null
  reportType: string | null
  /** ISO-8601 with the report's own timezone offset when a time was printed. */
  publishedAt: string | null
  ratingLabel: string | null
  ratingValue: number | null
  targetPrice: number | null
  priorTargetPrice: number | null
  priceAtPublication: number | null
  suitability: string | null
  recommendationText: string | null
  valuationText: string | null
  analysts: ParsedAnalyst[]
  marketData: Record<string, string>
  rawHeader: string
  /** Fields the parser expected but could not locate — drives the "partial" badge. */
  missing: string[]
}

/* ── text-item → lines ─────────────────────────────────────────────────────── */

/** Vertical tolerance (pt) for treating two items as the same visual line. */
const Y_BUCKET = 2
/** Horizontal gap (pt) that starts a new run within a line. */
const RUN_GAP = 2.5
/**
 * Gap (pt) that implies a word space. Most spaces in this template are real
 * glyphs, but a font switch mid-sentence (an italicised event name) is kerned
 * instead, which would otherwise glue two words together.
 */
const SPACE_GAP = 0.6
/** Fraction of page width at which the metadata sidebar begins. */
const SIDEBAR_X = 0.62

/**
 * Group positioned items into visual lines, top-to-bottom, each split into runs.
 * A gap wider than `RUN_GAP` starts a new run; a narrower but non-zero gap is
 * treated as a word space.
 */
export function buildLines(items: PdfTextItem[]): PdfLine[] {
  const buckets = new Map<number, PdfTextItem[]>()
  for (const it of items) {
    if (!it.str) continue
    const key = Math.round(it.y / Y_BUCKET)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(it)
    else buckets.set(key, [it])
  }

  const lines: PdfLine[] = []
  for (const group of buckets.values()) {
    group.sort((a, b) => a.x - b.x)
    const runs: string[] = []
    let current = ''
    let cursor = Number.NaN
    for (const it of group) {
      const gap = it.x - cursor
      if (!Number.isNaN(cursor)) {
        if (gap > RUN_GAP) {
          if (current.trim()) runs.push(current.trim())
          current = ''
        } else if (gap > SPACE_GAP && !/\s$/.test(current)) {
          current += ' '
        }
      }
      current += it.str.replace(/\u00a0/g, ' ')
      cursor = it.x + it.width
    }
    if (current.trim()) runs.push(current.trim())
    if (runs.length) lines.push({ y: group[0].y, x: group[0].x, runs })
  }
  return lines.sort((a, b) => b.y - a.y)
}

const lineText = (l: PdfLine): string => l.runs.join(' ').replace(/\s{2,}/g, ' ').trim()

/** Boilerplate that frames the cover page but is never part of a section body. */
const BOILERPLATE =
  /^(This report is intended for|Please read domestic|INTERNATIONAL HEADQUARTERS|PAGE \d+ OF \d+|US RESEARCH\b|Source: )/i

const isBoilerplate = (t: string): boolean => BOILERPLATE.test(t)

/** An all-caps section heading such as RECOMMENDATION / VALUATION. */
function isHeading(t: string): boolean {
  return t.length >= 4 && t.length <= 48 && !/[a-z]/.test(t) && /^[A-Z][A-Z \d&/,'’.-]*$/.test(t)
}

/* ── scalar helpers ────────────────────────────────────────────────────────── */

/** Parse a printed figure: `$565.00`, `1,659.0`, `$(8,487)` (negative), `4%`. */
export function parseFigure(raw: string | null | undefined): number | null {
  if (!raw) return null
  const negative = /\(.*\)/.test(raw)
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!cleaned || !/\d/.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
}

/** US market timezones as printed on the cover page → UTC offset. */
const TZ_OFFSET: Record<string, string> = {
  EDT: '-04:00', EST: '-05:00', CDT: '-05:00', CST: '-06:00',
  MDT: '-06:00', MST: '-07:00', PDT: '-07:00', PST: '-08:00',
  GMT: '+00:00', UTC: '+00:00',
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `AUGUST 4, 2026 | 10:41 PM EDT` → `2026-08-04T22:41:00-04:00`. */
export function parsePublishedAt(text: string): string | null {
  const m = /\b([A-Z]{3,9})\s+(\d{1,2}),\s*(\d{4})(?:\s*\|\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*([A-Z]{2,4}))?/i.exec(text)
  if (!m) return null
  const month = MONTHS[m[1].toUpperCase()]
  if (!month) return null
  const day = Number(m[2])
  const year = Number(m[3])
  const date = `${year}-${pad(month)}-${pad(day)}`
  if (!m[4]) return date

  let hour = Number(m[4]) % 12
  if (m[6].toUpperCase() === 'PM') hour += 12
  const offset = TZ_OFFSET[m[7].toUpperCase()] ?? 'Z'
  return `${date}T${pad(hour)}:${m[5]}:00${offset}`
}

/** Raymond James rating scale, as printed on the cover page. */
export const RJ_RATINGS: Record<string, number> = {
  'Strong Buy': 1,
  Outperform: 2,
  'Market Perform': 3,
  Underperform: 4,
  Suspended: 5,
}

const RATING_LINE = /^(Strong Buy|Outperform|Market Perform|Underperform|Suspended|Under Review)\s*([1-5])?$/i

/** Canonical casing for a rating label parsed out of a report. */
function canonicalRating(raw: string): string {
  const hit = Object.keys(RJ_RATINGS).find((k) => k.toLowerCase() === raw.toLowerCase())
  return hit ?? raw.replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ── detection ─────────────────────────────────────────────────────────────── */

/** True when the first page carries the Raymond James cover-page masthead. */
export function isRaymondJamesReport(page: PdfPageItems): boolean {
  const text = page.items.map((i) => i.str).join(' ').toUpperCase()
  return text.includes('RAYMOND JAMES')
}

/* ── the parser ────────────────────────────────────────────────────────────── */

/**
 * Parse the cover page of a Raymond James research PDF.
 *
 * Only page 1 is read: the RJ template puts the full summary (rating, target,
 * market data, RECOMMENDATION and VALUATION) on the cover, and later pages are
 * model tables and disclosures.
 */
export function parseRaymondJames(page: PdfPageItems): ParsedResearch {
  const split = page.width * SIDEBAR_X
  const left = buildLines(page.items.filter((i) => i.x < split))
  const right = buildLines(page.items.filter((i) => i.x >= split))
  const all = buildLines(page.items)

  const leftText = left.map(lineText)
  const rightText = right.map(lineText)
  const rawHeader = all.map(lineText).filter(Boolean).join('\n')

  /* Security identity — "ADVANCED MICRO DEVICES, INC. (AMD-NASDAQ)" */
  let securityId: string | null = null
  let companyName: string | null = null
  let exchange: string | null = null
  let industry: string | null = null
  const idIdx = leftText.findIndex((t) => /\([A-Z][A-Z.-]{0,6}-[A-Za-z][A-Za-z ]*\)\s*$/.test(t))
  if (idIdx >= 0) {
    const m = /^(.*?)\s*\(([A-Z][A-Z.-]{0,6})-([A-Za-z][A-Za-z ]*)\)\s*$/.exec(leftText[idIdx])
    if (m) {
      companyName = m[1].trim() || null
      securityId = m[2].trim()
      exchange = m[3].trim()
    }
    const next = leftText[idIdx + 1]
    if (next && !isBoilerplate(next) && next.length <= 60 && !next.includes('|')) industry = next
  }

  /* Analysts — "Simon Leopold | (212) 856-5464 | simon.leopold@raymondjames.com" */
  const analysts: ParsedAnalyst[] = []
  let lastAnalystIdx = -1
  leftText.forEach((t, i) => {
    const m = /^(.+?)\s*\|\s*([()\d][()\d\s.\-+]{6,22})\s*\|\s*([^\s@]+@[^\s]+)$/.exec(t)
    if (!m) return
    const [nameRaw, credential] = splitCredential(m[1].trim())
    analysts.push({ name: nameRaw, credential, phone: m[2].trim(), email: m[3].trim() })
    lastAnalystIdx = i
  })

  /* Title — the line(s) between the analyst block and the first section heading */
  let title: string | null = null
  const firstHeadingIdx = leftText.findIndex((t, i) => i > lastAnalystIdx && isHeading(t))
  if (lastAnalystIdx >= 0) {
    const end = firstHeadingIdx > 0 ? firstHeadingIdx : leftText.length
    const parts = leftText
      .slice(lastAnalystIdx + 1, end)
      .filter((t) => t && !isBoilerplate(t) && !isHeading(t))
    if (parts.length) title = parts.join(' ').replace(/\s{2,}/g, ' ').trim()
  }

  /* Sidebar: date, report type, rating, target price, suitability */
  const publishedAt = parsePublishedAt(rightText.join('\n'))

  let reportType: string | null = null
  const dateIdx = rightText.findIndex((t) => /\b[A-Z]{3,9}\s+\d{1,2},\s*\d{4}\b/i.test(t))
  if (dateIdx >= 0) {
    const next = rightText.slice(dateIdx + 1).find((t) => t.length > 0)
    if (next && isHeading(next)) reportType = titleCase(next)
  }

  let ratingLabel: string | null = null
  let ratingValue: number | null = null
  for (const t of rightText) {
    const m = RATING_LINE.exec(t)
    if (!m) continue
    ratingLabel = canonicalRating(m[1])
    ratingValue = m[2] ? Number(m[2]) : (RJ_RATINGS[ratingLabel] ?? null)
    break
  }

  const targetLine = rightText.find((t) => /Target Price/i.test(t)) ?? ''
  const targetPrice = parseFigure(/Target Price\s*\$?\s*([\d,]+(?:\.\d+)?)/i.exec(targetLine)?.[1])
  const priorTargetPrice = parseFigure(/old:\s*\$?\s*([\d,]+(?:\.\d+)?)/i.exec(targetLine)?.[1])

  const suitability =
    right.map((l) => l.runs).find((r) => r.length >= 2 && /^Suitability$/i.test(r[0]))?.[1] ??
    /Suitability\s+([A-Z/]{2,12})/.exec(rightText.join('\n'))?.[1] ??
    null

  /* Market-data block — label run + right-aligned value run */
  const marketData: Record<string, string> = {}
  const mdStart = right.findIndex((l) => /^MARKET DATA$/i.test(lineText(l)))
  if (mdStart >= 0) {
    for (const l of right.slice(mdStart + 1)) {
      const text = lineText(l)
      if (!text || isBoilerplate(text)) continue
      if (isHeading(text)) break
      const pair = splitLabelValue(l)
      if (pair) marketData[pair[0]] = pair[1]
    }
  }
  const priceKey = Object.keys(marketData).find((k) => /^Current Price/i.test(k))
  const priceAtPublication = priceKey ? parseFigure(marketData[priceKey]) : null

  /* Narrative sections from the left column */
  const recommendationText = sectionBody(left, 'RECOMMENDATION')
  const valuationText = sectionBody(left, 'VALUATION')

  const parsed: ParsedResearch = {
    firm: 'Raymond James',
    securityId,
    companyName,
    exchange,
    industry,
    title,
    reportType,
    publishedAt,
    ratingLabel,
    ratingValue,
    targetPrice,
    priorTargetPrice,
    priceAtPublication,
    suitability,
    recommendationText,
    valuationText,
    analysts,
    marketData,
    rawHeader,
    missing: [],
  }
  parsed.missing = missingFields(parsed)
  return parsed
}

/**
 * Value of a right-aligned sidebar row: `$860,324`, `$(8,487)`, `0.0%`,
 * `1,659.0`, or a range like `$149.22 - $584.73`.
 */
const SIDEBAR_VALUE = /^(.*?\S)\s+(\$?\(?-?[\d,]+(?:\.\d+)?\)?%?(?:x)?(?:\s*-\s*\$?[\d,]+(?:\.\d+)?)?)$/

/**
 * Split a sidebar row into label + value. Prefers the run split (a wide gap
 * between label and right-aligned value); falls back to a text regex because
 * the template usually pads that gap with real space glyphs, leaving one run.
 */
function splitLabelValue(l: PdfLine): [string, string] | null {
  if (l.runs.length >= 2) return [l.runs[0], l.runs.slice(1).join(' ')]
  const m = SIDEBAR_VALUE.exec(lineText(l))
  return m ? [m[1].trim(), m[2].trim()] : null
}

/** Split "Victor Chiu, Sr. Res. Assoc." into name + credential. */
function splitCredential(raw: string): [string, string | null] {
  const i = raw.indexOf(',')
  if (i < 0) return [raw, null]
  return [raw.slice(0, i).trim(), raw.slice(i + 1).trim() || null]
}

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bOf\b/g, 'of')
}

/**
 * Collect a section body: every line after the heading until the next heading
 * or the page boilerplate. Bulleted lines start a new paragraph; wrapped
 * continuation lines fold back into the paragraph they belong to.
 */
function sectionBody(lines: PdfLine[], heading: string): string | null {
  const start = lines.findIndex((l) => lineText(l).toUpperCase() === heading)
  if (start < 0) return null

  const paragraphs: string[] = []
  for (const l of lines.slice(start + 1)) {
    const text = lineText(l)
    if (!text) continue
    if (isBoilerplate(text)) break
    if (isHeading(text)) break
    const bullet = /^[●•·]/.test(text)
    if (bullet || paragraphs.length === 0) {
      paragraphs.push(bullet ? `• ${text.replace(/^[●•·]\s*/, '')}` : text)
    } else {
      // A line ending in a hyphen wrapped mid-compound ("step-" / "up"): the
      // template only breaks at hyphens that belong to the word, so keep it.
      const prev = paragraphs[paragraphs.length - 1]
      paragraphs[paragraphs.length - 1] = /[A-Za-z]-$/.test(prev) ? prev + text : `${prev} ${text}`
    }
  }
  const body = paragraphs.map((p) => p.replace(/\s{2,}/g, ' ').trim()).filter(Boolean).join('\n')
  return body || null
}

/** The fields worth warning about when absent — identity and the headline call. */
function missingFields(p: ParsedResearch): string[] {
  const missing: string[] = []
  if (!p.securityId) missing.push('ticker')
  if (!p.publishedAt) missing.push('published date')
  if (!p.ratingLabel) missing.push('rating')
  if (p.targetPrice == null) missing.push('target price')
  if (p.priceAtPublication == null) missing.push('price at publication')
  if (!p.title) missing.push('title')
  return missing
}
