/**
 * ipsCompatibility.ts
 *
 * Checks a CLIENT IPS (investment_policy_statements) against the MODEL portfolio(s)
 * the client's accounts are mapped to. This is the link between the two governance
 * stacks: the model IPS (model_portfolio_data) says how a strategy is run and is what
 * the Investment Committee reviews; the client IPS says how THIS client's money may be
 * managed. When a client account is assigned to a model, the model's target allocation
 * must sit inside the client's IPS asset-class bands — otherwise running the model would
 * breach the client's policy.
 *
 * The IC never reads the client IPS; this compatibility surface lives on the client
 * (advisor) side only.
 */
import type { IPS } from './ips'
import { fetchClientPortfolios } from './clients'
import { fetchPortfolioByName } from './portfolio'
import {
  fetchDirectModelPortfolioId,
  fetchModelPortfolioById,
  fetchModelPortfolioByObjective,
  type ModelPortfolio,
} from './modelPortfolios'

export type IpsAssetClass = 'Equity' | 'Fixed Income' | 'Cash'

export interface IpsCompatIssue {
  assetClass: IpsAssetClass
  /** The model's target weight for this asset class (%). */
  modelTarget: number
  ipsMin: number | null
  ipsMax: number | null
  /** Which IPS bound the model target violates. */
  kind: 'above_max' | 'below_min'
}

export interface PortfolioCompat {
  portfolioName: string
  modelName: string | null
  /** False when the portfolio can't be resolved to a model (nothing to check against). */
  hasModel: boolean
  issues: IpsCompatIssue[]
}

/**
 * Pure check: does the model's category target allocation fall within the client IPS
 * asset-class bands? A null IPS bound means "unconstrained" on that side and never flags.
 */
export function checkModelAgainstIps(ips: IPS, model: ModelPortfolio): IpsCompatIssue[] {
  const rows: { assetClass: IpsAssetClass; target: number | null; min: number | null; max: number | null }[] = [
    { assetClass: 'Equity',       target: model.equity_target,       min: ips.equity_min_pct,       max: ips.equity_max_pct },
    { assetClass: 'Fixed Income', target: model.fixed_income_target, min: ips.fixed_income_min_pct, max: ips.fixed_income_max_pct },
    { assetClass: 'Cash',         target: model.cash_target,         min: ips.cash_min_pct,         max: ips.cash_max_pct },
  ]
  const issues: IpsCompatIssue[] = []
  for (const r of rows) {
    if (r.target == null) continue
    if (r.max != null && r.target > r.max) {
      issues.push({ assetClass: r.assetClass, modelTarget: r.target, ipsMin: r.min, ipsMax: r.max, kind: 'above_max' })
    } else if (r.min != null && r.target < r.min) {
      issues.push({ assetClass: r.assetClass, modelTarget: r.target, ipsMin: r.min, ipsMax: r.max, kind: 'below_min' })
    }
  }
  return issues
}

/**
 * Resolve a portfolio's model — mirrors the hook `useResolvedModelPortfolio` but as a
 * plain async fn so it can run in a loop over a client's portfolios.
 * portfolio_model_map (by security_id) → model_portfolio_data, falling back to objective.
 */
async function resolveModelForPortfolio(
  portfolio: { security_id: string | null; investment_objective: string | null },
): Promise<ModelPortfolio | null> {
  const securityId = portfolio.security_id ?? ''
  if (securityId) {
    const mappedId = await fetchDirectModelPortfolioId(securityId)
    if (mappedId != null) {
      const mapped = await fetchModelPortfolioById(mappedId)
      if (mapped) return mapped
    }
  }
  const objective = portfolio.investment_objective ?? ''
  if (objective) return fetchModelPortfolioByObjective(objective)
  return null
}

/**
 * For every portfolio linked to the client, resolve its model and check the model's
 * target allocation against the client's IPS bands.
 */
export async function fetchIpsModelCompatibility(clientId: number, ips: IPS): Promise<PortfolioCompat[]> {
  const links = await fetchClientPortfolios(clientId)
  const results: PortfolioCompat[] = []
  for (const link of links) {
    const portfolio = await fetchPortfolioByName(link.portfolio_name)
    const model = portfolio ? await resolveModelForPortfolio(portfolio) : null
    results.push({
      portfolioName: link.portfolio_name,
      modelName: model?.name ?? null,
      hasModel: model != null,
      issues: model ? checkModelAgainstIps(ips, model) : [],
    })
  }
  return results
}
