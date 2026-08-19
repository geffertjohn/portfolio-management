/**
 * fmpTipranks.ts
 *
 * TipRanks analyst data — a paid FMP add-on. Read on demand and never
 * persisted, matching the rest of the FMP layer; the one exception is the stock
 * review, which freezes a summary into `review_log.metrics_snapshot` so a past
 * review stays reconstructable.
 *
 * What this adds over `lib/fmpAnalyst.ts` (consensus target + grade counts):
 *   1. Analyst identity and TRACK RECORD — `stockSuccessRate` is that analyst's
 *      hit rate on this specific stock; the directory adds rank and star rating.
 *   2. Action taxonomy — initiated / maintained / upgraded / downgraded /
 *      reiterated. The grade distribution is a snapshot; this is the change.
 *   3. Outcome scoring — beats / misses / average return, at symbol, analyst,
 *      and firm level. Lets a source be weighed rather than simply cited.
 *
 * ── REST path landmine ──────────────────────────────────────────────────────
 * FMP's documented/MCP endpoint names do NOT all match the REST paths. The two
 * point-in-time endpoints are `tipranks-pit-symbol` and `tipranks-pit-analyst`;
 * the documented `tipranks-pit-by-symbol` / `-by-analyst` return **HTTP 404 with
 * an empty array body**, so a wrong path looks like "no data" rather than an
 * error. Do not "fix" these names to match the docs.
 */
import { FMP_STABLE, apiKey, asArray, fmpFetch, fmpSymbol, num, str } from './fmpClient'

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type TipRanksAction =
  | 'initiated' | 'maintained' | 'upgraded' | 'downgraded' | 'reiterated' | 'resumed'

export interface TipRanksActionCounts {
  initiated: number
  maintained: number
  upgraded: number
  downgraded: number
  reiterated: number
  resumed: number
}

/**
 * Trailing-window scorecard for a symbol, analyst, or firm. `beats`/`misses`
 * count price targets whose outcome is already resolved, so they sum to
 * `comparedPriceTargets`, not to `totalRecommendations`.
 */
export interface TipRanksSummary {
  from: string | null
  to: string | null
  totalRecommendations: number
  /** Distinct tickers covered in the window (1 for a symbol summary). */
  distinctSymbols: number
  distinctAnalysts: number
  validPriceTargets: number
  buy: number
  hold: number
  sell: number
  actions: TipRanksActionCounts
  comparedPriceTargets: number
  beats: number
  misses: number
  /** Decimal, e.g. 0.3869 = +38.69%. TipRanks' own trailing calculation. */
  averageReturn: number | null
  topReturn: number | null
  worstReturn: number | null
}

/** One dated, attributed rating with its outcome, from `tipranks-pit-symbol`. */
export interface TipRanksRating {
  symbol: string | null
  date: string | null
  recommendationDate: string | null
  expertUID: string | null
  analystName: string | null
  firmName: string | null
  recommendation: string | null
  action: TipRanksAction | null
  priceTarget: number | null
  /** This analyst's success rate on THIS symbol (decimal). */
  stockSuccessRate: number | null
  /** Realised return since the call (decimal), null while unresolved. */
  stockReturn: number | null
  beatTarget: boolean | null
  articleTitle: string | null
  url: string | null
}

/** Directory entry — an analyst's overall track record. */
export interface TipRanksAnalyst {
  expertUID: string
  analystName: string | null
  firmName: string | null
  successRate: number | null
  excessReturn: number | null
  totalRecommendations: number | null
  goodRecommendations: number | null
  analystRank: number | null
  numOfStars: number | null
}

/* ── Mappers ───────────────────────────────────────────────────────────────── */

const ACTIONS: TipRanksAction[] =
  ['initiated', 'maintained', 'upgraded', 'downgraded', 'reiterated', 'resumed']

function asAction(v: unknown): TipRanksAction | null {
  const s = str(v)?.toLowerCase() ?? null
  return s && (ACTIONS as string[]).includes(s) ? (s as TipRanksAction) : null
}

function intOf(v: unknown): number {
  return num(v) ?? 0
}

function mapSummary(r: Record<string, unknown>): TipRanksSummary {
  const recs = (r.recommendations ?? {}) as Record<string, unknown>
  const act = (r.analystAction ?? {}) as Record<string, unknown>
  return {
    from: str(r.from),
    to: str(r.to),
    totalRecommendations: intOf(r.totalRecommendations),
    distinctSymbols: intOf(r.distinctSymbols),
    distinctAnalysts: intOf(r.distinctAnalysts),
    validPriceTargets: intOf(r.validPriceTargets),
    buy: intOf(recs.buy),
    hold: intOf(recs.hold),
    sell: intOf(recs.sell),
    actions: {
      initiated: intOf(act.initiated),
      maintained: intOf(act.maintained),
      upgraded: intOf(act.upgraded),
      downgraded: intOf(act.downgraded),
      reiterated: intOf(act.reiterated),
      resumed: intOf(act.resumed),
    },
    comparedPriceTargets: intOf(r.comparedPriceTargets),
    beats: intOf(r.beats),
    misses: intOf(r.misses),
    averageReturn: num(r.averageReturn),
    topReturn: num(r.topReturn),
    worstReturn: num(r.worstReturn),
  }
}

