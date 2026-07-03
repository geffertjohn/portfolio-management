import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ASSET_CLASS_ROWS, SECTOR_ROWS, hasSectorAllocations, EQUITY_MODEL_HIDDEN_ASSET_CLASSES } from '@/lib/modelPortfolios'
import type { ModelPortfolio, ModelPortfolioInput, SectorAllocations } from '@/lib/modelPortfolios'
import { fetchSp500SectorWeights } from '@/lib/fmpMarket'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'

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
  /** Render as an inline page (no modal overlay). Used by EditModelPortfolioPage. */
  asPage?: boolean
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

export function ModelPortfolioModal({ initial, models, benchmarkOptions, onSave, onCancel, isPending, error, asPage }: ModalProps) {
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
  const [objectiveStatement,   setObjectiveStatement]   = useState(initial?.objective_statement ?? '')
  const [investmentPhilosophy, setInvestmentPhilosophy] = useState(initial?.investment_philosophy ?? '')

  // Independent drift % per level
  const [catDrift,    setCatDrift]    = useState(String(initial?.category_drift_percentage    ?? 20))
  const [acDrift,     setAcDrift]     = useState(String(initial?.asset_class_drift_percentage ?? 20))
  const [posDrift,    setPosDrift]    = useState(String(initial?.drift_percentage              ?? 20))

  // Conviction-tier target weight bands (position-sizing for annual reviews)
  const [tiers, setTiers] = useState({
    t1l: String(initial?.tier1_lower ?? 5), t1u: String(initial?.tier1_upper ?? 7),
    t2l: String(initial?.tier2_lower ?? 3), t2u: String(initial?.tier2_upper ?? 5),
    t3l: String(initial?.tier3_lower ?? 1), t3u: String(initial?.tier3_upper ?? 3),
    t4l: String(initial?.tier4_lower ?? 0), t4u: String(initial?.tier4_upper ?? 1),
  })
  const setTier = (k: keyof typeof tiers, v: string) => setTiers((p) => ({ ...p, [k]: v }))

  // Per-sector target weight bands — only shown for the all-equity stock models.
  const showSectors = hasSectorAllocations(initial?.name)
  // Those same models hide the international / fixed-income asset-class rows.
  const visibleAssetClassRows = showSectors
    ? ASSET_CLASS_ROWS.filter((r) => !EQUITY_MODEL_HIDDEN_ASSET_CLASSES.has(r.key))
    : ASSET_CLASS_ROWS
  type SectorDraft = Record<string, { lower: string; target: string; upper: string }>
  const [sectors, setSectors] = useState<SectorDraft>(() => {
    const src = (initial?.sector_allocations ?? {}) as SectorAllocations
    const out: SectorDraft = {}
    for (const { key } of SECTOR_ROWS) {
      const b = src[key]
      out[key] = { lower: String(b?.lower ?? 0), target: String(b?.target ?? 0), upper: String(b?.upper ?? 0) }
    }
    return out
  })
  const setSectorField = (key: string, field: 'lower' | 'target' | 'upper', v: string) =>
    setSectors((p) => ({ ...p, [key]: { ...p[key], [field]: v } }))

  // Current S&P 500 sector weights (from FMP) — a read-only reference beside the targets.
  const { data: spyWeights = {} } = useQuery({
    queryKey: QUERY_KEYS.sp500SectorWeights,
    queryFn: fetchSp500SectorWeights,
    enabled: showSectors,
    staleTime: 1000 * 60 * 60 * 24, // index sector weights drift slowly
  })

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
      objective_statement:           objectiveStatement    || null,
      investment_philosophy:         investmentPhilosophy  || null,
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
      tier1_lower: n(tiers.t1l), tier1_upper: n(tiers.t1u),
      tier2_lower: n(tiers.t2l), tier2_upper: n(tiers.t2u),
      tier3_lower: n(tiers.t3l), tier3_upper: n(tiers.t3u),
      tier4_lower: n(tiers.t4l), tier4_upper: n(tiers.t4u),
      sector_allocations: showSectors
        ? Object.fromEntries(SECTOR_ROWS.map(({ key }) => [
            key,
            { lower: n(sectors[key].lower), target: n(sectors[key].target), upper: n(sectors[key].upper) },
          ])) as SectorAllocations
        : (initial?.sector_allocations ?? null),
      ...acPayload,
    } as ModelPortfolioInput)
  }

  // Position Drift + Conviction Tiers are laid out inline for the all-equity models
  // (left column, beside the taller Asset Class table) and after the grid otherwise.
  const positionDriftBlock = (
    <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
      <span className="text-sm font-medium text-gray-700">Position Drift ±</span>
      <input type="number" min={0} max={100} step={1} value={posDrift}
        onChange={(e) => setPosDrift(e.target.value)}
        className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none" />
      <span className="text-sm text-gray-400">%</span>
      <span className="ml-1 text-xs text-gray-400">Applied ± to each position's target weight</span>
    </div>
  )
  const convictionTiersBlock = (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Conviction Tiers</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#0f2d4d] text-white">
            <th className="px-3 py-2 text-left font-semibold rounded-tl-md">Tier</th>
            <th className="px-3 py-2 text-left font-semibold">Meaning</th>
            <th className="w-24 px-3 py-2 text-center font-semibold">Lower</th>
            <th className="w-24 px-3 py-2 text-center font-semibold rounded-tr-md">Upper</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {([
            { t: 'Tier 1', meaning: 'Best ideas; core holdings',  lk: 't1l' as const, uk: 't1u' as const },
            { t: 'Tier 2', meaning: 'Solid holdings; normal',     lk: 't2l' as const, uk: 't2u' as const },
            { t: 'Tier 3', meaning: 'Lower conviction; smaller',  lk: 't3l' as const, uk: 't3u' as const },
            { t: 'Tier 4', meaning: 'Replace / exit candidates',  lk: 't4l' as const, uk: 't4u' as const },
          ]).map(({ t, meaning, lk, uk }) => {
            const inpClass = 'w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none'
            return (
              <tr key={t} className="bg-gray-50 even:bg-white">
                <td className="px-3 py-1.5 font-medium text-gray-800">{t}</td>
                <td className="px-3 py-1.5 text-xs text-gray-500">{meaning}</td>
                {([lk, uk] as const).map((k) => (
                  <td key={k} className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <input type="number" min={0} max={100} step={0.5} value={tiers[k]}
                        onChange={(e) => setTier(k, e.target.value)} className={inpClass} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-gray-400">Target weight bands used by the annual conviction-ranking review.</p>
    </div>
  )

  const panel = (
      <div className={`w-full rounded-lg border border-gray-200 bg-white ${asPage ? 'shadow-sm' : 'max-w-2xl shadow-xl'}`}>
        <form onSubmit={handleSubmit}>
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {initial ? 'Edit Model Portfolio' : 'New Model Portfolio'}
            </h2>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className={`grid gap-4 ${asPage ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2'}`}>
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
              <div className={asPage ? 'md:col-span-3' : 'col-span-2'}>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <AutoGrowTextarea value={description} onChange={setDescription} maxHeightPx={160}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none overflow-hidden leading-relaxed min-h-[4.5rem]" />
              </div>

              {(initial?.id ?? 0) >= 10 && (
                <>
                  <div className={asPage ? 'md:col-span-3' : 'col-span-2'}>
                    <label className="block text-sm font-medium text-gray-700">Objective</label>
                    <p className="mt-0.5 text-xs text-gray-400">Narrative objective shown on the portfolio Overview.</p>
                    <AutoGrowTextarea value={objectiveStatement} onChange={setObjectiveStatement} maxHeightPx={120}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none overflow-hidden leading-relaxed min-h-[3rem]" />
                  </div>
                  <div className={asPage ? 'md:col-span-3' : 'col-span-2'}>
                    <label className="block text-sm font-medium text-gray-700">Investment Philosophy</label>
                    <p className="mt-0.5 text-xs text-gray-400">Income / stability / growth criteria + strategy shown on the portfolio Overview.</p>
                    <AutoGrowTextarea value={investmentPhilosophy} onChange={setInvestmentPhilosophy} maxHeightPx={260}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none leading-relaxed min-h-[8rem]" />
                  </div>
                </>
              )}
            </div>

            <div className={asPage ? 'grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start' : 'space-y-5'}>
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
              {/* All-equity models: tuck Drift + Conviction Tiers under the short
                  Category table so the left column fills beside Asset Class. */}
              {showSectors && (
                <div className="mt-5 space-y-5">
                  {positionDriftBlock}
                  {convictionTiersBlock}
                </div>
              )}
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
                  {visibleAssetClassRows.map(({ label, key }) => {
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
                    const totalTarget = visibleAssetClassRows.reduce(
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
            </div>

            {/* Non-equity models keep Drift + Conviction Tiers full-width below the grid. */}
            {!showSectors && (
              <>
                {positionDriftBlock}
                {convictionTiersBlock}
              </>
            )}

            {/* ── Sector Allocation (all-equity stock models only) ─────────── */}
            {showSectors && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sector Allocation</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0f2d4d] text-white">
                      <th className="px-3 py-2 text-left font-semibold rounded-tl-md">Sector</th>
                      <th className="w-24 px-3 py-2 text-center font-semibold">S&amp;P 500</th>
                      <th className="w-24 px-3 py-2 text-center font-semibold">Lower</th>
                      <th className="w-24 px-3 py-2 text-center font-semibold">Target</th>
                      <th className="w-24 px-3 py-2 text-center font-semibold rounded-tr-md">Upper</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {SECTOR_ROWS.map(({ label, key }) => {
                      const inpClass = 'w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none'
                      const spy = spyWeights[key]
                      return (
                        <tr key={key} className="bg-gray-50 even:bg-white">
                          <td className="px-3 py-1.5 font-medium text-gray-800">{label}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-gray-500">
                            {spy != null ? `${spy.toFixed(1)}%` : '—'}
                          </td>
                          {(['lower', 'target', 'upper'] as const).map((f) => (
                            <td key={f} className="px-2 py-1.5">
                              <div className="flex items-center justify-center gap-1">
                                <input type="number" min={0} max={100} step={0.5} value={sectors[key][f]}
                                  onChange={(e) => setSectorField(key, f, e.target.value)} className={inpClass} />
                                <span className="text-xs text-gray-400">%</span>
                              </div>
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="px-3 py-1.5 text-gray-800">Total</td>
                      <td className="px-3 py-1.5 text-center tabular-nums text-gray-500">
                        {SECTOR_ROWS.reduce((s, { key }) => s + (spyWeights[key] ?? 0), 0).toFixed(1)}%
                      </td>
                      <td />
                      <td className="px-3 py-1.5 text-center text-gray-800">
                        {SECTOR_ROWS.reduce((s, { key }) => s + n(sectors[key].target), 0).toFixed(1)}%
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1 text-xs text-gray-400">Target sector weights across the 11 S&amp;P 500 sectors.</p>
              </div>
            )}

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
  )

  return asPage ? panel : (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
      {panel}
    </div>
  )
}
