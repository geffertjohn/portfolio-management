/**
 * fmpClient.ts
 *
 * Shared Financial Modeling Prep (FMP) plumbing used across every `fmp*.ts`
 * data-access module: base URLs, the API-key guard, the `fetch → ok? → json`
 * helper, small value coercion helpers, and `fmpSymbol` (the `.`→`-` mapping
 * FMP requires for share-class tickers, e.g. `BRK.B` → `BRK-B`).
 *
 * These were previously copy-pasted into each fmp module; consolidating them
 * here keeps behavior identical and makes the symbol mapping impossible to
 * forget at a call site.
 */

export const FMP_STABLE = 'https://financialmodelingprep.com/stable'
export const FMP_V3 = 'https://financialmodelingprep.com/api/v3'

/** Read the FMP API key from the Vite env, throwing if it is absent. */
export function apiKey(): string {
  const key = import.meta.env.VITE_FMP_API_KEY as string | undefined
  if (!key) throw new Error('Missing VITE_FMP_API_KEY')
  return key
}

/**
 * Map our `security_id` / ticker to FMP's share-class form: FMP uses a hyphen
 * where we (and YCharts) use a dot — `BRK.B` → `BRK-B`. Always wrap a symbol
 * with this before interpolating it into an FMP URL; the DB row keeps the
 * original dotted `security_id`.
 */
export function fmpSymbol(symbol: string): string {
  return symbol.replace(/\./g, '-')
}

/** Coerce an unknown value to a finite number, or null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Coerce an unknown value to a non-empty trimmed string, or null. */
export function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Narrow an unknown FMP payload to an array of plain objects. */
export function asArray(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw)
    ? raw.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
    : []
}

/**
 * The first object in an FMP payload, whether it came back as a single-element
 * array or a bare object. Returns null when neither shape is present.
 */
export function firstItem(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
    return raw[0] as Record<string, unknown>
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return null
}

/** GET a JSON URL from FMP, throwing on a non-2xx response. */
export async function fmpFetch(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FMP ${res.status}: ${url}`)
  return res.json() as Promise<unknown>
}
