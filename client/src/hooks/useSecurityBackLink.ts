import { useLocation, useSearchParams } from 'react-router-dom'

type SecurityDetailLocationState = {
  fromPortfolioId?: number
  from?: string
}

/**
 * Resolves the correct back-link for a security detail page.
 * Priority:
 *   1. `state.fromPortfolioId` — came from a specific portfolio
 *   2. `state.from === 'securities'` — came from the securities list
 *   3. `?fromPortfolio=<id>` query param — legacy deep-link support
 *   4. Default → portfolios list
 */
export function useSecurityBackLink() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const state = location.state as SecurityDetailLocationState | null

  // 1. Portfolio state
  const rawState = state?.fromPortfolioId
  const fromState =
    typeof rawState === 'number' && Number.isInteger(rawState) && rawState > 0
      ? rawState
      : null

  if (fromState != null) {
    return { to: `/portfolio/${fromState}`, label: '← Back to portfolio' }
  }

  // 2. Securities list
  if (state?.from === 'securities') {
    return { to: '/securities', label: '← Back to Securities' }
  }

  // 3. Query param fallback
  const q = searchParams.get('fromPortfolio')
  const fromQuery = q != null && q !== '' ? parseInt(q, 10) : NaN
  if (Number.isInteger(fromQuery) && fromQuery > 0) {
    return { to: `/portfolio/${fromQuery}`, label: '← Back to portfolio' }
  }

  // 4. Default
  return { to: '/portfolio', label: '← Back to Portfolios' }
}
