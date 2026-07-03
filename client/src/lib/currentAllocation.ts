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
import { parseActualAllocations } from './positionSizingCompare'

export interface CurrentAllocation {
  /** Uploaded-file timestamp (ISO) — the "as of" for the actual weights. */
  asOf: string
  fileName: string
  /** ticker (UPPER) → actual weight in percent points. */
  weights: Map<string, number>
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
