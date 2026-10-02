import { Fragment, useState } from 'react'
import {
  RULE_TYPE_LABELS,
  isCountRule,
  scopeLabel,
  scopeCoverage,
  type ComplianceRule,
} from '@/lib/compliance'
import type { Portfolio } from '@/types/portfolio'

/**
 * The grouped rules list shared by Portfolio Rules and Position Rules.
 *
 * The two sections rendered byte-identical tables apart from the threshold
 * suffix, so edit support would have had to be written and then maintained
 * twice. Edit state is local: it is transient UI state with no other reader,
 * and lifting it would add six props per section to a list that is already long.
 */
export function ScopedRulesTable({
  scopeKeys,
  byScope,
  portfolios,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
}: {
  /** A portfolio name, or `strategy:<Strategy>`. */
  scopeKeys: string[]
  byScope: Record<string, ComplianceRule[]>
  portfolios: Portfolio[]
  onUpdate: (id: number, patch: { label?: string; threshold_value?: number; is_active?: boolean }) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
  isUpdating: boolean
  isDeleting: boolean
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editThreshold, setEditThreshold] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const startEdit = (rule: ComplianceRule) => {
    setConfirmDeleteId(null)
    setEditingId(rule.id)
    setEditLabel(rule.label)
    setEditThreshold(String(rule.threshold_value))
    setEditError(null)
  }

  const saveEdit = async (rule: ComplianceRule) => {
    const val = parseFloat(editThreshold)
    // Same validation the create form applies — a count must be a whole number,
    // a percentage must sit inside 0–100.
    if (isCountRule(rule.rule_type)) {
      if (Number.isNaN(val) || val <= 0 || !Number.isInteger(val)) {
        setEditError('Count must be a positive whole number.')
        return
      }
    } else if (Number.isNaN(val) || val <= 0 || val > 100) {
      setEditError('Threshold must be between 0.01 and 100.')
      return
    }
    if (!editLabel.trim()) {
      setEditError('Label cannot be empty.')
      return
    }
    // Awaited so a rejected write shows the reason rather than closing the row
    // as if it had saved.
    try {
      await onUpdate(rule.id, { label: editLabel.trim(), threshold_value: val })
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save rule')
      return
    }
    setEditingId(null)
  }

  return (
    <div className="space-y-4">
      {scopeKeys.map((scopeKey) => (
        <div key={scopeKey} className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">{scopeLabel(scopeKey)}</h2>
            <p className="text-xs text-gray-500">
              {byScope[scopeKey].length} rule{byScope[scopeKey].length !== 1 ? 's' : ''}
              {scopeCoverage(scopeKey, portfolios)}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs">
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Rule</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Type</th>
                <th className="w-28 px-4 py-2.5 text-right font-semibold text-gray-600">Threshold</th>
                <th className="w-20 px-4 py-2.5 text-center font-semibold text-gray-600">Active</th>
                <th className="w-32 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byScope[scopeKey].map((rule) => {
                const isCount = isCountRule(rule.rule_type)
                const isEditing = editingId === rule.id
                return (
                  <Fragment key={rule.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {isEditing ? (
                          <input
                            value={editLabel}
                            onChange={(e) => { setEditLabel(e.target.value); setEditError(null) }}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
                          />
                        ) : rule.label}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{RULE_TYPE_LABELS[rule.rule_type]}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                        {isEditing ? (
                          <input
                            type="number"
                            min={isCount ? 1 : 0.01}
                            max={isCount ? undefined : 100}
                            step={isCount ? 1 : 0.1}
                            value={editThreshold}
                            onChange={(e) => { setEditThreshold(e.target.value); setEditError(null) }}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none"
                          />
                        ) : isCount ? rule.threshold_value : `${rule.threshold_value}%`}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {/* The badge is the toggle, matching the Fiduciary table. */}
                        <button
                          onClick={() => onUpdate(rule.id, { is_active: !rule.is_active })}
                          disabled={isUpdating}
                          title={rule.is_active ? 'Deactivate this rule' : 'Activate this rule'}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium hover:opacity-80 disabled:opacity-50 ${
                            rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => saveEdit(rule)}
                              disabled={isUpdating}
                              className="text-xs font-medium text-gray-900 hover:text-gray-700 disabled:opacity-50"
                            >
                              {isUpdating ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditError(null) }}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => startEdit(rule)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setConfirmDeleteId(rule.id) }}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isEditing && editError && (
                      <tr>
                        <td colSpan={5} className="px-4 pb-2 text-xs text-red-600">{editError}</td>
                      </tr>
                    )}
                    {confirmDeleteId === rule.id && (
                      <tr className="bg-red-50">
                        <td colSpan={5} className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <p className="text-xs font-medium text-red-700">Remove "{rule.label}"?</p>
                            <button
                              onClick={() => { void onDelete(rule.id).then(() => setConfirmDeleteId(null)) }}
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
  )
}
