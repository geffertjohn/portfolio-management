/** Compact USD for AUM (e.g. $2.65B). */
export function formatAumUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Locale-friendly date from an ISO date or datetime string.
 * Appends T12:00:00 to date-only strings to prevent UTC-offset day shifts.
 * Returns the original string if parsing fails.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** @deprecated Use formatDate instead. */
export const formatInceptionDate = formatDate
