export interface PortfolioPosition {
  securityId: string
  numericId: number | null
  portfolioId: string
  ticker: string
  name: string | null
  weight: number
  updatedAt: string | null
  targetWeight: number | null
  driftThreshold: number | null
  assetClass: string | null
  categoryName: string | null
  lowerLimit: number | null
  upperLimit: number | null
  expenseRatio: number | null
}
