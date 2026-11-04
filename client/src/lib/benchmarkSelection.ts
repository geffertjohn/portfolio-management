/**
 * benchmarkSelection.ts
 *
 * The `benchmark-changed` window event, in one place.
 *
 * Two components show a stock's preferred comparators — `StockScorecardPanels`
 * (the six Monitor cards) and `StockReturnTable` (Total Performance, now only
 * on the Research page) — and when both are mounted a change in one has to
 * reach the other without a round trip through the database. The event was
 * declared inline in each of them, which is how the listener came to be
 * permanently dead: the dispatch sat behind a guard the only renderer could
 * never satisfy, and nothing connected the two halves well enough to notice.
 *
 * React-free, so it stays testable and so neither component owns the contract.
 */

export const BENCHMARK_CHANGED_EVENT = 'benchmark-changed'

export interface BenchmarkSelection {
  /** `securities2.id` — 0 for the Research page's synthetic security. */
  securityId: number
  bench1Id: number | null
  bench2Id: number | null
}

/**
 * Tell every other mounted view about a new selection.
 *
 * Announced for ANY security, including the Research page's synthetic `id: 0`:
 * that page saves nothing by design, but the panels on it must still agree with
 * each other. Persisting and announcing are separate decisions — conflating
 * them is what left the listener dead.
 */
export function announceBenchmarkChange(selection: BenchmarkSelection): void {
  window.dispatchEvent(new CustomEvent(BENCHMARK_CHANGED_EVENT, { detail: selection }))
}

/** True when the event describes a different selection for this security. */
export function isRelevantChange(
  selection: BenchmarkSelection,
  securityId: number,
  current: { bench1Id: number | null; bench2Id: number | null },
): boolean {
  return selection.securityId === securityId &&
    (selection.bench1Id !== current.bench1Id || selection.bench2Id !== current.bench2Id)
}

/** Subscribe to selection changes. Returns the unsubscribe function. */
export function onBenchmarkChange(handler: (selection: BenchmarkSelection) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<BenchmarkSelection>).detail)
  window.addEventListener(BENCHMARK_CHANGED_EVENT, listener)
  return () => window.removeEventListener(BENCHMARK_CHANGED_EVENT, listener)
}
