import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  fetchModelPortfolios,
  createModelPortfolio,
  updateModelPortfolio,
  deleteModelPortfolio,
  ASSET_CLASS_ROWS,
} from '@/lib/modelPortfolios'
import type { ModelPortfolio, ModelPortfolioInput } from '@/lib/modelPortfolios'

const QUERY_KEY = ['model_portfolios']

// target string → number, defaulting 0
function n(v: string) { return Number(v) || 0 }

// Round to nearest 0.5%
function roundHalf(v: number) { return Math.round(v / 0.5) * 0.5 }

function applyDrift(target: number, drift: number) {
  return {
    lower: roundHalf(target * (1 - drift / 100)),
    upper: roundHalf(target * (1 + drift / 100)),
  }
}

// Only targets stored in draft (lower/upper always computed from drift)
type DraftTargets = Record<string, string>   // key → target string

function buildDraftTargets(mp: ModelPortfolio): DraftTargets {
  const draft: DraftTargets = {}
  for (const { key } of ASSET_CLASS_ROWS) {
    draft[key] = String((mp as unknown as Record<string, unknown>)[`${key}_target`] ?? 0)
  }
  return draft
}

function blankDraftTargets(): DraftTargets {
  const draft: DraftTargets = {}
  for (const { key } of ASSET_CLASS_ROWS) { draft[key] = '0' }
  return draft
}

function pct(v: number | null) {
  return v != null ? `${v.toFixed(1)}%` : '—'
}

function buildAcManualLimits(mp: ModelPortfolio) {
  const rec = mp as unknown as Record<string, unknown>
  const out: Record<string, { lower: string; upper: string }> = {}
  for (const { key } of ASSET_CLASS_ROWS) {
    out[key] = {
      lower: String(rec[`${key}_lower_limit`] ?? 0),
      upper: String(rec[`${key}_upper_limit`] ?? 0),
    }
  }
  return out
}

function blankAcManualLimits() {
  const out: Record<string, { lower: string; upper: string }> = {}
  for (const { key } of ASSET_CLASS_ROWS) { out[key] = { lower: '0', upper: '0' } }
  return out
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial?: ModelPortfolio
  models: ModelPortfolio[]
  benchmarkOptions: string[]
  onSave: (data: ModelPortfolioInput) => void
  onCancel: () => void
  isPending: boolean
  error: Error | null
}

// Category targets (equity/fixedIncome drift-computed; cash explicit lower/target/upper)
type DraftCategoryTargets = { equityTarget: string; fixedIncomeTarget: string }
type DraftCash = { lower: string; target: string; upper: string }

function buildDraftCategory(mp: ModelPortfolio): DraftCategoryTargets {
  return {
    equityTarget:      String(mp.equity_target       ?? 0),
    fixedIncomeTarget: String(mp.fixed_income_target ?? 0),
  }
}

function buildDraftCash(mp: ModelPortfolio): DraftCash {
  return {
    lower:  String(mp.cash_lower_limit ?? 0),
    target: String(mp.cash_target      ?? 0),
    upper:  String(mp.cash_upper_limit ?? 0),
  }
}

