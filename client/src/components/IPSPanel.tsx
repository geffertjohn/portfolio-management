/**
 * IPSPanel
 *
 * Displays and edits the Investment Policy Statement for a client.
 * Used as the "IPS" tab on ClientDetailPage.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchIPSByClient,
  upsertIPS,
  RISK_TOLERANCE_LABELS,
  INVESTMENT_OBJECTIVE_LABELS,
  LIQUIDITY_NEEDS_LABELS,
  type IPS,
  type IPSInput,
  type RiskTolerance,
  type InvestmentObjective,
  type LiquidityNeeds,
} from '@/lib/ips'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { IpsModelCompatibility } from './IpsModelCompatibility'

const RISK_OPTIONS: RiskTolerance[] = [
  'conservative', 'moderately_conservative', 'moderate', 'moderately_aggressive', 'aggressive',
]
const OBJECTIVE_OPTIONS: InvestmentObjective[] = [
  'capital_preservation', 'income', 'balanced', 'growth', 'aggressive_growth',
]
const LIQUIDITY_OPTIONS: LiquidityNeeds[] = ['low', 'medium', 'high']

const EMPTY_FORM: IPSInput = {
  risk_tolerance: 'moderate',
  investment_objective: 'balanced',
  time_horizon_years: null,
  liquidity_needs: null,
  return_target_pct: null,
  equity_min_pct: null,
  equity_max_pct: null,
  fixed_income_min_pct: null,
  fixed_income_max_pct: null,
  cash_min_pct: null,
  cash_max_pct: null,
  notes: null,
  effective_date: new Date().toISOString().slice(0, 10),
}

function ipsToForm(ips: IPS): IPSInput {
  return {
    risk_tolerance: ips.risk_tolerance,
    investment_objective: ips.investment_objective,
    time_horizon_years: ips.time_horizon_years,
    liquidity_needs: ips.liquidity_needs,
    return_target_pct: ips.return_target_pct,
    equity_min_pct: ips.equity_min_pct,
    equity_max_pct: ips.equity_max_pct,
    fixed_income_min_pct: ips.fixed_income_min_pct,
    fixed_income_max_pct: ips.fixed_income_max_pct,
    cash_min_pct: ips.cash_min_pct,
    cash_max_pct: ips.cash_max_pct,
    notes: ips.notes,
    effective_date: ips.effective_date,
  }
}

function LabeledValue({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  )
}

function RangeValue({ label, min, max, unit = '%' }: { label: string; min: number | null; max: number | null; unit?: string }) {
  const display = min != null && max != null
    ? `${min}${unit} – ${max}${unit}`
    : min != null ? `≥ ${min}${unit}` : max != null ? `≤ ${max}${unit}` : '—'
  return <LabeledValue label={label} value={display} />
}

function NumericInput({
  label, value, onChange, placeholder, min, max, step = '0.1',
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  min?: number
  max?: number
  step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
    </div>
  )
}

interface IPSPanelProps {
  clientId: number
}

export function IPSPanel({ clientId }: IPSPanelProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<IPSInput>(EMPTY_FORM)

  const { data: ips, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ips(clientId),
    queryFn: () => fetchIPSByClient(clientId),
  })

  const saveMutation = useMutation({
    mutationFn: () => upsertIPS(clientId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ips(clientId) })
      setEditing(false)
    },
  })

  function startEdit() {
    setForm(ips ? ipsToForm(ips) : EMPTY_FORM)
    setEditing(true)
  }

  function set<K extends keyof IPSInput>(key: K, value: IPSInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>

  // ── Edit form ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {ips ? 'Edit Investment Policy Statement' : 'Create Investment Policy Statement'}
          </h3>
        </div>

        <div className="space-y-6">
          {/* Profile */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Client Profile</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">Risk Tolerance</label>
                <select
                  value={form.risk_tolerance}
                  onChange={(e) => set('risk_tolerance', e.target.value as RiskTolerance)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                >
                  {RISK_OPTIONS.map((o) => (
                    <option key={o} value={o}>{RISK_TOLERANCE_LABELS[o]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500">Investment Objective</label>
                <select
                  value={form.investment_objective}
                  onChange={(e) => set('investment_objective', e.target.value as InvestmentObjective)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                >
                  {OBJECTIVE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{INVESTMENT_OBJECTIVE_LABELS[o]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500">Liquidity Needs</label>
                <select
                  value={form.liquidity_needs ?? ''}
                  onChange={(e) => set('liquidity_needs', e.target.value === '' ? null : e.target.value as LiquidityNeeds)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {LIQUIDITY_OPTIONS.map((o) => (
                    <option key={o} value={o}>{LIQUIDITY_NEEDS_LABELS[o]}</option>
                  ))}
                </select>
              </div>

              <NumericInput
                label="Time Horizon (years)"
                value={form.time_horizon_years}
                onChange={(v) => set('time_horizon_years', v)}
                min={1}
                max={50}
                step="1"
                placeholder="e.g. 10"
              />
            </div>
          </div>

          {/* Targets */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Targets</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumericInput
                label="Return Target (%)"
                value={form.return_target_pct}
                onChange={(v) => set('return_target_pct', v)}
                min={0}
                max={30}
                placeholder="e.g. 7.5"
              />
              <div>
                <label className="block text-xs font-medium text-gray-500">Effective Date</label>
                <input
                  type="date"
                  value={form.effective_date}
                  onChange={(e) => set('effective_date', e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Asset class constraints */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Asset Class Constraints (%)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700">Equity</p>
                <div className="grid grid-cols-2 gap-2">
                  <NumericInput label="Min" value={form.equity_min_pct} onChange={(v) => set('equity_min_pct', v)} min={0} max={100} placeholder="0" />
                  <NumericInput label="Max" value={form.equity_max_pct} onChange={(v) => set('equity_max_pct', v)} min={0} max={100} placeholder="100" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700">Fixed Income</p>
                <div className="grid grid-cols-2 gap-2">
                  <NumericInput label="Min" value={form.fixed_income_min_pct} onChange={(v) => set('fixed_income_min_pct', v)} min={0} max={100} placeholder="0" />
                  <NumericInput label="Max" value={form.fixed_income_max_pct} onChange={(v) => set('fixed_income_max_pct', v)} min={0} max={100} placeholder="100" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700">Cash</p>
                <div className="grid grid-cols-2 gap-2">
                  <NumericInput label="Min" value={form.cash_min_pct} onChange={(v) => set('cash_min_pct', v)} min={0} max={100} placeholder="0" />
                  <NumericInput label="Max" value={form.cash_max_pct} onChange={(v) => set('cash_max_pct', v)} min={0} max={100} placeholder="100" />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500">Notes</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
              rows={3}
              placeholder="Special circumstances, restrictions, additional guidelines…"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
        </div>

        {saveMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {saveMutation.error instanceof Error ? saveMutation.error.message : 'Failed to save'}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saveMutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save IPS'}
          </button>
        </div>
      </div>
    )
  }

  // ── No IPS on file ─────────────────────────────────────────────────────────
  if (!ips) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
        <p className="text-sm font-medium text-gray-500">No IPS on file</p>
        <p className="mt-1 text-xs text-gray-400">
          Document this client's investment policy statement to support compliance reviews.
        </p>
        <button
          type="button"
          onClick={startEdit}
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Create IPS
        </button>
      </div>
    )
  }

  // ── Display ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Investment Policy Statement</h3>
          <p className="mt-0.5 text-xs text-gray-400">
            Effective {new Date(ips.effective_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            {' · '}Last updated {new Date(ips.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
        </div>
        <button
          type="button"
          onClick={startEdit}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit
        </button>
      </div>

      <dl className="mt-5 space-y-5">
        {/* Profile */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Client Profile</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <LabeledValue label="Risk Tolerance" value={RISK_TOLERANCE_LABELS[ips.risk_tolerance]} />
            <LabeledValue label="Objective" value={INVESTMENT_OBJECTIVE_LABELS[ips.investment_objective]} />
            <LabeledValue label="Liquidity Needs" value={ips.liquidity_needs ? LIQUIDITY_NEEDS_LABELS[ips.liquidity_needs] : null} />
            <LabeledValue label="Time Horizon" value={ips.time_horizon_years != null ? `${ips.time_horizon_years} years` : null} />
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Targets */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Targets</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledValue label="Return Target" value={ips.return_target_pct != null ? `${ips.return_target_pct}%` : null} />
            <LabeledValue label="Effective Date" value={new Date(ips.effective_date + 'T00:00:00').toLocaleDateString()} />
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Asset class constraints */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Asset Class Constraints</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <RangeValue label="Equity" min={ips.equity_min_pct} max={ips.equity_max_pct} />
            <RangeValue label="Fixed Income" min={ips.fixed_income_min_pct} max={ips.fixed_income_max_pct} />
            <RangeValue label="Cash" min={ips.cash_min_pct} max={ips.cash_max_pct} />
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Compatibility of the client's mapped model portfolio(s) with these IPS bands */}
        <IpsModelCompatibility clientId={clientId} ips={ips} />

        {ips.notes && (
          <>
            <div className="border-t border-gray-100" />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ips.notes}</p>
            </div>
          </>
        )}
      </dl>
    </div>
  )
}
