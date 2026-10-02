import {
  RULE_TYPE_LABELS,
  type RuleType,
  type ComplianceRule,
} from '@/lib/compliance'
import type { Portfolio } from '@/types/portfolio'
import { ScopeSelect } from './ScopeSelect'
import { ScopedRulesTable } from './ScopedRulesTable'

const PORTFOLIO_RULE_TYPE_OPTIONS: { value: RuleType; label: string }[] = [
  { value: 'max_single_position',   label: 'Max Single Position (%)' },
  { value: 'max_equity_pct',        label: 'Max Equity (%)' },
  { value: 'min_equity_pct',        label: 'Min Equity (%)' },
  { value: 'max_fixed_income_pct',  label: 'Max Fixed Income (%)' },
  { value: 'min_fixed_income_pct',  label: 'Min Fixed Income (%)' },
  { value: 'max_cash_pct',          label: 'Max Cash (%)' },
  { value: 'min_cash_pct',          label: 'Min Cash (%)' },
]

interface PortfolioRulesSectionProps {
  portfolios: Portfolio[]
  isLoading: boolean
  showForm: boolean
  setShowForm: (updater: (s: boolean) => boolean) => void
  formPortfolio: string
  setFormPortfolio: (v: string) => void
  ruleType: RuleType
  setRuleType: (v: RuleType) => void
  label: string
  setLabel: (v: string) => void
  threshold: string
  setThreshold: (v: string) => void
  formError: string | null
  setFormError: (v: string | null) => void
  onCancelForm: () => void
  onSaveRule: () => void
  isSaving: boolean
  /** Scope keys (a portfolio name, or `strategy:<Strategy>`). */
  portfoliosWithRules: string[]
  byPortfolio: Record<string, ComplianceRule[]>
  onUpdate: (id: number, patch: { label?: string; threshold_value?: number; is_active?: boolean }) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
  isUpdating: boolean
  isDeleting: boolean
}

export function PortfolioRulesSection({
  portfolios,
  isLoading,
  showForm,
  setShowForm,
  formPortfolio,
  setFormPortfolio,
  ruleType,
  setRuleType,
  label,
  setLabel,
  threshold,
  setThreshold,
  formError,
  setFormError,
  onCancelForm,
  onSaveRule,
  isSaving,
  portfoliosWithRules,
  byPortfolio,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
}: PortfolioRulesSectionProps) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Portfolio Rules</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Rules on aggregate allocations — equity, fixed income, cash, and max single position.
            Scope each to one portfolio or to a whole strategy.
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
              <label className="block text-xs font-medium text-gray-700">Applies to</label>
              <ScopeSelect portfolios={portfolios} value={formPortfolio} onChange={setFormPortfolio} />
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

      {/* Rules by portfolio */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : portfoliosWithRules.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No portfolio rules yet. Click "Add Rule" to create one.</p>
        </div>
      ) : (
        <ScopedRulesTable
          scopeKeys={portfoliosWithRules}
          byScope={byPortfolio}
          portfolios={portfolios}
          onUpdate={onUpdate}
          onDelete={onDelete}
          isUpdating={isUpdating}
          isDeleting={isDeleting}
        />
      )}
    </div>
  )
}
