import { Fragment } from 'react'
import {
  RULE_TYPE_LABELS,
  type RuleType,
  type ComplianceRule,
} from '@/lib/compliance'
import type { Portfolio } from '@/types/portfolio'

const RESULT_COLORS: Record<string, string> = {
  pass:   'bg-green-100 text-green-700',
  warn:   'bg-amber-100 text-amber-700',
  breach: 'bg-red-100 text-red-700',
}

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

interface PositionRulesSectionProps {
  portfolios: Portfolio[]
  isLoading: boolean
  showPositionForm: boolean
  setShowPositionForm: (updater: (s: boolean) => boolean) => void
  positionFormPortfolio: string
  setPositionFormPortfolio: (v: string) => void
  positionRuleType: RuleType
  setPositionRuleType: (v: RuleType) => void
  positionLabel: string
  setPositionLabel: (v: string) => void
  positionThreshold: string
  setPositionThreshold: (v: string) => void
  positionFormError: string | null
  setPositionFormError: (v: string | null) => void
  onCancelForm: () => void
  onSaveRule: () => void
  isSaving: boolean
  portfoliosWithPositionRules: string[]
  positionByPortfolio: Record<string, ComplianceRule[]>
  confirmDeleteId: number | null
  setConfirmDeleteId: (id: number | null) => void
  onDelete: (id: number) => void
  isDeleting: boolean
}

export function PositionRulesSection({
  portfolios,
  isLoading,
  showPositionForm,
  setShowPositionForm,
  positionFormPortfolio,
  setPositionFormPortfolio,
  positionRuleType,
  setPositionRuleType,
  positionLabel,
  setPositionLabel,
  positionThreshold,
  setPositionThreshold,
  positionFormError,
  setPositionFormError,
  onCancelForm,
  onSaveRule,
  isSaving,
  portfoliosWithPositionRules,
  positionByPortfolio,
  confirmDeleteId,
  setConfirmDeleteId,
  onDelete,
  isDeleting,
}: PositionRulesSectionProps) {
  const positionOption = POSITION_RULE_TYPE_OPTIONS.find((o) => o.value === positionRuleType)!
  const positionIsCountRule = positionRuleType === 'max_position_count' || positionRuleType === 'min_position_count'

  return (
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
              onClick={onCancelForm}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onSaveRule}
              disabled={isSaving}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Rule'}
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
                      <Fragment key={rule.id}>
                        <tr className="hover:bg-gray-50">
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
                                  onClick={() => onDelete(rule.id)}
                                  disabled={isDeleting}
                                  className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {isDeleting ? 'Removing…' : 'Yes, remove'}
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
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