function mapRating(r: Record<string, unknown>): TipRanksRating {
  return {
    symbol: str(r.symbol),
    date: str(r.date),
    recommendationDate: str(r.recommendationDate) ?? str(r.lastRecommendationDate),
    expertUID: str(r.expertUID),
    analystName: str(r.analystName),
    firmName: str(r.firmName),
    // `pit-symbol` names these `last*`; `search` uses the plain names.
    recommendation: str(r.recommendation) ?? str(r.lastRecommendation),
    action: asAction(r.analystAction ?? r.lastAnalystAction),
    priceTarget: num(r.priceTarget),
    stockSuccessRate: num(r.stockSuccessRate),
    stockReturn: num(r.stockReturn),
    beatTarget: typeof r.beatTarget === 'boolean' ? r.beatTarget : null,
    articleTitle: str(r.articleTitle),
    url: str(r.url),
  }
}

function mapAnalyst(r: Record<string, unknown>): TipRanksAnalyst {
  return {
    expertUID: str(r.expertUID) ?? '',
    analystName: str(r.analystName),
    firmName: str(r.firmName),
    successRate: num(r.successRate),
    excessReturn: num(r.excessReturn),
    totalRecommendations: num(r.totalRecommendations),
    goodRecommendations: num(r.goodRecommendations),
    analystRank: num(r.analystRank),
    numOfStars: num(r.numOfStars),
  }
}

/* ── Fetchers ──────────────────────────────────────────────────────────────── */

/** Trailing-window rating scorecard for one symbol. */
export async function fetchTipRanksSymbolSummary(symbol: string): Promise<TipRanksSummary | null> {
  const rows = asArray(
    await fmpFetch(`${FMP_STABLE}/tipranks-symbol-summary?symbol=${fmpSymbol(symbol)}&apikey=${apiKey()}`),
  )
  return rows[0] ? mapSummary(rows[0]) : null
}

/**
 * Dated ratings for a symbol, newest first, each carrying the analyst's track
 * record on that symbol. This is a rating HISTORY — one analyst can appear
 * several times — so callers wanting "who covers this now" should reduce to the
 * latest row per `expertUID` (see `latestByAnalyst`).
 */
export async function fetchTipRanksRatings(symbol: string, limit = 200): Promise<TipRanksRating[]> {
  const rows = asArray(
    await fmpFetch(
      `${FMP_STABLE}/tipranks-pit-symbol?symbol=${fmpSymbol(symbol)}&limit=${limit}&apikey=${apiKey()}`,
    ),
  )
  return rows.map(mapRating)
}

/** Trailing-window scorecard for one research firm, e.g. "Raymond James". */
export async function fetchTipRanksFirmSummary(firmName: string): Promise<TipRanksSummary | null> {
  const rows = asArray(
    await fmpFetch(
      `${FMP_STABLE}/tipranks-firm-summary?firmName=${encodeURIComponent(firmName)}&apikey=${apiKey()}`,
    ),
  )
  return rows[0] ? mapSummary(rows[0]) : null
}

/** Trailing-window scorecard for one analyst, across every name they cover. */
export async function fetchTipRanksAnalystSummary(expertUID: string): Promise<TipRanksSummary | null> {
  const rows = asArray(
    await fmpFetch(
      `${FMP_STABLE}/tipranks-analyst-summary?expertUID=${encodeURIComponent(expertUID)}&apikey=${apiKey()}`,
    ),
  )
  return rows[0] ? mapSummary(rows[0]) : null
}

/** One analyst's dated calls across all symbols, newest first. */
export async function fetchTipRanksAnalystRatings(expertUID: string, limit = 100): Promise<TipRanksRating[]> {
  const rows = asArray(
    await fmpFetch(
      `${FMP_STABLE}/tipranks-pit-analyst?expertUID=${encodeURIComponent(expertUID)}&limit=${limit}&apikey=${apiKey()}`,
    ),
  )
  return rows.map(mapRating)
}

/** Directory lookup — overall rank and star rating for an analyst. */
export async function fetchTipRanksAnalyst(analystName: string): Promise<TipRanksAnalyst | null> {
  const rows = asArray(
    await fmpFetch(
      `${FMP_STABLE}/tipranks-analysts?analystName=${encodeURIComponent(analystName)}&limit=5&apikey=${apiKey()}`,
    ),
  )
  return rows[0] ? mapAnalyst(rows[0]) : null
}

/* ── Derived helpers ───────────────────────────────────────────────────────── */