function ModelPortfolioModal({ initial, models, benchmarkOptions, onSave, onCancel, isPending, error }: ModalProps) {
  const uniq = <T,>(arr: (T | null | undefined)[]) =>
    [...new Set(arr.filter((v): v is T => v != null))].sort()

  const objectives  = uniq(models.map((m) => m.investment_objective))
  const riskProfiles = uniq(models.map((m) => m.risk_profile))
  const [objective,    setObjective]    = useState(initial?.investment_objective ?? '')
  const [riskProfile,  setRiskProfile]  = useState(initial?.risk_profile ?? '')
  const [benchmark,           setBenchmark]           = useState(initial?.benchmark ?? '')
  const [rebalanceFrequency, setRebalanceFrequency]   = useState(initial?.rebalance_frequency ?? '')
  const [reviewFrequency,    setReviewFrequency]      = useState(initial?.review_frequency ?? '')
  const [description,        setDescription]          = useState(initial?.description ?? '')

  // Independent drift % per level
  const [catDrift,    setCatDrift]    = useState(String(initial?.category_drift_percentage    ?? 20))
  const [acDrift,     setAcDrift]     = useState(String(initial?.asset_class_drift_percentage ?? 20))
  const [posDrift,    setPosDrift]    = useState(String(initial?.drift_percentage              ?? 20))

  // Category: only targets for equity/fixedIncome (lower/upper computed); cash is explicit
  const [catTargets, setCatTargets] = useState<DraftCategoryTargets>(
    initial ? buildDraftCategory(initial) : { equityTarget: '0', fixedIncomeTarget: '0' }
  )
  const [cash, setCash] = useState<DraftCash>(
    initial ? buildDraftCash(initial) : { lower: '0', target: '0', upper: '0' }
  )

  // Asset class: only targets (lower/upper computed); cash synced from above
  const [acTargets, setAcTargets] = useState<DraftTargets>(
    initial ? buildDraftTargets(initial) : blankDraftTargets()
  )

  // Allocation mode per section
  const [catMode, setCatMode] = useState<'absolute' | 'manual'>(
    (initial?.category_allocation_mode as 'absolute' | 'manual') ?? 'absolute'
  )
  const [acMode, setAcMode] = useState<'relative' | 'manual'>(
    (initial?.asset_class_allocation_mode as 'relative' | 'manual') ?? 'relative'
  )

  // Manual limits (used when mode === 'manual')
  const [catManualLimits, setCatManualLimits] = useState({
    equityLower:      String(initial?.equity_lower_limit       ?? 0),
    equityUpper:      String(initial?.equity_upper_limit       ?? 0),
    fixedIncomeLower: String(initial?.fixed_income_lower_limit ?? 0),
    fixedIncomeUpper: String(initial?.fixed_income_upper_limit ?? 0),
  })
  const [acManualLimits, setAcManualLimits] = useState(
    initial ? buildAcManualLimits(initial) : blankAcManualLimits()
  )
  const setAcManualLimit = (key: string, field: 'lower' | 'upper', val: string) =>
    setAcManualLimits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: val } }))

  const setCashField = (field: 'lower' | 'target' | 'upper', val: string) => {
    setCash((prev) => ({ ...prev, [field]: val }))
    // Keep Asset Class cash in sync — acTargets only stores target; cash ac row is read-only
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cd = n(catDrift)
    const ad = n(acDrift)

    const eqTarget = n(catTargets.equityTarget)
    const fiTarget = n(catTargets.fixedIncomeTarget)
    const eqDrifted = catMode === 'manual'
      ? { lower: n(catManualLimits.equityLower),      upper: n(catManualLimits.equityUpper) }
      : { lower: Math.max(0, eqTarget - cd),           upper: Math.min(99, eqTarget + cd) }
    const fiDrifted = catMode === 'manual'
      ? { lower: n(catManualLimits.fixedIncomeLower), upper: n(catManualLimits.fixedIncomeUpper) }
      : { lower: Math.max(0, fiTarget - cd),           upper: Math.min(99, fiTarget + cd) }

    // Asset class payload — compute lower/upper from drift or use manual; cash synced from category
    const acPayload: Partial<ModelPortfolioInput> = {}
    for (const { key } of ASSET_CLASS_ROWS) {
      const target = key === 'cash' ? n(cash.target) : n(acTargets[key])
      let lower: number, upper: number
      if (key === 'cash') {
        lower = n(cash.lower); upper = n(cash.upper)
      } else if (acMode === 'manual') {
        lower = n(acManualLimits[key].lower); upper = n(acManualLimits[key].upper)
      } else {
        lower = applyDrift(target, ad).lower; upper = applyDrift(target, ad).upper
      }
      ;(acPayload as unknown as Record<string, unknown>)[`${key}_target`]      = target
      ;(acPayload as unknown as Record<string, unknown>)[`${key}_lower_limit`] = lower
      ;(acPayload as unknown as Record<string, unknown>)[`${key}_upper_limit`] = upper
    }

    onSave({
      investment_objective:          objective    || null,
      risk_profile:                  riskProfile  || null,
      benchmark:                     benchmark           || null,
      rebalance_frequency:           rebalanceFrequency  || null,
      review_frequency:              reviewFrequency     || null,
      description:                   description         || null,
      category_drift_percentage:     cd || null,
      asset_class_drift_percentage:  ad || null,
      drift_percentage:              n(posDrift)  || null,
      category_allocation_mode:      catMode,
      asset_class_allocation_mode:   acMode,
      equity_lower_limit:            eqDrifted.lower,
      equity_target:                 eqTarget,
      equity_upper_limit:            eqDrifted.upper,
      fixed_income_lower_limit:      fiDrifted.lower,
      fixed_income_target:           fiTarget,
      fixed_income_upper_limit:      fiDrifted.upper,
      cash_lower_limit:              n(cash.lower),
      cash_target:                   n(cash.target),
      cash_upper_limit:              n(cash.upper),
      ...acPayload,
    } as ModelPortfolioInput)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
      <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white shadow-xl">
        <form onSubmit={handleSubmit}>
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {initial ? 'Edit Model Portfolio' : 'New Model Portfolio'}
            </h2>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Investment Objective</label>
                {(initial?.id ?? 0) >= 10 ? (
                  <input value={objective} onChange={(e) => setObjective(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
                ) : (
                  <select value={objective} onChange={(e) => setObjective(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                    <option value="">— Select —</option>
                    {objectives.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Risk Profile</label>
                {(initial?.id ?? 0) >= 10 ? (
                  <input value={riskProfile} onChange={(e) => setRiskProfile(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
                ) : (
                  <select value={riskProfile} onChange={(e) => setRiskProfile(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                    <option value="">— Select —</option>
                    {riskProfiles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Benchmark</label>
                <select value={benchmark} onChange={(e) => setBenchmark(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                  <option value="">— Select —</option>
                  {benchmarkOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Rebalance Frequency</label>
                <select value={rebalanceFrequency} onChange={(e) => setRebalanceFrequency(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                  <option value="">— Select —</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Semi-Annual">Semi-Annual</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Review Frequency</label>
                <select value={reviewFrequency} onChange={(e) => setReviewFrequency(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                  <option value="">— Select —</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Semi-Annual">Semi-Annual</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none" />
              </div>
            </div>

            {/* ── Asset Allocation (Category) ──────────────────────────────── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Asset Allocation</p>
                <div className="flex items-center gap-2">
                  <div className="flex overflow-hidden rounded border border-gray-300 text-xs">
                    {(['absolute', 'manual'] as const).map((m, i) => (
                      <button key={m} type="button" onClick={() => setCatMode(m)}
                        className={`px-2.5 py-1 capitalize ${i > 0 ? 'border-l border-gray-300' : ''} ${catMode === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {catMode === 'absolute' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 text-xs">Drift ±</span>
                      <input type="number" min={0} max={100} step={1} value={catDrift}
                        onChange={(e) => setCatDrift(e.target.value)}
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none" />
                      <span className="text-xs text-gray-400">pp</span>
                    </div>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0f2d4d] text-white">
                    <th className="px-3 py-2 text-left font-semibold rounded-tl-md">Category</th>
                    <th className="w-24 px-3 py-2 text-center font-semibold">Lower</th>
                    <th className="w-24 px-3 py-2 text-center font-semibold">Target</th>
                    <th className="w-24 px-3 py-2 text-center font-semibold rounded-tr-md">Upper</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {([
                    { label: 'Equity',       targetKey: 'equityTarget' as const,      lowerKey: 'equityLower' as const,      upperKey: 'equityUpper' as const },
                    { label: 'Fixed Income', targetKey: 'fixedIncomeTarget' as const, lowerKey: 'fixedIncomeLower' as const, upperKey: 'fixedIncomeUpper' as const },
                  ]).map(({ label, targetKey, lowerKey, upperKey }) => {
                    const target = n(catTargets[targetKey])
                    const cd = n(catDrift)
                    const computedLower = cd > 0 ? Math.max(0, target - cd) : null
                    const computedUpper = cd > 0 ? Math.min(99, target + cd) : null
                    const inpClass = 'w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none'
                    return (
                      <tr key={label} className="bg-gray-50 even:bg-white">
                        <td className="px-3 py-1.5 font-medium text-gray-800">{label}</td>
                        <td className="px-2 py-1.5">
                          {catMode === 'manual' ? (
                            <div className="flex items-center justify-center gap-1">
                              <input type="number" min={0} max={100} step={0.1} value={catManualLimits[lowerKey]}
                                onChange={(e) => setCatManualLimits((p) => ({ ...p, [lowerKey]: e.target.value }))}
                                className={inpClass} />
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                          ) : (
                            <p className="text-center text-sm text-gray-500 tabular-nums">
                              {computedLower != null ? `${computedLower.toFixed(1)}%` : '—'}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" min={0} max={100} step={0.1}
                              value={catTargets[targetKey]}
                              onChange={(e) => setCatTargets((p) => ({ ...p, [targetKey]: e.target.value }))}
                              className={inpClass} />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {catMode === 'manual' ? (
                            <div className="flex items-center justify-center gap-1">
                              <input type="number" min={0} max={100} step={0.1} value={catManualLimits[upperKey]}
                                onChange={(e) => setCatManualLimits((p) => ({ ...p, [upperKey]: e.target.value }))}
                                className={inpClass} />
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                          ) : (
                            <p className="text-center text-sm text-gray-500 tabular-nums">
                              {computedUpper != null ? `${computedUpper.toFixed(1)}%` : '—'}
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Cash — explicit lower/target/upper */}
                  <tr className="bg-blue-50">
                    <td className="px-3 py-1.5 font-medium text-gray-800">
                      Cash
                      <span className="ml-1.5 text-xs font-normal text-blue-500">explicit</span>
                    </td>
                    {(['lower', 'target', 'upper'] as const).map((field) => (
                      <td key={field} className="px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <input type="number" min={0} max={100} step={0.1}
                            value={cash[field]}
                            onChange={(e) => setCashField(field, e.target.value)}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none" />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Asset Class Allocations ──────────────────────────────────── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Asset Class Allocations</p>
                <div className="flex items-center gap-2">
                  <div className="flex overflow-hidden rounded border border-gray-300 text-xs">
                    {(['relative', 'manual'] as const).map((m, i) => (
                      <button key={m} type="button" onClick={() => setAcMode(m)}
                        className={`px-2.5 py-1 capitalize ${i > 0 ? 'border-l border-gray-300' : ''} ${acMode === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {acMode === 'relative' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 text-xs">Drift ±</span>
                      <input type="number" min={0} max={100} step={1} value={acDrift}
                        onChange={(e) => setAcDrift(e.target.value)}
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none" />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0f2d4d] text-white">
                    <th className="px-3 py-2 text-left font-semibold rounded-tl-md">Asset Class</th>
                    <th className="w-24 px-3 py-2 text-center font-semibold">Lower</th>
                    <th className="w-24 px-3 py-2 text-center font-semibold">Target</th>
                    <th className="w-24 px-3 py-2 text-center font-semibold rounded-tr-md">Upper</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ASSET_CLASS_ROWS.map(({ label, key }) => {
                    if (key === 'cash') {
                      // Cash synced from Category — read only
                      return (
                        <tr key={key} className="bg-blue-50">
                          <td className="px-3 py-1.5 font-medium text-gray-800">
                            {label}
                            <span className="ml-1.5 text-xs font-normal text-blue-500">← synced from Category</span>
                          </td>
                          <td className="px-3 py-1.5 text-center text-sm text-gray-500 tabular-nums">{cash.lower}%</td>
                          <td className="px-3 py-1.5 text-center text-sm text-gray-500 tabular-nums">{cash.target}%</td>
                          <td className="px-3 py-1.5 text-center text-sm text-gray-500 tabular-nums">{cash.upper}%</td>
                        </tr>
                      )
                    }
                    const target = n(acTargets[key])
                    const ad = n(acDrift)
                    const computedLower = ad > 0 ? applyDrift(target, ad).lower : null
                    const computedUpper = ad > 0 ? applyDrift(target, ad).upper : null
                    const inpClass = 'w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none'
                    return (
                      <tr key={key} className="bg-gray-50 even:bg-white">
                        <td className="px-3 py-1.5 font-medium text-gray-800">{label}</td>
                        <td className="px-2 py-1.5">
                          {acMode === 'manual' ? (
                            <div className="flex items-center justify-center gap-1">
                              <input type="number" min={0} max={100} step={0.1} value={acManualLimits[key].lower}
                                onChange={(e) => setAcManualLimit(key, 'lower', e.target.value)}
                                className={inpClass} />
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                          ) : (
                            <p className="text-center text-sm text-gray-500 tabular-nums">
                              {computedLower != null ? `${computedLower.toFixed(1)}%` : '—'}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" min={0} max={100} step={0.1}
                              value={acTargets[key]}
                              onChange={(e) => setAcTargets((p) => ({ ...p, [key]: e.target.value }))}
                              className={inpClass} />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {acMode === 'manual' ? (
                            <div className="flex items-center justify-center gap-1">
                              <input type="number" min={0} max={100} step={0.1} value={acManualLimits[key].upper}
                                onChange={(e) => setAcManualLimit(key, 'upper', e.target.value)}
                                className={inpClass} />
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                          ) : (
                            <p className="text-center text-sm text-gray-500 tabular-nums">
                              {computedUpper != null ? `${computedUpper.toFixed(1)}%` : '—'}
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-300">
                  {(() => {
                    const totalTarget = ASSET_CLASS_ROWS.reduce(
                      (sum, { key }) => sum + (key === 'cash' ? n(cash.target) : n(acTargets[key])), 0
                    )
                    const off = Math.abs(totalTarget - 100) >= 0.05
                    return (
                      <tr className="bg-gray-50">
                        <td className="px-3 py-2 text-sm font-semibold text-gray-900">Total</td>
                        <td />
                        <td className="px-3 py-2 text-center text-sm font-semibold tabular-nums">
                          <span className={off ? 'text-amber-600' : 'text-gray-900'}>
                            {totalTarget.toFixed(1)}%
                          </span>
                        </td>
                        <td />
                      </tr>
                    )
                  })()}
                </tfoot>
              </table>
            </div>

            {/* ── Position Drift ───────────────────────────────────────────── */}
            <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm font-medium text-gray-700">Position Drift ±</span>
              <input type="number" min={0} max={100} step={1} value={posDrift}
                onChange={(e) => setPosDrift(e.target.value)}
                className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none" />
              <span className="text-sm text-gray-400">%</span>
              <span className="ml-1 text-xs text-gray-400">Applied ± to each position's target weight</span>
            </div>

            {error && (
              <p className="text-sm text-red-600">
                {error instanceof Error ? error.message : 'Something went wrong'}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
            <button type="button" onClick={onCancel} disabled={isPending}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ModelPortfoliosPage() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ModelPortfolio | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: models = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchModelPortfolios,
  })

  const { data: benchmarkOptions = [] } = useQuery({
    queryKey: ['model-portfolio-benchmark-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('model_portfolio_benchmarks')
        .select('security_name')
        .order('security_name', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => r.security_name as string).filter(Boolean)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const createMutation = useMutation({
    mutationFn: createModelPortfolio,
    onSuccess: () => { invalidate(); setCreating(false) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<ModelPortfolioInput> }) =>
      updateModelPortfolio(id, input),
    onSuccess: () => { invalidate(); setEditing(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteModelPortfolio,
    onSuccess: () => { invalidate(); setConfirmDeleteId(null) },
  })

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Model Portfolios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define asset class allocations and parameters for each model portfolio.
          </p>
        </div>
        <button onClick={() => setCreating(true)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          + New Model Portfolio
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : models.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No model portfolios yet. Click "New Model Portfolio" to add one.</p>
        </div>
      ) : (() => {
        const BENCHMARK_ORDER = [
          'Conservative Benchmark (ETF)',
          'Conservative Balanced Benchmark (ETF)',
          'Balanced Benchmark (ETF)',
          'Balanced w/ Growth Benchmark (ETF)',
          'Growth Benchmark (ETF)',
        ]
        const sortedModels = [...models].sort((a, b) => {
          const ai = BENCHMARK_ORDER.indexOf(a.benchmark ?? '')
          const bi = BENCHMARK_ORDER.indexOf(b.benchmark ?? '')
          if (ai === -1 && bi === -1) return 0
          if (ai === -1) return 1
          if (bi === -1) return -1
          return ai - bi
        })

        const renderCard = (mp: ModelPortfolio) => (
            <div key={mp.id} className="rounded-lg border border-gray-200 bg-white">
              {/* Header row */}
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === mp.id ? null : mp.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <svg
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expandedId === mp.id ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {mp.name || <span className="text-gray-400 font-normal italic">Untitled</span>}
                    </p>
                    <p className="text-xs text-gray-500">Investment Objective: {mp.investment_objective ?? '—'}</p>
                    <p className="text-xs text-gray-500">Risk Profile: {mp.risk_profile ?? '—'}</p>
                    <p className="text-xs text-gray-500">Benchmark: {mp.benchmark ?? '—'}</p>
                    <p className="text-xs text-gray-500">Rebalance Frequency: {mp.rebalance_frequency ?? '—'}</p>
                    <p className="text-xs text-gray-500">Review Frequency: {mp.review_frequency ?? '—'}</p>
                  </div>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setEditing(mp)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    Edit
                  </button>
                  <button onClick={() => setConfirmDeleteId(mp.id)}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                    Delete
                  </button>
                </div>
              </div>

              {/* Expanded allocation table */}
              {expandedId === mp.id && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-3">
                  {mp.description && (
                    <p className="mb-3 text-sm text-gray-600">{mp.description}</p>
                  )}

                  {/* Asset Allocation — stored values */}
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Asset Allocation</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#0f2d4d] text-white">
                          <th className="px-3 py-2 text-left font-semibold rounded-tl-md">Category</th>
                          <th className="w-24 px-3 py-2 text-center font-semibold">Lower</th>
                          <th className="w-24 px-3 py-2 text-center font-semibold">Target</th>
                          <th className="w-24 px-3 py-2 text-center font-semibold rounded-tr-md">Upper</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">Equity</td>
                          <td className="px-3 py-2 text-center text-gray-600">{pct(mp.equity_lower_limit)}</td>
                          <td className="px-3 py-2 text-center font-semibold text-gray-900">{pct(mp.equity_target)}</td>
                          <td className="px-3 py-2 text-center text-gray-600">{pct(mp.equity_upper_limit)}</td>
                        </tr>
                        <tr className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">Fixed Income</td>
                          <td className="px-3 py-2 text-center text-gray-600">{pct(mp.fixed_income_lower_limit)}</td>
                          <td className="px-3 py-2 text-center font-semibold text-gray-900">{pct(mp.fixed_income_target)}</td>
                          <td className="px-3 py-2 text-center text-gray-600">{pct(mp.fixed_income_upper_limit)}</td>
                        </tr>
                        <tr className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">Cash</td>
                          <td className="px-3 py-2 text-center text-gray-600">{pct(mp.cash_lower_limit)}</td>
                          <td className="px-3 py-2 text-center font-semibold text-gray-900">{pct(mp.cash_target)}</td>
                          <td className="px-3 py-2 text-center text-gray-600">{pct(mp.cash_upper_limit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Asset Class</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#0f2d4d] text-white">
                        <th className="px-3 py-2 text-left font-semibold rounded-tl-md">Asset Class</th>
                        <th className="w-24 px-3 py-2 text-center font-semibold">Lower</th>
                        <th className="w-24 px-3 py-2 text-center font-semibold">Target</th>
                        <th className="w-24 px-3 py-2 text-center font-semibold rounded-tr-md">Upper</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ASSET_CLASS_ROWS.map(({ label, key }) => {
                        const lower  = (mp as unknown as Record<string, unknown>)[`${key}_lower_limit`] as number | null
                        const target = (mp as unknown as Record<string, unknown>)[`${key}_target`]      as number | null
                        const upper  = (mp as unknown as Record<string, unknown>)[`${key}_upper_limit`] as number | null
                        if (!target && !upper) return null
                        return (
                          <tr key={key} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800">{label}</td>
                            <td className="px-3 py-2 text-center text-gray-600">{pct(lower)}</td>
                            <td className="px-3 py-2 text-center font-semibold text-gray-900">{pct(target)}</td>
                            <td className="px-3 py-2 text-center text-gray-600">{pct(upper)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Delete confirmation */}
              {confirmDeleteId === mp.id && (
                <div className="border-t border-red-100 bg-red-50 px-5 py-3">
                  <p className="text-sm font-medium text-red-700">Delete this model portfolio?</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => deleteMutation.mutate(mp.id)} disabled={deleteMutation.isPending}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                      {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )

        return (
          <div className="space-y-3">
            {sortedModels.map((mp) => <div key={mp.id}>{renderCard(mp)}</div>)}
          </div>
        )
      })()}

      {creating && (
        <ModelPortfolioModal
          models={models}
          benchmarkOptions={benchmarkOptions}
          onSave={(input) => createMutation.mutate(input)}
          onCancel={() => setCreating(false)}
          isPending={createMutation.isPending}
          error={createMutation.error as Error | null}
        />
      )}

      {editing && (
        <ModelPortfolioModal
          initial={editing}
          models={models}
          benchmarkOptions={benchmarkOptions}
          onSave={(input) => updateMutation.mutate({ id: editing.id, input })}
          onCancel={() => setEditing(null)}
          isPending={updateMutation.isPending}
          error={updateMutation.error as Error | null}
        />
      )}
    </div>
  )
}
