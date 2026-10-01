/**
 * currentAllocation.ts
 *
 * Reads a portfolio's *actual* current allocation from the most recent monthly
 * allocation file the advisor uploads to the portfolio's Documents folder
 * (Portfolio Documents bucket, folder = portfolio name). The file is the YCharts
 * current-allocation export (`Security Ticker/CUSIP,Target`, weights in percent
 * points) — the same format `parseActualAllocations` handles for the review
 * position-sizing check. Nothing is persisted; the file store is the source of truth.
 */
import { fetchAllFiles, getSignedUrl, PORTFOLIO_DOCS_BUCKET } from './documents'
import type { StoredFile } from './documents'
import { parseActualAllocations } from './positionSizingCompare'

export interface CurrentAllocation {
  /** Uploaded-file timestamp (ISO) — the "as of" for the actual weights. */
  asOf: string
  fileName: string
  /** ticker (UPPER) → actual weight in percent points. */
  weights: Map<string, number>
  /**
   * Set only for a blended portfolio: the source portfolios these weights were
   * derived from. Null means the weights came from this portfolio's own file.
   */
  derivedFrom: string[] | null
}

/**
 * Portfolios that hold no lineup of their own and therefore receive no
 * allocation file — their actual weights are a weighted blend of other
 * portfolios' files, the same way their positions and history are derived.
 *
 * Equity Income & Core Growth is a 50/50 of its two parents: every holding is
 * half its parent weight, and a name held in both sleeves takes the sum of its
 * two halves. Uploading a file for it would be wrong by construction, so
 * without this the Current column simply would not render.
 */
export const DERIVED_ACTUAL_BLENDS: Record<string, { source: string; weight: number }[]> = {
  'Equity Income & Core Growth': [
    { source: 'Core Growth', weight: 0.5 },
    { source: 'Equity Income', weight: 0.5 },
  ],
}

/**
 * Latest actual allocation for a portfolio, or `null` when no allocation file has
 * been uploaded to its Documents folder. Throws if the Express file store is
 * unreachable or the download fails (callers can surface a graceful banner via
 * `isServerUnreachable`).
 */
export async function fetchLatestActualAllocation(
  portfolioName: string,
): Promise<CurrentAllocation | null> {
  const { files } = await fetchAllFiles(PORTFOLIO_DOCS_BUCKET)

  const own = await latestFileFor(files, portfolioName)
  if (own) return { ...own, derivedFrom: null }

  const blend = DERIVED_ACTUAL_BLENDS[portfolioName]
  if (!blend) return null

  const legs = await Promise.all(blend.map((b) => latestFileFor(files, b.source)))
  // All or nothing: half a blend is not a 100% book, and a Current column that
  // silently covers only one sleeve is worse than no column at all.
  if (legs.some((l) => l == null)) return null

  const weights = new Map<string, number>()
  legs.forEach((leg, i) => {
    for (const [symbol, w] of leg!.weights) {
      weights.set(symbol, (weights.get(symbol) ?? 0) + w * blend[i].weight)
    }
  })

  return {
    // The OLDEST leg, not the newest: a blend is only as current as its stalest
    // source, the same rule the import stamps follow.
    asOf: legs.map((l) => l!.asOf).sort()[0],
    fileName: blend.map((b) => `${b.source} (${b.weight * 100}%)`).join(' + '),
    weights,
    derivedFrom: blend.map((b) => b.source),
  }
}

/**
 * Every portfolio that can produce an actual allocation, given the folders that
 * exist in the bucket: those with a file of their own, plus any derived blend
 * whose every source has one.
 *
 * Callers that iterate portfolios (the Actions adapters) must use this rather
 * than the folder list — a blended portfolio owns no folder, so a bare
 * `folders.has(name)` check silently falls back to position targets and reports
 * "vs position targets" while the portfolio page shows actual holdings.
 */
export function portfoliosWithActualAllocation(folders: Set<string>): Set<string> {
  const out = new Set(folders)
  for (const [name, legs] of Object.entries(DERIVED_ACTUAL_BLENDS)) {
    if (legs.every((l) => folders.has(l.source))) out.add(name)
  }
  return out
}

/** Newest uploaded allocation file for one portfolio folder, parsed. */
async function latestFileFor(
  files: StoredFile[],
  portfolioName: string,
): Promise<Omit<CurrentAllocation, 'derivedFrom'> | null> {
  const mine = files.filter((f) => f.folder === portfolioName)
  if (mine.length === 0) return null

  // Most recent upload wins.
  const latest = [...mine].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]

  const url = await getSignedUrl(latest.fullPath, PORTFOLIO_DOCS_BUCKET)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download allocation file (${res.status})`)
  const buf = await res.arrayBuffer()

  return { asOf: latest.createdAt, fileName: latest.name, weights: parseActualAllocations(buf) }
}
