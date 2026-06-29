import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchAlertRules, createAlertRule, deleteAlertRule,
  ALERT_METRIC_OPTIONS, type AlertOperator,
} from '@/lib/alertRules'
import { QUERY_KEYS } from '@/hooks/queryKeys'

const OPERATOR_LABELS: Record<AlertOperator, string> = {
  lt: '< less than',
  lte: '≤ less than or equal',
  gt: '> greater than',
  gte: '≥ greater than or equal',
  eq: '= equal to',
}

export function AlertRulesSection({ securityId }: { securityId: string }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [metricField, setMetricField] = useState('historical_sharpe_3y')
  const [operator, setOperator] = useState<AlertOperator>('lt')
  const [threshold, setThreshold] = useState('')

  const { data: rules = [] } = useQuery({
    queryKey: QUERY_KEYS.alertRules(securityId),
    queryFn: () => fetchAlertRules(securityId),
  })

  const createMutation = useMutation({
    mutationFn: () => createAlertRule({
      security_id: securityId,
      metric_field: metricField,
      operator,
      threshold_value: Number(threshold),
      is_active: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alertRules(securityId) })
      setShowForm(false); setThreshold('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAlertRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alertRules(securityId) }),
  })

  const metricLabel = (field: string) => ALERT_METRIC_OPTIONS.find((o) => o.value === field)?.label ?? field

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Performance Alert Rules</h3>
        <button onClick={() => setShowForm((v) => !v)}
          className="text-sm font-medium text-gray-500 hover:text-gray-700">
          {showForm ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {showForm && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Metric</label>
              <select value={metricField} onChange={(e) => setMetricField(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none">
                {ALERT_METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Operator</label>
              <select value={operator} onChange={(e) => setOperator(e.target.value as AlertOperator)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none">
                {(Object.entries(OPERATOR_LABELS) as [AlertOperator, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Threshold</label>
              <input type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)}
                placeholder="0.00"
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none" />
            </div>
          </div>
          <button onClick={() => createMutation.mutate()} disabled={!threshold || createMutation.isPending}
            className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {createMutation.isPending ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      )}

      {rules.length === 0 && !showForm ? (
        <p className="px-4 py-6 text-sm text-gray-500">No alert rules configured. Add one to get notified when this security breaches a threshold.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between px-4 py-3">
              <div className="text-sm text-gray-800">
                <span className="font-medium">{metricLabel(rule.metric_field)}</span>
                {' '}{OPERATOR_LABELS[rule.operator].split(' ')[0]}{' '}
                <span className="font-medium">{rule.threshold_value}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${rule.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                  {rule.is_active ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => deleteMutation.mutate(rule.id)}
                  className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
