import { useQuery } from '@tanstack/react-query'
import { fetchPortfolioByName } from '@/lib/portfolio'
import { fetchPositionsByPortfolioId } from '@/lib/positions'
import { fetchLatestActualAllocation } from '@/lib/currentAllocation'
import {
  fetchModelPortfolioByObjective,
  fetchDirectModelPortfolioId,
  fetchModelPortfolioById,
  type ModelPortfolio,
} from '@/lib/modelPortfolios'
import { QUERY_KEYS } from './queryKeys'

export function usePortfolio(name: string) {
  return useQuery({
    queryKey: QUERY_KEYS.portfolio(name),
    queryFn: () => fetchPortfolioByName(name),
    enabled: !!name,
  })
}

export function usePositions(portfolioName: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.positions(portfolioName),
    queryFn: () => fetchPositionsByPortfolioId(portfolioName),
    enabled: !!portfolioName && enabled,
    staleTime: 1000 * 30,
  })
}

/**
 * The portfolio's most recent *actual* allocation, parsed from the latest monthly
 * file in its Documents folder. Returns `null` when none has been uploaded. Retries
 * are disabled so a missing/unreachable file store degrades quietly.
 */
export function useLatestActualAllocation(portfolioName: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.latestActualAllocation(portfolioName),
    queryFn: () => fetchLatestActualAllocation(portfolioName),
    enabled: !!portfolioName && enabled,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })
}

/**
 * Resolve a portfolio's model portfolio through the standard chain:
 * portfolio_model_map (by security_id) → model_portfolio_data, falling back to
 * investment_objective when the portfolio isn't mapped. Mirrors the inline
 * resolution in PortfolioDetailPage so other surfaces (e.g. the review workspace)
 * derive the same drift/cash limits.
 */
export function useResolvedModelPortfolio(
  portfolio: { security_id: string | null; investment_objective: string | null } | null | undefined,
): ModelPortfolio | null {
  const securityId = portfolio?.security_id ?? ''
  const objective = portfolio?.investment_objective ?? ''

  const { data: mappedId } = useQuery({
    queryKey: QUERY_KEYS.directModelPortfolioId(securityId),
    queryFn: () => fetchDirectModelPortfolioId(securityId),
    enabled: !!securityId,
  })
  const { data: mapped } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolioById(mappedId ?? 0),
    queryFn: () => fetchModelPortfolioById(mappedId ?? 0),
    enabled: mappedId != null,
  })
  const { data: byObjective } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolioByObjective(objective),
    queryFn: () => fetchModelPortfolioByObjective(objective),
    enabled: mappedId == null && !!objective,
  })
  return mapped ?? byObjective ?? null
}
