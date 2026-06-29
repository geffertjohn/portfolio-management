import type { FirmComplianceRule } from '@/lib/firmCompliance'

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
}: FiduciarySectionProps) {
  return (
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
  )
}
