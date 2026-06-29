import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface DetailPageStateProps {
  /** Back-link target and label (rendered above every state). */
  backTo: string
  backLabel: ReactNode
  /** State flags, checked in priority order: invalid → loading → error → notFound. */
  invalid?: boolean
  invalidText?: string
  loading?: boolean
  error?: unknown
  /** Title shown in the red error card, e.g. "Failed to load portfolio". */
  errorTitle?: string
  notFound?: boolean
  /** Full not-found sentence, e.g. "Portfolio not found." */
  notFoundText?: string
}

/**
 * Shared loading / error / not-found scaffold for detail pages (back-link +
 * message), extracted from the byte-identical blocks in PortfolioDetailPage and
 * SecurityDetailPage. The caller early-returns this when any state flag is set.
 */
export function DetailPageState({
  backTo,
  backLabel,
  invalid,
  invalidText = 'Invalid.',
  loading,
  error,
  errorTitle = 'Failed to load',
  notFound,
  notFoundText = 'Not found.',
}: DetailPageStateProps) {
  let inner: ReactNode
  if (invalid) {
    inner = <p className="mt-4 text-red-600">{invalidText}</p>
  } else if (loading) {
    inner = <p className="mt-4 text-gray-500">Loading…</p>
  } else if (error) {
    inner = (
      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">{errorTitle}</p>
        <p className="mt-1 text-sm text-red-700">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    )
  } else if (notFound) {
    inner = <p className="mt-4 text-gray-500">{notFoundText}</p>
  }

  return (
    <div>
      <Link to={backTo} className="text-sm text-gray-600 hover:text-gray-900">
        {backLabel}
      </Link>
      {inner}
    </div>
  )
}
