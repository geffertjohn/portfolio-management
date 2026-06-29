/** How a security symbol is shown in portfolio holdings (not raw DB). */
export function formatPortfolioSecuritySymbol(symbol: string): string {
  const s = symbol.trim()
  if (s.toUpperCase() === '$CASH') return 'Cash'
  return symbol
}
