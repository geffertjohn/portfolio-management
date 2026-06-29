import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  fetchComplianceRules, createComplianceRule, deleteComplianceRule,
  runComplianceChecks, runPositionChecks, overallComplianceResult,
  RULE_TYPE_LABELS, WARN_BUFFER, PORTFOLIO_RULE_TYPES, POSITION_RULE_TYPES,
  type RuleType, type ComplianceResult,
} from '@/lib/compliance'
import { fetchFirmComplianceRules } from '@/lib/firmCompliance'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { StatusBadge } from '@/components/StatusBadge'
import type { PortfolioPosition } from '@/types/position'
import type { Portfolio } from '@/types/portfolio'
import type { ModelPortfolio } from '@/lib/modelPortfolios'

interface CompliancePanelProps {
  portfolioId: string
  positions: PortfolioPosition[]
  portfolio: Portfolio
  modelPortfolio?: ModelPortfolio | null
}

const RESULT_BADGE: Record<ComplianceResult, 'pass' | 'warn' | 'breach'> = {
  pass: 'pass', warn: 'warn', breach: 'breach',
}

const RULE_TYPE_OPTIONS: { value: RuleType; label: string }[] = [
  { value: 'max_single_position',  label: 'Max Single Position (%)' },
  { value: 'max_equity_pct',       label: 'Max Equity (%)' },
  { value: 'min_equity_pct',       label: 'Min Equity (%)' },
  { value: 'max_fixed_income_pct', label: 'Max Fixed Income (%)' },
  { value: 'min_fixed_income_pct', label: 'Min Fixed Income (%)' },
  { value: 'max_cash_pct',         label: 'Max Cash (%)' },
  { value: 'min_cash_pct',         label: 'Min Cash (%)' },
  { value: 'min_position_weight',  label: 'Min Position Weight (%)' },
  { value: 'max_position_count',   label: 'Max Position Count' },
  { value: 'min_position_count',   label: 'Min Position Count' },
]

