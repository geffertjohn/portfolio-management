/**
 * tickerList.ts — turning something a person typed or pasted into tickers.
 *
 * The Add-to-watchlist modal takes several at once, and the realistic input is
 * not a tidy array: it is a column copied out of a spreadsheet, a line out of a
 * research note, or a few symbols typed with commas. So the separator set is
 * deliberately broad — commas, semicolons, and any whitespace including the
 * newlines a pasted column brings.
 *
 * **Pure, and separated from the modal on purpose.** This is the part with
 * rules in it (what counts as a ticker, what order they come back in, what
 * happens to a duplicate), and it is the part worth testing. The modal just
 * renders what this returns.
 */

/**
 * What a ticker may look like.
 *
 * Permissive by intent: this gate exists to catch a stray word or a pasted
 * price, not to decide what exists. **Dots and hyphens are both allowed and
 * both load-bearing** — this book holds `BRK.B`, and FMP serves the same name
 * as `BRK-B`, so a rule rejecting either would refuse a security the firm
 * actually owns. Whether a symbol is real is FMP's and YCharts' question, and
 * watching a ticker that turns out not to exist costs one row.
 */
const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,9}$/

export interface ParsedTickers {
  /** Valid, uppercased, de-duplicated, in the order first seen. */
  tickers: string[]
  /**
   * Fragments that are not plausible tickers, in the order seen and
   * de-duplicated. **Reported rather than dropped**: a paste that silently
   * loses two of its eight rows is worse than one that says so, because the
   * loss is invisible until somebody notices the idea was never recorded.
   */
  rejected: string[]
}

/**
 * Split free text into tickers.
 *
 * **Order is first-seen, never sorted.** The advisor pasted a list in an order
 * that may mean something to them, and the chips they get back should be the
 * list they gave.
 */
export function parseTickerList(input: string): ParsedTickers {
  const tickers: string[] = []
  const rejected: string[] = []
  const seen = new Set<string>()
  const seenBad = new Set<string>()

  for (const raw of input.split(/[,;\s]+/)) {
    const frag = raw.trim()
    if (!frag) continue
    const sym = frag.toUpperCase()
    if (!TICKER.test(sym)) {
      // De-duplicated too, so a column of twenty prices does not produce
      // twenty complaints.
      if (!seenBad.has(sym)) { seenBad.add(sym); rejected.push(frag) }
      continue
    }
    if (seen.has(sym)) continue
    seen.add(sym)
    tickers.push(sym)
  }

  return { tickers, rejected }
}

/**
 * True when the text carries a separator, i.e. the user is giving a LIST.
 *
 * The modal uses this to decide whether typing should still filter the search
 * dropdown: once a comma or a newline appears, the field has stopped being a
 * search box and a dropdown of partial matches is noise.
 */
export function looksLikeList(input: string): boolean {
  return /[,;\s]/.test(input.trim())
}
