import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchAllComplianceRules,
  createComplianceRule,
  deleteComplianceRule,
  RULE_TYPE_LABELS,
  PORTFOLIO_RULE_TYPES,
  POSITION_RULE_TYPES,
  type RuleType,
  type ComplianceRule,
} from '@/lib/compliance'
import {
  fetchFirmComplianceRules,
  updateFirmComplianceRule,
  fetchAllPortfolioPositions,
  fetchClientPortfolioNames,
} from '@/lib/firmCompliance'
import { fetchPortfolios } from '@/lib/portfolio'
import { QUERY_KEYS } from '@/hooks/queryKeys'

const PORTFOLIO_RULE_TYPE_OPTIONS: { value: RuleType; label: string }[] = [
  { value: 'max_single_position',   label: 'Max Single Position (%)' },
  { value: 'max_equity_pct',        label: 'Max Equity (%)' },
  { value: 'min_equity_pct',        label: 'Min Equity (%)' },
  { value: 'max_fixed_income_pct',  label: 'Max Fixed Income (%)' },
  { value: 'min_fixed_income_pct',  label: 'Min Fixed Income (%)' },
  { value: 'max_cash_pct',          label: 'Max Cash (%)' },
  { value: 'min_cash_pct',          label: 'Min Cash (%)' },
]

const POSITION_RULE_TYPE_OPTIONS: { value: RuleType; label: string; unit: string; hint: string }[] = [
  {
    value: 'min_position_weight',
    label: 'Min Position Weight (%)',
    unit: '%',
    hint: 'Every non-cash position must be at least this weight. Flags orphan or rounding positions.',
  },
  {
    value: 'max_position_count',
    label: 'Max Position Count',
    unit: 'positions',
    hint: 'Portfolio may not hold more than this many non-cash positions.',
  },
  {
    value: 'min_position_count',
    label: 'Min Position Count',
    unit: 'positions',
    hint: 'Portfolio must hold at least this many non-cash positions.',
  },
]

const RESULT_COLORS: Record<string, string> = {
  pass:   'bg-green-100 text-green-700',
  warn:   'bg-amber-100 text-amber-700',
  breach: 'bg-red-100 text-red-700',
}

