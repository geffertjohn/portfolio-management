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
  portfoliosWithRules: string[]
  byPortfolio: Record<string, ComplianceRule[]>
  confirmDeleteId: number | null
  setConfirmDeleteId: (id: number | null) => void
  onDelete: (id: number) => void
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
  confirmDeleteId,
  setConfirmDeleteId,
  onDelete,
  isDeleting,
}: PortfolioRulesSectionProps) {
  return (
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
                    <Fragment key={rule.id}>
                      <tr className="hover:bg-gray-50">
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
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