/**
 * Below this many resolved price targets, a beat rate or average return is
 * noise rather than a track record (BRK.B has 3 ratings in total). Surfaces
 * should show the count and suppress the rate below this threshold.
 */
export const MIN_RATINGS_FOR_ACCURACY = 10

/** Fraction of resolved price targets that were reached, or null when too thin. */
export function beatRate(s: Pick<TipRanksSummary, 'beats' | 'misses'>): number | null {
  const resolved = s.beats + s.misses
  if (resolved < MIN_RATINGS_FOR_ACCURACY) return null
  return s.beats / resolved
}

/**
 * The analyst's hit rate on this symbol, as of THIS rating's date — or null when
 * TipRanks has not computed one.
 *
 * Two things the raw field gets wrong if used directly:
 *   1. **It is point-in-time, not current.** The same analyst carries different
 *      values across their own calls (Wamsi Mohan on AAPL: .800 → .758 → .773
 *      over a year), so it reads "as of that call", not "today".
 *   2. **Zero is a missing-data sentinel, not a real zero.** Across AAPL / AMD /
 *      NVDA / MSFT, 65 rows report 0 — and 9 of those are calls that BEAT their
 *      own target, which no literal 0% can explain. 15 are the analyst's only
 *      call on the name, where no rate is computable. Rendering those as "0.00%"
 *      makes an analyst look wrong when the data is simply absent.
 */
export function stockHitRate(r: Pick<TipRanksRating, 'stockSuccessRate'>): number | null {
  const v = r.stockSuccessRate
  return v == null || v === 0 ? null : v
}

/** Net rating momentum over the window — upgrades minus downgrades. */
export function netUpgrades(s: Pick<TipRanksSummary, 'actions'>): number {
  return s.actions.upgraded - s.actions.downgraded
}

export interface StreetConsensus {
  analysts: number
  buy: number
  hold: number
  sell: number
  /** Strong Buy / Moderate Buy / Hold / Moderate Sell / Strong Sell. */
  label: string
}

/**
 * Consensus across analysts' CURRENT standing calls — pass the output of
 * `latestByAnalyst`, not the raw history, or every analyst is counted once per
 * call they have ever made.
 *
 * Note this is deliberately different from `TipRanksSummary.buy/hold/sell`,
 * which counts *recommendations* over the trailing window (AAPL: 275/129/33 =
 * 437 calls from 49 analysts). Head-count is the right basis for a consensus
 * badge; the summary counts are the right basis for activity and momentum.
 *
 * The label thresholds are our own approximation — TipRanks does not publish
 * its formula — chosen so a 75% buy share reads "Moderate Buy", matching how
 * their own page scores a 24/6/2 split.
 */
export function consensusFromRatings(latest: TipRanksRating[]): StreetConsensus {
  let buy = 0, hold = 0, sell = 0
  for (const r of latest) {
    const v = r.recommendation?.toLowerCase()
    if (v === 'buy') buy++
    else if (v === 'sell') sell++
    else if (v === 'hold') hold++
  }
  const total = buy + hold + sell
  let label = 'No consensus'
  if (total > 0) {
    const buyShare = buy / total
    const sellShare = sell / total
    if (buyShare >= 0.85) label = 'Strong Buy'
    else if (buyShare >= 0.55) label = 'Moderate Buy'
    else if (sellShare >= 0.85) label = 'Strong Sell'
    else if (sellShare >= 0.55) label = 'Moderate Sell'
    else label = 'Hold'
  }
  return { analysts: total, buy, hold, sell, label }
}

export interface StreetTargets {
  /** How many of the standing calls carry a price target. */
  count: number
  average: number | null
  high: number | null
  low: number | null
}

/**
 * Price-target range across the standing calls. Derived from the same rows the
 * analyst table shows, so the headline and the detail can never disagree —
 * which they would if this came from FMP's separate consensus endpoint.
 */
export function targetsFromRatings(latest: TipRanksRating[]): StreetTargets {
  const t = latest.map((r) => r.priceTarget).filter((v): v is number => v != null && v > 0)
  if (t.length === 0) return { count: 0, average: null, high: null, low: null }
  return {
    count: t.length,
    average: t.reduce((a, b) => a + b, 0) / t.length,
    high: Math.max(...t),
    low: Math.min(...t),
  }
}

/**
 * Reduce a rating history to the current standing call per analyst, newest
 * first, so a panel shows each analyst once.
 */
export function latestByAnalyst(ratings: TipRanksRating[]): TipRanksRating[] {
  const seen = new Map<string, TipRanksRating>()
  for (const r of ratings) {
    const key = r.expertUID ?? r.analystName ?? ''
    if (!key) continue
    const prev = seen.get(key)
    if (!prev || (r.date ?? '') > (prev.date ?? '')) seen.set(key, r)
  }
  return [...seen.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