export function CompliancePanel({ portfolioId, positions, portfolio, modelPortfolio: modelPortfolioProp }: CompliancePanelProps) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [ruleType, setRuleType] = useState<RuleType>('max_single_position')
  const [label, setLabel] = useState('')
  const [threshold, setThreshold] = useState('')
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [broadAllocExpanded, setBroadAllocExpanded] = useState(true)
  const [assetClassExpanded, setAssetClassExpanded] = useState(true)
  const [fiduciaryExpanded, setFiduciaryExpanded] = useState(true)
  const [positionRulesExpanded, setPositionRulesExpanded] = useState(true)

  const [lastRebalance, setLastRebalance] = useState(portfolio.last_rebalance_date ?? '')
  const [nextRebalance, setNextRebalance] = useState(portfolio.next_rebalance_date ?? '')
  const [rebalanceEditing, setRebalanceEditing] = useState(false)

  useEffect(() => {
    if (!rebalanceEditing) {
      setLastRebalance(portfolio.last_rebalance_date ?? '')
      setNextRebalance(portfolio.next_rebalance_date ?? '')
    }
  }, [portfolio.last_rebalance_date, portfolio.next_rebalance_date, rebalanceEditing])

  const rebalanceMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('portfolio')
        .update({
          last_rebalance_date: lastRebalance || null,
          next_rebalance_date: nextRebalance || null,
        })
        .eq('name', portfolioId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolio(portfolioId) })
      setRebalanceEditing(false)
    },
  })

  const { data: rules = [] } = useQuery({
    queryKey: QUERY_KEYS.complianceRules(portfolioId),
    queryFn: () => fetchComplianceRules(portfolioId),
  })

  const portfolioRules = rules.filter((r) => PORTFOLIO_RULE_TYPES.has(r.rule_type))
  const positionRulesList = rules.filter((r) => POSITION_RULE_TYPES.has(r.rule_type))

  const checks = runComplianceChecks(portfolioRules, positions)
  const overall = overallComplianceResult(checks)
  const positionChecks = runPositionChecks(positionRulesList, positions)
  const positionOverall: ComplianceResult = positionChecks.some((c) => c.result === 'breach')
    ? 'breach'
    : positionChecks.some((c) => c.result === 'warn')
    ? 'warn'
    : 'pass'

  const { data: firmRules = [] } = useQuery({
    queryKey: QUERY_KEYS.firmComplianceRules,
    queryFn: fetchFirmComplianceRules,
  })

  const modelPortfolio = modelPortfolioProp

  const mandateChecks = (() => {
    if (!modelPortfolio) return []
    const mp = modelPortfolio
    const items = [
      {
        label: 'Equity Allocation',
        actual: portfolio.stock_net,
        lower: mp.equity_lower_limit,
        target: mp.equity_target,
        upper: mp.equity_upper_limit,
      },
      {
        label: 'Fixed Income Allocation',
        actual: portfolio.bond_net,
        lower: mp.fixed_income_lower_limit,
        target: mp.fixed_income_target,
        upper: mp.fixed_income_upper_limit,
      },
      {
        label: 'Cash Allocation',
        actual: portfolio.cash_net,
        lower: mp.cash_lower_limit,
        target: mp.cash_target,
        upper: mp.cash_upper_limit,
      },
    ]
    return items.map((item) => {
      const actualPct = item.actual != null ? item.actual * 100 : null
      let result: ComplianceResult = 'pass'
      if (actualPct == null) {
        result = 'warn'
      } else if (
        (item.lower != null && actualPct < item.lower) ||
        (item.upper != null && actualPct > item.upper)
      ) {
        result = 'breach'
      }
      return { ...item, actualPct, result }
    })
  })()

  const mandateOverall: ComplianceResult = mandateChecks.some((c) => c.result === 'breach')
    ? 'breach'
    : mandateChecks.some((c) => c.result === 'warn')
    ? 'warn'
    : 'pass'

  const ASSET_CLASS_MANDATE_ROWS: {
    label: string
    matchFn: (cat: string | null) => boolean
    keys: string[]
  }[] = [
    {
      label: 'US Large Cap',
      // Large Blend, Large Cap Core, Large Cap Growth, Large Cap Value, Large Growth, Large Value
      matchFn: (cat) => /^large/i.test(cat ?? ''),
      keys: ['large_cap_blend', 'large_cap_value', 'large_cap_growth'],
    },
    {
      label: 'US Mid Cap',
      // Mid Cap Core, Mid Cap Growth, Mid-Cap Blend, Mid-Cap Growth
      matchFn: (cat) => /^mid.?cap/i.test(cat ?? ''),
      keys: ['us_mid_cap'],
    },
    {
      label: 'US Small Cap',
      // Small Blend, Small Cap Core, Small Cap Growth, Small Growth
      matchFn: (cat) => /^small/i.test(cat ?? ''),
      keys: ['us_small_cap'],
    },
    {
      label: 'Non-US Developed',
      // Foreign Large Blend
      matchFn: (cat) => /^foreign/i.test(cat ?? ''),
      keys: ['non_us_developed'],
    },
    {
      label: 'Emerging Market',
      // Diversified Emerging Mkts
      matchFn: (cat) => /emerging/i.test(cat ?? ''),
      keys: ['emerging_market'],
    },
    {
      label: 'Investment Grade Fixed Income',
      // Intermediate Core Bond, Intermediate Core-Plus Bond
      matchFn: (cat) => /intermediate.?core|core.?bond|core-plus/i.test(cat ?? ''),
      keys: ['ig_intermediate_fixed_income', 'ig_short_fixed_income'],
    },
    {
      label: 'Non-Investment Grade Fixed Income',
      // High Yield Bond
      matchFn: (cat) => /high.?yield/i.test(cat ?? ''),
      keys: ['non_ig_fixed_income'],
    },
    {
      label: 'Non-US Fixed Income',
      // Global Bond-USD Hedged, World Bond
      matchFn: (cat) => /global.?bond|world.?bond/i.test(cat ?? ''),
      keys: ['non_us_fixed_income'],
    },
    {
      label: 'Multi-Sector Fixed Income',
      matchFn: (cat) => /multi.?sector/i.test(cat ?? ''),
      keys: ['multi_sector_fixed_income'],
    },
    {
      label: 'Alternatives',
      matchFn: (cat) => /alternative|real.?asset|commodity|reit/i.test(cat ?? ''),
      keys: ['alternatives'],
    },
    {
      label: 'Cash & Cash Alternatives',
      matchFn: (cat) => /^cash|money.?market/i.test(cat ?? ''),
      keys: ['cash'],
    },
  ]

  const assetClassChecks = (() => {
    if (!modelPortfolio) return []
    const mp = modelPortfolio as unknown as Record<string, unknown>
    const sumKeys = (keys: string[], suffix: string) =>
      keys.reduce((s, k) => s + ((mp[`${k}_${suffix}`] as number | null) ?? 0), 0)

    return ASSET_CLASS_MANDATE_ROWS
      .map(({ label, matchFn, keys }) => {
        const target = sumKeys(keys, 'target')
        if (target <= 0) return null
        const lowerSum = sumKeys(keys, 'lower_limit')
        const upperSum = sumKeys(keys, 'upper_limit')
        const lower = lowerSum > 0 ? lowerSum : null
        const upper = upperSum > 0 ? upperSum : null
        const actual = positions
          .filter((p) => matchFn(p.categoryName))
          .reduce((s, p) => s + p.weight, 0)
        const result: ComplianceResult =
          (lower != null && actual < lower) || (upper != null && actual > upper) ? 'breach' :
          (lower != null && actual < lower * (1 + WARN_BUFFER)) || (upper != null && actual > upper * (1 - WARN_BUFFER)) ? 'warn' :
          'pass'
        return { label, lower: lowerSum, target, upper: upperSum, actual, result }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  })()

  const assetClassOverall: ComplianceResult = assetClassChecks.some((c) => c.result === 'breach')
    ? 'breach'
    : assetClassChecks.some((c) => c.result === 'warn')
    ? 'warn'
    : 'pass'

  const fiduciaryChecks = (() => {
    const maxConcentrationRule = firmRules.find((r) => r.rule_type === 'max_single_position')
    const minHoldingsRule = firmRules.find((r) => r.rule_type === 'min_holdings_count')
    const activePositions = positions.filter((p) => p.securityId !== 'CASH')
    const checks: Array<{ label: string; threshold: number; actual: number; unit: string; result: ComplianceResult }> = []

    if (maxConcentrationRule?.is_active) {
      const maxWeight = activePositions.length > 0 ? Math.max(...activePositions.map((p) => p.weight)) : 0
      const thr = maxConcentrationRule.threshold_value
      const result: ComplianceResult =
        maxWeight > thr ? 'breach' :
        maxWeight > thr * (1 - WARN_BUFFER) ? 'warn' : 'pass'
      checks.push({ label: maxConcentrationRule.label, threshold: thr, actual: maxWeight, unit: '%', result })
    }

    if (minHoldingsRule?.is_active) {
      const count = activePositions.length
      const thr = minHoldingsRule.threshold_value
      const result: ComplianceResult =
        count < thr ? 'breach' :
        count < thr * (1 + WARN_BUFFER) ? 'warn' : 'pass'
      checks.push({ label: minHoldingsRule.label, threshold: thr, actual: count, unit: ' holdings', result })
    }

    return checks
  })()

  const fiduciaryOverall: ComplianceResult = fiduciaryChecks.some((c) => c.result === 'breach')
    ? 'breach'
    : fiduciaryChecks.some((c) => c.result === 'warn')
    ? 'warn'
    : 'pass'

  const isCountRuleType = ruleType === 'max_position_count' || ruleType === 'min_position_count'

  const createMutation = useMutation({
    mutationFn: () => {
      const val = parseFloat(threshold)
      if (isCountRuleType) {
        if (Number.isNaN(val) || val <= 0 || !Number.isInteger(val))
          throw new Error('Count must be a positive whole number.')
      } else {
        if (Number.isNaN(val) || val <= 0 || val > 100)
          throw new Error('Threshold must be between 0.01 and 100.')
      }
      return createComplianceRule({
        portfolio_name: portfolioId,
        rule_type: ruleType,
        label: label || RULE_TYPE_LABELS[ruleType],
        threshold_value: val,
        is_active: true,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.complianceRules(portfolioId) })
      setShowForm(false); setLabel(''); setThreshold(''); setThresholdError(null)
    },
    onError: (err) => setThresholdError(err instanceof Error ? err.message : 'Failed to add rule'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteComplianceRule(id),
    onSuccess: () => {
      setDeleteError(null)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.complianceRules(portfolioId) })
    },
    onError: (err) => setDeleteError(err instanceof Error ? err.message : 'Failed to remove rule'),
  })

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div className="space-y-4">

      {/* Rebalance Frequency */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">Rebalance Schedule</p>
          {!rebalanceEditing ? (
            <button
              type="button"
              onClick={() => setRebalanceEditing(true)}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => rebalanceMutation.mutate()}
                disabled={rebalanceMutation.isPending}
                className="rounded bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {rebalanceMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLastRebalance(portfolio.last_rebalance_date ?? '')
                  setNextRebalance(portfolio.next_rebalance_date ?? '')
                  setRebalanceEditing(false)
                }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100 px-0">
          <div className="px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Frequency</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {modelPortfolio?.rebalance_frequency ?? '—'}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Last Rebalance</p>
            {rebalanceEditing ? (
              <input
                type="date"
                value={lastRebalance}
                onChange={(e) => setLastRebalance(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
              />
            ) : (
              <p className="mt-1 text-sm font-semibold text-gray-900">{fmtDate(portfolio.last_rebalance_date)}</p>
            )}
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Next Rebalance</p>
            {rebalanceEditing ? (
              <input
                type="date"
                value={nextRebalance}
                onChange={(e) => setNextRebalance(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
              />
            ) : (
              <p className="mt-1 text-sm font-semibold text-gray-900">{fmtDate(portfolio.next_rebalance_date)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Broad Asset Allocation */}
      {portfolio.investment_objective && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setBroadAllocExpanded((v) => !v)}
            className={`flex w-full items-center justify-between border-b px-4 py-3 text-left ${
              mandateOverall === 'pass' ? 'border-green-100 bg-green-50' :
              mandateOverall === 'breach' ? 'border-red-100 bg-red-50' :
              'border-amber-100 bg-amber-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${broadAllocExpanded ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-gray-900">Broad Asset Allocation</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tolerance bands from model portfolio: {portfolio.investment_objective}
                </p>
              </div>
            </div>
            {mandateChecks.length > 0 && <StatusBadge variant={RESULT_BADGE[mandateOverall]} />}
          </button>

          {broadAllocExpanded && (
            !modelPortfolio ? (
              <p className="px-4 py-4 text-sm text-gray-400">Loading model portfolio…</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Category</th>
                    <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Lower</th>
                    <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Target</th>
                    <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Upper</th>
                    <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Actual</th>
                    <th className="w-20 px-4 py-2.5 text-left font-semibold text-gray-900">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {mandateChecks.map((c) => (
                    <tr key={c.label} className={c.result === 'breach' ? 'bg-red-50' : ''}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{c.label}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {c.lower != null ? `${c.lower.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                        {c.target != null ? `${c.target.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {c.upper != null ? `${c.upper.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                        {c.actualPct != null ? `${c.actualPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge variant={RESULT_BADGE[c.result]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      )}

      {/* Fiduciary Checks */}
      {fiduciaryChecks.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setFiduciaryExpanded((v) => !v)}
            className={`flex w-full items-center justify-between border-b px-4 py-3 text-left ${
              fiduciaryOverall === 'pass' ? 'border-green-100 bg-green-50' :
              fiduciaryOverall === 'warn' ? 'border-amber-100 bg-amber-50' :
              'border-red-100 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${fiduciaryExpanded ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-gray-900">Fiduciary Checks</p>
                <p className="text-xs text-gray-500 mt-0.5">Firm-wide rules · {fiduciaryChecks.length} check{fiduciaryChecks.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <StatusBadge variant={RESULT_BADGE[fiduciaryOverall]} />
          </button>
          {fiduciaryExpanded && (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Rule</th>
                  <th className="w-28 px-4 py-2.5 text-right font-semibold text-gray-900">Threshold</th>
                  <th className="w-28 px-4 py-2.5 text-right font-semibold text-gray-900">Actual</th>
                  <th className="w-20 px-4 py-2.5 text-left font-semibold text-gray-900">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {fiduciaryChecks.map((c) => (
                  <tr key={c.label} className={c.result === 'breach' ? 'bg-red-50' : ''}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{c.label}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {c.unit === '%' ? `${c.threshold.toFixed(1)}%` : `${c.threshold}${c.unit}`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {c.unit === '%' ? `${c.actual.toFixed(1)}%` : `${c.actual}${c.unit}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge variant={RESULT_BADGE[c.result]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Position Rules */}
      {positionChecks.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setPositionRulesExpanded((v) => !v)}
            className={`flex w-full items-center justify-between border-b px-4 py-3 text-left ${
              positionOverall === 'pass' ? 'border-green-100 bg-green-50' :
              positionOverall === 'warn' ? 'border-amber-100 bg-amber-50' :
              'border-red-100 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${positionRulesExpanded ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-gray-900">Position Rules</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Individual position checks · {positionChecks.length} rule{positionChecks.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <StatusBadge variant={RESULT_BADGE[positionOverall]} />
          </button>

          {positionRulesExpanded && (
            <div className="divide-y divide-gray-100">
              {positionChecks.map((c) => {
                const isCountRule = c.rule.rule_type === 'max_position_count' || c.rule.rule_type === 'min_position_count'
                return (
                  <div key={c.rule.id}>
                    <div className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 text-sm ${c.result === 'breach' ? 'bg-red-50' : c.result === 'warn' ? 'bg-amber-50' : ''}`}>
                      <span className="font-medium text-gray-900">{c.rule.label}</span>
                      <span className="tabular-nums text-gray-500 text-xs">
                        threshold: {isCountRule ? c.rule.threshold_value : `${c.rule.threshold_value}%`}
                      </span>
                      <span className="tabular-nums text-gray-700">
                        {c.actual_value != null
                          ? isCountRule ? c.actual_value : `${c.actual_value.toFixed(1)}%`
                          : '—'}
                      </span>
                      <StatusBadge variant={RESULT_BADGE[c.result]} />
                    </div>
                    {c.offendingPositions.length > 0 && (
                      <table className="w-full text-xs border-t border-gray-100">
                        <tbody className="divide-y divide-gray-50">
                          {c.offendingPositions.map((p) => (
                            <tr key={p.ticker} className={p.result === 'breach' ? 'bg-red-50' : 'bg-amber-50'}>
                              <td className="pl-10 pr-4 py-1.5 text-gray-500">↳</td>
                              <td className="pr-4 py-1.5 font-medium text-gray-800">{p.ticker}</td>
                              <td className="pr-4 py-1.5 tabular-nums text-gray-600">{p.weight.toFixed(2)}%</td>
                              <td className="pr-4 py-1.5">
                                <StatusBadge variant={p.result} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Asset Class Allocation */}
      {portfolio.investment_objective && assetClassChecks.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setAssetClassExpanded((v) => !v)}
            className={`flex w-full items-center justify-between border-b px-4 py-3 text-left ${
              assetClassOverall === 'pass' ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${assetClassExpanded ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-gray-900">Asset Class Allocation</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Position weights vs. model portfolio bands · {assetClassChecks.length} asset classes
                </p>
              </div>
            </div>
            <StatusBadge variant={RESULT_BADGE[assetClassOverall]} />
          </button>
          {assetClassExpanded && (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Asset Class</th>
                  <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Lower</th>
                  <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Target</th>
                  <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Upper</th>
                  <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Actual</th>
                  <th className="w-20 px-4 py-2.5 text-left font-semibold text-gray-900">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {assetClassChecks.map((c) => (
                  <tr key={c.label} className={c.result === 'breach' ? 'bg-red-50' : ''}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{c.label}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{c.lower.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{c.target.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{c.upper.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{c.actual.toFixed(1)}%</td>
                    <td className="px-4 py-2.5"><StatusBadge variant={RESULT_BADGE[c.result]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Overall status */}
      {checks.length > 0 && (
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
          overall === 'pass' ? 'border-green-200 bg-green-50' :
          overall === 'breach' ? 'border-red-200 bg-red-50' :
          'border-amber-200 bg-amber-50'
        }`}>
          <StatusBadge variant={RESULT_BADGE[overall]} />
          <p className={`text-sm font-medium ${
            overall === 'pass' ? 'text-green-800' :
            overall === 'breach' ? 'text-red-800' : 'text-amber-800'
          }`}>
            {overall === 'pass' ? 'All compliance rules passed.' :
             overall === 'breach' ? `${checks.filter(c => c.result === 'breach').length} rule(s) breached.` :
             'Some rules require attention.'}
          </p>
        </div>
      )}

      {/* Check results */}
      {checks.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Rule Checks</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Rule</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Threshold</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-900">Actual</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-900">Result</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {checks.map((c) => (
                <tr key={c.rule.id} className={c.result === 'breach' ? 'bg-red-50' : ''}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.rule.label}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{c.rule.threshold_value}%</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {c.actual_value != null ? `${c.actual_value.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge variant={RESULT_BADGE[c.result]} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => deleteMutation.mutate(c.rule.id)}
                      className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteError && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5">
          <p className="text-sm text-red-700">{deleteError}</p>
          <button onClick={() => setDeleteError(null)} className="ml-4 text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Add rule */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
        {showForm ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Add Rule</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">Rule Type</label>
                <select value={ruleType} onChange={(e) => setRuleType(e.target.value as RuleType)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                  {RULE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Threshold{isCountRuleType ? '' : ' (%)'}
                </label>
                <input
                  type="number" value={threshold}
                  onChange={(e) => { setThreshold(e.target.value); setThresholdError(null) }}
                  min={isCountRuleType ? '1' : '0.01'}
                  max={isCountRuleType ? undefined : '100'}
                  step={isCountRuleType ? '1' : '0.1'}
                  placeholder={isCountRuleType ? 'e.g. 30' : 'e.g. 25'}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                    thresholdError ? 'border-red-400 focus:border-red-500 focus:ring-red-400' : 'border-gray-300 focus:border-gray-500 focus:ring-gray-500'
                  }`} />
                {thresholdError && <p className="mt-1 text-xs text-red-600">{thresholdError}</p>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Label <span className="text-gray-400">(optional)</span></label>
              <input value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder={RULE_TYPE_LABELS[ruleType]}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!threshold || parseFloat(threshold) <= 0 || parseFloat(threshold) > 100 || createMutation.isPending}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {createMutation.isPending ? 'Adding…' : 'Add Rule'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Compliance Rule
          </button>
        )}
      </div>
    </div>
  )
}
