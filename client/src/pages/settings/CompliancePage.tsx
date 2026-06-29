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
  computeCrossPortfolioChecks,
} from '@/lib/firmCompliance'
import { fetchPortfolios } from '@/lib/portfolio'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { FiduciarySection } from '@/components/compliance/FiduciarySection'
import { CrossPortfolioSection } from '@/components/compliance/CrossPortfolioSection'
import { PortfolioRulesSection } from '@/components/compliance/PortfolioRulesSection'
import { PositionRulesSection } from '@/components/compliance/PositionRulesSection'

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

  const crossPortfolioChecks = computeCrossPortfolioChecks(
    portfolios,
    clientPortfolioNames,
    allPositions,
    consistencyThreshold,
  )

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
      <FiduciarySection
        firmRules={firmRules}
        firmLoading={firmLoading}
        editingFirmRuleId={editingFirmRuleId}
        editingThreshold={editingThreshold}
        setEditingFirmRuleId={setEditingFirmRuleId}
        setEditingThreshold={setEditingThreshold}
        onSaveThreshold={(id, threshold_value) => updateFirmRuleMutation.mutate({ id, threshold_value })}
        onToggle={(id, is_active) => toggleFirmRuleMutation.mutate({ id, is_active })}
      />

      {/* Cross-Portfolio Consistency — only show when there are actual deviations */}
      {crossPortfolioChecks.some((g) => g.deviations.length > 0) && (
        <CrossPortfolioSection
          crossPortfolioChecks={crossPortfolioChecks}
          consistencyThreshold={consistencyThreshold}
          consistencyExpanded={consistencyExpanded}
          setConsistencyExpanded={setConsistencyExpanded}
        />
      )}

      {/* Portfolio-level rules */}
      <PortfolioRulesSection
        portfolios={portfolios}
        isLoading={isLoading}
        showForm={showForm}
        setShowForm={setShowForm}
        formPortfolio={formPortfolio}
        setFormPortfolio={setFormPortfolio}
        ruleType={ruleType}
        setRuleType={setRuleType}
        label={label}
        setLabel={setLabel}
        threshold={threshold}
        setThreshold={setThreshold}
        formError={formError}
        setFormError={setFormError}
        onCancelForm={() => { setShowForm(false); setFormError(null) }}
        onSaveRule={() => createMutation.mutate()}
        isSaving={createMutation.isPending}
        portfoliosWithRules={portfoliosWithRules}
        byPortfolio={byPortfolio}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        onDelete={(id) => deleteMutation.mutate(id)}
        isDeleting={deleteMutation.isPending}
      />

      {/* Position Rules */}
      <PositionRulesSection
        portfolios={portfolios}
        isLoading={isLoading}
        showPositionForm={showPositionForm}
        setShowPositionForm={setShowPositionForm}
        positionFormPortfolio={positionFormPortfolio}
        setPositionFormPortfolio={setPositionFormPortfolio}
        positionRuleType={positionRuleType}
        setPositionRuleType={setPositionRuleType}
        positionLabel={positionLabel}
        setPositionLabel={setPositionLabel}
        positionThreshold={positionThreshold}
        setPositionThreshold={setPositionThreshold}
        positionFormError={positionFormError}
        setPositionFormError={setPositionFormError}
        onCancelForm={() => { setShowPositionForm(false); setPositionFormError(null) }}
        onSaveRule={() => createPositionMutation.mutate()}
        isSaving={createPositionMutation.isPending}
        portfoliosWithPositionRules={portfoliosWithPositionRules}
        positionByPortfolio={positionByPortfolio}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        onDelete={(id) => deleteMutation.mutate(id)}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  )
}
