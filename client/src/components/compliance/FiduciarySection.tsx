import { Fragment, useState } from 'react'
import { FIRM_RULE_TYPES, type FirmComplianceRule, type FirmRuleType } from '@/lib/firmCompliance'

const RESULT_COLORS: Record<string, string> = {
  pass:   'bg-green-100 text-green-700',
  warn:   'bg-amber-100 text-amber-700',
  breach: 'bg-red-100 text-red-700',
}

interface FiduciarySectionProps {
  firmRules: FirmComplianceRule[]
  firmLoading: boolean
  editingFirmRuleId: number | null
  editingThreshold: string
  setEditingFirmRuleId: (id: number | null) => void
  setEditingThreshold: (v: string) => void
  onSaveThreshold: (id: number, threshold_value: number) => void
  onToggle: (id: number, is_active: boolean) => void
  onCreate: (rule: { rule_type: FirmRuleType; label: string; threshold_value: number }) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
  isSaving: boolean
  isDeleting: boolean
}

export function FiduciarySection({
  firmRules,
  firmLoading,
  editingFirmRuleId,
  editingThreshold,
  setEditingFirmRuleId,
  setEditingThreshold,
  onSaveThreshold,
  onToggle,
  onCreate,
  onDelete,
  isSaving,
  isDeleting,
}: FiduciarySectionProps) {
  const [showForm, setShowForm] = useState(false)
  const [newType, setNewType] = useState<FirmRuleType | ''>('')
  const [newThreshold, setNewThreshold] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // One live rule per type (a partial unique index enforces it), so a type
  // already in use is not offered rather than failing on save.
  const usedTypes = new Set(firmRules.map((r) => r.rule_type))
  const availableTypes = FIRM_RULE_TYPES.filter((t) => !usedTypes.has(t.value))

  const submit = async () => {
    if (!newType) { setFormError('Pick a rule type.'); return }
    const val = parseFloat(newThreshold)
    const isCount = newType === 'min_holdings_count'
    if (isCount ? (Number.isNaN(val) || val <= 0 || !Number.isInteger(val))
                : (Number.isNaN(val) || val <= 0 || val > 100)) {
      setFormError(isCount ? 'Count must be a positive whole number.' : 'Threshold must be between 0.01 and 100.')
      return
    }
    const def = FIRM_RULE_TYPES.find((t) => t.value === newType)!
    // Awaited so a rejected write keeps the form open with the reason, instead
    // of closing as though it had saved.
    try {
      await onCreate({ rule_type: newType, label: def.label, threshold_value: val })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add rule')
      return
    }
    setShowForm(false); setNewType(''); setNewThreshold(''); setFormError(null)
  }

  const [deleteError, setDeleteError] = useState<string | null>(null)
  const remove = async (id: number) => {
    try {
      await onDelete(id)
      setConfirmDeleteId(null); setDeleteError(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to remove rule')
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Fiduciary Rules</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Firm-wide thresholds applied to every portfolio. Add, edit, deactivate or remove them.
          </p>
        </div>
        {availableTypes.length > 0 && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add Rule
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">New Fiduciary Rule</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">Rule Type</label>
              <select
                value={newType}
                onChange={(e) => { setNewType(e.target.value as FirmRuleType); setFormError(null) }}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                <option value="">Select rule type…</option>
                {availableTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Threshold {newType === 'min_holdings_count' ? '(holdings)' : '(%)'}
              </label>
              <input
                type="number" min="0.01" step={newType === 'min_holdings_count' ? 1 : 0.1}
                value={newThreshold}
                onChange={(e) => { setNewThreshold(e.target.value); setFormError(null) }}
                placeholder="e.g. 25"
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
              onClick={submit}
              disabled={isSaving}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Rule'}
            </button>
          </div>
        </div>
      )}
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
                <Fragment key={rule.id}>
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
                            if (!isNaN(val) && val > 0) onSaveThreshold(rule.id, val)
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
                      onClick={() => onToggle(rule.id, !rule.is_active)}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${rule.is_active ? RESULT_COLORS.pass : 'bg-gray-100 text-gray-500'}`}
                    >
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {editingFirmRuleId !== rule.id && (
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => { setConfirmDeleteId(null); setEditingFirmRuleId(rule.id); setEditingThreshold(String(rule.threshold_value)) }}
                          className="text-xs text-gray-500 hover:text-gray-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setEditingFirmRuleId(null); setConfirmDeleteId(rule.id) }}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {confirmDeleteId === rule.id && (
                  <tr key={`confirm-${rule.id}`} className="bg-red-50">
                    <td colSpan={4} className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <p className="text-xs font-medium text-red-700">
                          Remove "{rule.label}" for every portfolio?
                        </p>
                        <button
                          onClick={() => remove(rule.id)}
                          disabled={isDeleting}
                          className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {isDeleting ? 'Removing…' : 'Yes, remove'}
                        </button>
                        <button onClick={() => { setConfirmDeleteId(null); setDeleteError(null) }} className="text-xs text-gray-500 hover:text-gray-700">
                          Cancel
                        </button>
                        {deleteError && <span className="text-xs text-red-600">{deleteError}</span>}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
