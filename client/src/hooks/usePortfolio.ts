import { useQuery } from '@tanstack/react-query'
import { fetchPortfolioByName } from '@/lib/portfolio'
import { fetchPositionsByPortfolioId } from '@/lib/positions'
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