export function CompliancePage() {
  const queryClient = useQueryClient()

  // Portfolio rule form state
  const [showForm, setShowForm] = useState(false)
  const [formPortfolio, setFormPortfolio] = useState('')
  const [ruleType, setRuleType] = useState<RuleType>('max_single_position')
  const [label, setLabel] = useState('')
  const [threshold, setThreshold] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Position rule form state
  const [showPositionForm, setShowPositionForm] = useState(false)
  const [positionFormPortfolio, setPositionFormPortfolio] = useState('')
  const [positionRuleType, setPositionRuleType] = useState<RuleType>('min_position_weight')
  const [positionLabel, setPositionLabel] = useState('')
  const [positionThreshold, setPositionThreshold] = useState('')
  const [positionFormError, setPositionFormError] = useState<string | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [editingFirmRuleId, setEditingFirmRuleId] = useState<number | null>(null)
  const [editingThreshold, setEditingThreshold] = useState('')
  const [consistencyExpanded, setConsistencyExpanded] = useState(true)

  const { data: allRules = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.allComplianceRules,
    queryFn: fetchAllComplianceRules,
  })

  const { data: portfolios = [] } = useQuery({
    queryKey: QUERY_KEYS.portfolios,
    queryFn: fetchPortfolios,
  })

  const { data: firmRules = [], isLoading: firmLoading } = useQuery({
    queryKey: QUERY_KEYS.firmComplianceRules,
    queryFn: fetchFirmComplianceRules,
  })

  const { data: allPositions = [] } = useQuery({
    queryKey: QUERY_KEYS.allPortfolioPositions,
    queryFn: fetchAllPortfolioPositions,
  })

  const { data: clientPortfolioNames = new Set<string>() } = useQuery({
    queryKey: QUERY_KEYS.clientPortfolioNames,
    queryFn: fetchClientPortfolioNames,
  })

  const consistencyThreshold = firmRules.find((r) => r.rule_type === 'consistency_deviation')?.threshold_value ?? 5

  const objectiveGroups = portfolios
    .filter((p) => clientPortfolioNames.has(p.name))
    .reduce<Record<string, string[]>>((acc, p) => {
      const obj = (p as any).investment_objective ?? 'No Objective'
      ;(acc[obj] ??= []).push(p.name)
      return acc
    }, {})

  const crossPortfolioChecks = Object.entries(objectiveGroups)
    .filter(([, names]) => names.length > 1)
    .map(([objective, names]) => {
      const groupPositions = allPositions.filter((p) => names.includes(p.portfolioName))
      const securityMap: Record<string, Record<string, number>> = {}
      groupPositions.forEach((p) => {
        ;(securityMap[p.securityId] ??= {})[p.portfolioName] = p.weight
      })

      const deviations = Object.entries(securityMap)
        .filter(([, weights]) => Object.keys(weights).length > 1)
        .map(([securityId, weights]) => {
          const vals = Object.values(weights)
          const deviation = Math.max(...vals) - Math.min(...vals)
          return { securityId, weights, deviation }
        })
        .filter(({ deviation }) => deviation > consistencyThreshold)
        .sort((a, b) => b.deviation - a.deviation)

      return { objective, names, deviations }
    })

  const updateFirmRuleMutation = useMutation({
    mutationFn: ({ id, threshold_value }: { id: number; threshold_value: number }) =>
      updateFirmComplianceRule(id, { threshold_value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.firmComplianceRules })
      setEditingFirmRuleId(null)
    },
  })

  const toggleFirmRuleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updateFirmComplianceRule(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.firmComplianceRules }),
  })

  // Separate portfolio rules from position rules
  const portfolioRules = allRules.filter((r) => PORTFOLIO_RULE_TYPES.has(r.rule_type))
  const positionRulesAll = allRules.filter((r) => POSITION_RULE_TYPES.has(r.rule_type))

  const byPortfolio = portfolioRules.reduce<Record<string, ComplianceRule[]>>((acc, rule) => {
    ;(acc[rule.portfolio_name] ??= []).push(rule)
    return acc
  }, {})

  const positionByPortfolio = positionRulesAll.reduce<Record<string, ComplianceRule[]>>((acc, rule) => {
    ;(acc[rule.portfolio_name] ??= []).push(rule)
    return acc
  }, {})

  const portfoliosWithRules = Object.keys(byPortfolio).sort()
  const portfoliosWithPositionRules = Object.keys(positionByPortfolio).sort()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allComplianceRules })
    const allPortfolioNames = new Set([...portfoliosWithRules, ...portfoliosWithPositionRules])
    allPortfolioNames.forEach((name) =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.complianceRules(name) })
    )
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!formPortfolio) throw new Error('Select a portfolio.')
      const val = parseFloat(threshold)
      if (Number.isNaN(val) || val <= 0 || val > 100)
        throw new Error('Threshold must be between 0.01 and 100.')
      return createComplianceRule({
        portfolio_name: formPortfolio,
        rule_type: ruleType,
        label: label || RULE_TYPE_LABELS[ruleType],
        threshold_value: val,
        is_active: true,
      })
    },
    onSuccess: () => {
      invalidate()
      setShowForm(false)
      setFormPortfolio('')
      setRuleType('max_single_position')
      setLabel('')
      setThreshold('')
      setFormError(null)
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Failed to add rule'),
  })

  const positionOption = POSITION_RULE_TYPE_OPTIONS.find((o) => o.value === positionRuleType)!
  const positionIsCountRule = positionRuleType === 'max_position_count' || positionRuleType === 'min_position_count'

  const createPositionMutation = useMutation({
    mutationFn: () => {
      if (!positionFormPortfolio) throw new Error('Select a portfolio.')
      const val = parseFloat(positionThreshold)
      if (positionIsCountRule) {
        if (Number.isNaN(val) || val <= 0 || !Number.isInteger(val))
          throw new Error('Count must be a positive whole number.')
      } else {
        if (Number.isNaN(val) || val <= 0 || val > 100)
          throw new Error('Threshold must be between 0.01 and 100.')
      }
      return createComplianceRule({
        portfolio_name: positionFormPortfolio,
        rule_type: positionRuleType,
        label: positionLabel || RULE_TYPE_LABELS[positionRuleType],
        threshold_value: val,
        is_active: true,
      })
    },
    onSuccess: () => {
      invalidate()
      setShowPositionForm(false)
      setPositionFormPortfolio('')
      setPositionRuleType('min_position_weight')
      setPositionLabel('')
      setPositionThreshold('')
      setPositionFormError(null)
    },
    onError: (err) => setPositionFormError(err instanceof Error ? err.message : 'Failed to add rule'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteComplianceRule(id),
    onSuccess: () => { invalidate(); setConfirmDeleteId(null) },
  })

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Compliance Rules</h1>
        <p className="mt-1 text-sm text-gray-500">
          Firm-wide fiduciary rules and portfolio-level compliance.
        </p>
      </div>

      {/* Fiduciary Rules */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Fiduciary Rules</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Firm-wide thresholds applied to every portfolio. Edit thresholds or toggle rules on/off.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-3">
            <p className="text-xs text-gray-500">
              {firmRules.length} rule{firmRules.length !== 1 ? 's' : ''} · applies to all portfolios
            </p>
          </div>
          {firmLoading ? (
            <p className="px-5 py-4 text-sm text-gray-400">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs">
                  <th className="px-5 py-2.5 text-left font-semibold text-gray-600">Rule</th>
                  <th className="w-36 px-5 py-2.5 text-right font-semibold text-gray-600">Threshold</th>
                  <th className="w-20 px-5 py-2.5 text-center font-semibold text-gray-600">Active</th>
                  <th className="w-20 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {firmRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-medium text-gray-900">{rule.label}</td>
                    <td className="px-5 py-2.5 text-right">
                      {editingFirmRuleId === rule.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            value={editingThreshold}
                            onChange={(e) => setEditingThreshold(e.target.value)}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
                            min="0.1"
                            step="0.5"
                          />
                          <button
                            onClick={() => {
                              const val = parseFloat(editingThreshold)
                              if (!isNaN(val) && val > 0) updateFirmRuleMutation.mutate({ id: rule.id, threshold_value: val })
                            }}
                            className="text-xs font-medium text-gray-900 hover:underline"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditingFirmRuleId(null)} className="text-xs text-gray-500 hover:text-gray-700">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="tabular-nums text-gray-700">
                          {rule.rule_type === 'min_holdings_count'
                            ? `${rule.threshold_value} holdings`
                            : `${rule.threshold_value}%`}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      <button
                        onClick={() => toggleFirmRuleMutation.mutate({ id: rule.id, is_active: !rule.is_active })}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${rule.is_active ? RESULT_COLORS.pass : 'bg-gray-100 text-gray-500'}`}
                      >
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {editingFirmRuleId !== rule.id && (
                        <button
                          onClick={() => { setEditingFirmRuleId(rule.id); setEditingThreshold(String(rule.threshold_value)) }}
                          className="text-xs text-gray-500 hover:text-gray-900"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cross-Portfolio Consistency — only show when there are actual deviations */}
      {crossPortfolioChecks.some((g) => g.deviations.length > 0) && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Cross-Portfolio Consistency</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Portfolios in the same investment objective should hold the same securities at similar weights.
              Deviations &gt; {consistencyThreshold}% are flagged.
            </p>
          </div>
          <div className="space-y-4">
            {crossPortfolioChecks.filter((g) => g.deviations.length > 0).map(({ objective, names, deviations }) => {
              const hasBreaches = deviations.length > 0
              return (
                <div key={objective} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setConsistencyExpanded((v) => !v)}
                    className={`flex w-full items-center justify-between border-b px-5 py-3 text-left ${
                      hasBreaches ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${consistencyExpanded ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{objective}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{names.length} portfolios · {deviations.length} deviation{deviations.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${hasBreaches ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {hasBreaches ? 'Inconsistent' : 'Consistent'}
                    </span>
                  </button>
                  {consistencyExpanded && (
                    deviations.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-gray-500">All portfolios consistent — no deviations exceed {consistencyThreshold}%.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm divide-y divide-gray-100">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-5 py-2.5 text-left font-semibold text-gray-900">Security</th>
                              {names.map((n) => (
                                <th key={n} className="w-28 px-4 py-2.5 text-right font-semibold text-gray-900 truncate max-w-[7rem]">{n}</th>
                              ))}
                              <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-900">Deviation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {deviations.map(({ securityId, weights, deviation }) => (
                              <tr key={securityId} className="bg-red-50">
                                <td className="px-5 py-2.5 font-medium text-gray-900">{securityId}</td>
                                {names.map((n) => (
                                  <td key={n} className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                                    {weights[n] != null ? `${weights[n].toFixed(1)}%` : <span className="text-gray-400">—</span>}
                                  </td>
                                ))}
                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-red-700">{deviation.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Portfolio-level rules */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Portfolio Rules</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Per-portfolio rules on aggregate allocations — equity, fixed income, cash, and max single position.
            </p>
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add Rule
          </button>
        </div>

        {/* Add portfolio rule form */}
        {showForm && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">New Portfolio Rule</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700">Portfolio</label>
                <select
                  value={formPortfolio}
                  onChange={(e) => setFormPortfolio(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="">Select portfolio…</option>
                  {portfolios.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700">Rule Type</label>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as RuleType)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  {PORTFOLIO_RULE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Threshold (%)</label>
                <input
                  type="number" min="0.01" max="100" step="0.1"
                  value={threshold}
                  onChange={(e) => { setThreshold(e.target.value); setFormError(null) }}
                  placeholder="e.g. 25"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Label <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={RULE_TYPE_LABELS[ruleType]}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
            </div>
            {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setShowForm(false); setFormError(null) }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving…' : 'Save Rule'}
              </button>
            </div>
          </div>
        )}

        {/* Rules by portfolio */}
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : portfoliosWithRules.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No portfolio rules yet. Click "Add Rule" to create one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {portfoliosWithRules.map((portfolioName) => (
              <div key={portfolioName} className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-5 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">{portfolioName}</h2>
                  <p className="text-xs text-gray-500">
                    {byPortfolio[portfolioName].length} rule{byPortfolio[portfolioName].length !== 1 ? 's' : ''}
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs">
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Rule</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Type</th>
                      <th className="w-24 px-4 py-2.5 text-right font-semibold text-gray-600">Threshold</th>
                      <th className="w-20 px-4 py-2.5 text-center font-semibold text-gray-600">Active</th>
                      <th className="w-16 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {byPortfolio[portfolioName].map((rule) => (
                      <>
                        <tr key={rule.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{rule.label}</td>
                          <td className="px-4 py-2.5 text-gray-600">{RULE_TYPE_LABELS[rule.rule_type]}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{rule.threshold_value}%</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${rule.is_active ? RESULT_COLORS.pass : 'bg-gray-100 text-gray-500'}`}>
                              {rule.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => setConfirmDeleteId(rule.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                        {confirmDeleteId === rule.id && (
                          <tr key={`confirm-${rule.id}`} className="bg-red-50">
                            <td colSpan={5} className="px-4 py-2.5">
                              <div className="flex items-center gap-3">
                                <p className="text-xs font-medium text-red-700">Remove "{rule.label}"?</p>
                                <button
                                  onClick={() => deleteMutation.mutate(rule.id)}
                                  disabled={deleteMutation.isPending}
                                  className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {deleteMutation.isPending ? 'Removing…' : 'Yes, remove'}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Position Rules */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Position Rules</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Per-portfolio rules on individual positions — minimum weight, maximum count, and minimum count.
            </p>
          </div>
          <button
            onClick={() => setShowPositionForm((s) => !s)}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add Rule
          </button>
        </div>

        {/* Add position rule form */}
        {showPositionForm && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">New Position Rule</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700">Portfolio</label>
                <select
                  value={positionFormPortfolio}
                  onChange={(e) => setPositionFormPortfolio(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="">Select portfolio…</option>
                  {portfolios.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700">Rule Type</label>
                <select
                  value={positionRuleType}
                  onChange={(e) => { setPositionRuleType(e.target.value as RuleType); setPositionThreshold('') }}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  {POSITION_RULE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {positionOption.hint && (
                  <p className="mt-1 text-xs text-gray-500">{positionOption.hint}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Threshold{positionIsCountRule ? '' : ' (%)'}
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min={positionIsCountRule ? '1' : '0.01'}
                    max={positionIsCountRule ? undefined : '100'}
                    step={positionIsCountRule ? '1' : '0.1'}
                    value={positionThreshold}
                    onChange={(e) => { setPositionThreshold(e.target.value); setPositionFormError(null) }}
                    placeholder={positionIsCountRule ? 'e.g. 30' : 'e.g. 0.5'}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  />
                  {!positionIsCountRule && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Label <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  value={positionLabel}
                  onChange={(e) => setPositionLabel(e.target.value)}
                  placeholder={RULE_TYPE_LABELS[positionRuleType]}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
            </div>
            {positionFormError && <p className="mt-2 text-xs text-red-600">{positionFormError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setShowPositionForm(false); setPositionFormError(null) }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createPositionMutation.mutate()}
                disabled={createPositionMutation.isPending}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {createPositionMutation.isPending ? 'Saving…' : 'Save Rule'}
              </button>
            </div>
          </div>
        )}

        {/* Position rules by portfolio */}
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : portfoliosWithPositionRules.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No position rules yet. Click "Add Rule" to create one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {portfoliosWithPositionRules.map((portfolioName) => (
              <div key={portfolioName} className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-5 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">{portfolioName}</h2>
                  <p className="text-xs text-gray-500">
                    {positionByPortfolio[portfolioName].length} rule{positionByPortfolio[portfolioName].length !== 1 ? 's' : ''}
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs">
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Rule</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Type</th>
                      <th className="w-28 px-4 py-2.5 text-right font-semibold text-gray-600">Threshold</th>
                      <th className="w-20 px-4 py-2.5 text-center font-semibold text-gray-600">Active</th>
                      <th className="w-16 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {positionByPortfolio[portfolioName].map((rule) => {
                      const isCount = rule.rule_type === 'max_position_count' || rule.rule_type === 'min_position_count'
                      return (
                        <>
                          <tr key={rule.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-900">{rule.label}</td>
                            <td className="px-4 py-2.5 text-gray-600">{RULE_TYPE_LABELS[rule.rule_type]}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                              {isCount ? rule.threshold_value : `${rule.threshold_value}%`}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${rule.is_active ? RESULT_COLORS.pass : 'bg-gray-100 text-gray-500'}`}>
                                {rule.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={() => setConfirmDeleteId(rule.id)}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                          {confirmDeleteId === rule.id && (
                            <tr key={`confirm-${rule.id}`} className="bg-red-50">
                              <td colSpan={5} className="px-4 py-2.5">
                                <div className="flex items-center gap-3">
                                  <p className="text-xs font-medium text-red-700">Remove "{rule.label}"?</p>
                                  <button
                                    onClick={() => deleteMutation.mutate(rule.id)}
                                    disabled={deleteMutation.isPending}
                                    className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {deleteMutation.isPending ? 'Removing…' : 'Yes, remove'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="text-xs text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
