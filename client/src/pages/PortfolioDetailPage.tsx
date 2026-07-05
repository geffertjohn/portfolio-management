import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AddPositionModal } from '@/components/AddPositionModal'
import { EditPositionModal } from '@/components/EditPositionModal'
import { RebalancingPanel } from '@/components/RebalancingPanel'
import { HoldingsChangeLog } from '@/components/HoldingsChangeLog'
import { TradeSuitabilityLog } from '@/components/TradeSuitabilityLog'
import { PortfolioReviewsPanel } from '@/components/PortfolioReviewsPanel'
import { CandidatesPanel } from '@/components/CandidatesPanel'
import { PortfolioRiskPanel } from '@/components/PortfolioRiskPanel'
import { PortfolioNarrative } from '@/components/PortfolioNarrative'
import { DocumentsFolderPanel } from '@/components/DocumentsFolderPanel'
import { PORTFOLIO_DOCS_BUCKET } from '@/lib/documents'
import { PortfolioOverview } from '@/components/PortfolioOverview'
import { DetailPageState } from '@/components/DetailPageState'
import { PortfolioPerformancePanel } from '@/components/PortfolioPerformancePanel'
import { AllocationHistoryPanel } from '@/components/AllocationHistoryPanel'
import { usePortfolio, usePositions, useLatestActualAllocation } from '@/hooks/usePortfolio'
import { updatePortfolioObjective } from '@/lib/portfolio'
import { updatePositionBands } from '@/lib/positions'
import { isCashTicker } from '@/lib/positionBands'
import { fetchModelPortfolios, fetchModelPortfolioByObjective, fetchDirectModelPortfolioId, fetchModelPortfolioById } from '@/lib/modelPortfolios'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { PortfolioPosition } from '@/types/position'

type PortfolioTab = 'overview' | 'allocation' | 'reviews' | 'documents'
type AllocationSubTab = 'positions' | 'history' | 'change_log' | 'candidates'
type ChangeLogView = 'changelog' | 'rebalance' | 'suitability'

export function PortfolioDetailPage() {
  const { portfolioId } = useParams<{ portfolioId: string }>()
  const id = portfolioId ? decodeURIComponent(portfolioId) : ''

  const { data: portfolio, isLoading, error } = usePortfolio(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<PortfolioTab>('overview')
  const [allocationSubTab, setAllocationSubTab] = useState<AllocationSubTab>('positions')
  const [editingObjective, setEditingObjective] = useState(false)
  const [pendingObjective, setPendingObjective] = useState('')
  const [addPositionOpen, setAddPositionOpen] = useState(false)
  const [changeLogView, setChangeLogView] = useState<ChangeLogView>('changelog')
  const [editPosition, setEditPosition] = useState<PortfolioPosition | null>(null)
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  type DraftBands = Record<string, { lower: string; target: string; upper: string }>
  const [draftBands, setDraftBands] = useState<DraftBands>({})

  const { data: modelPortfolios = [] } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolios,
    queryFn: fetchModelPortfolios,
  })

  const securityId = portfolio?.security_id ?? ''

  const { data: mappedModelPortfolioId } = useQuery({
    queryKey: QUERY_KEYS.directModelPortfolioId(securityId),
    queryFn: () => fetchDirectModelPortfolioId(securityId),
    enabled: !!securityId,
  })

  const { data: mappedModelPortfolio } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolioById(mappedModelPortfolioId ?? 0),
    queryFn: () => fetchModelPortfolioById(mappedModelPortfolioId ?? 0),
    enabled: mappedModelPortfolioId != null,
  })

  // Fallback: portfolios not yet in portfolio_model_map use investment_objective
  const { data: objectiveModelPortfolio } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolioByObjective(portfolio?.investment_objective ?? ''),
    queryFn: () => fetchModelPortfolioByObjective(portfolio!.investment_objective!),
    enabled: mappedModelPortfolioId == null && !!portfolio?.investment_objective,
  })

  const modelPortfolio = mappedModelPortfolio ?? objectiveModelPortfolio ?? null

  const isEquityStrategy = portfolio?.portfolio_strategy === 'Equity'
  const isFixedIncomeStrategy = portfolio?.portfolio_strategy === 'Fixed Income'
  const isReadOnlyObjective = mappedModelPortfolioId != null || isEquityStrategy || isFixedIncomeStrategy
  const displayInvestmentObjective = isEquityStrategy
    ? 'Aggressive Growth'
    : (modelPortfolio?.investment_objective || portfolio?.investment_objective || '—')
  const displayRiskProfile = isEquityStrategy
    ? 'High'
    : (modelPortfolio?.risk_profile || null)

  const driftPct = modelPortfolio?.drift_percentage ?? null

  function roundToHalf(v: number) { return Math.round(v / 0.5) * 0.5 }
  function driftLower(target: number) { return driftPct != null ? roundToHalf(target * (1 - driftPct / 100)) : null }
  function driftUpper(target: number) { return driftPct != null ? roundToHalf(target * (1 + driftPct / 100)) : null }

  const objectiveMutation = useMutation({
    mutationFn: async (objective: string) => {
      const model = modelPortfolios.find((m) => m.investment_objective === objective)
      await updatePortfolioObjective(
        id,
        objective || null,
        model?.description ?? null,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.portfolio(id) })
      setEditingObjective(false)
    },
  })

  const {
    data: positions = [],
    isLoading: positionsLoading,
    error: positionsError,
  } = usePositions(id, !!portfolio)

  // Most recent actual allocation (from the latest monthly file in Documents).
  const { data: currentAllocation } = useLatestActualAllocation(id, !!portfolio)

  /** Actual weight (percent points) for a position, or null if not in the file.
   *  All cash-like file tickers (e.g. FDXCASH) collapse into the one cash position. */
  function actualWeightFor(securityId: string, ticker: string): number | null {
    if (!currentAllocation) return null
    const { weights } = currentAllocation
    if (isCashTicker(securityId) || isCashTicker(ticker)) {
      let cash: number | null = null
      for (const [k, v] of weights) if (isCashTicker(k)) cash = (cash ?? 0) + v
      return cash
    }
    return weights.get(securityId.toUpperCase()) ?? weights.get(ticker.toUpperCase()) ?? null
  }

  if (isLoading || error || !portfolio) {
    return (
      <DetailPageState
        backTo="/portfolio"
        backLabel="← Back to Portfolios"
        loading={isLoading}
        error={error}
        notFound={!portfolio}
        errorTitle="Failed to load portfolio"
        notFoundText="Portfolio not found."
      />
    )
  }

  return (
    <div>
      <Link
        to="/portfolio"
        className="inline-block text-sm text-gray-600 hover:text-gray-900"
      >
        ← Back to Portfolios
      </Link>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
              {portfolio.name}
            </h1>
            {portfolio.security_id && (
              <p className="mt-0.5 text-xs text-gray-400">{portfolio.security_id}</p>
            )}
          </div>

          {portfolio.updated_at && (
            <p className="text-xs text-gray-400 self-start mt-1">
              Last updated {new Date(portfolio.updated_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Investment Objective
            </dt>
            {!isReadOnlyObjective && editingObjective ? (
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={pendingObjective}
                  onChange={(e) => setPendingObjective(e.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="">— None —</option>
                  {modelPortfolios.filter((m) => m.id <= 5).map((m) => (
                    <option key={m.id} value={m.investment_objective ?? ''}>
                      {m.name || m.investment_objective}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => objectiveMutation.mutate(pendingObjective)}
                  disabled={objectiveMutation.isPending}
                  className="rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {objectiveMutation.isPending ? '…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingObjective(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <dd
                className={`mt-1 flex items-center gap-1 text-gray-900 ${!isReadOnlyObjective ? 'cursor-pointer hover:text-gray-600' : ''}`}
                onClick={() => {
                  if (isReadOnlyObjective) return
                  const stored = portfolio.investment_objective ?? ''
                  const resolved = modelPortfolios.find(
                    (m) => m.investment_objective === stored || m.name === stored
                  )?.investment_objective ?? stored
                  setPendingObjective(resolved)
                  setEditingObjective(true)
                }}
              >
                {displayInvestmentObjective}
                {!isReadOnlyObjective && (
                  <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                  </svg>
                )}
              </dd>
            )}
          </div>
          <div className="text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Risk profile
            </dt>
            <dd className="mt-1 text-gray-900">{displayRiskProfile ?? '—'}</dd>
          </div>
          <div className="text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Expense Ratio
            </dt>
            <dd className="mt-1 text-gray-900">
              {portfolio.expense_ratio != null
                ? `${(portfolio.expense_ratio * 100).toFixed(2)}%`
                : '—'}
            </dd>
          </div>
          <div className="text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Dividend Yield
            </dt>
            <dd className="mt-1 text-gray-900">
              {portfolio.dividend_yield != null
                ? `${(portfolio.dividend_yield * 100).toFixed(2)}%`
                : '—'}
            </dd>
          </div>
        </dl>

        <PortfolioNarrative
          description={
            ((mappedModelPortfolioId != null || (['ETF', 'Foundation', 'Hybrid'].includes(portfolio.portfolio_strategy) && !isEquityStrategy)) && modelPortfolio?.description)
              ? modelPortfolio.description
              : portfolio.description
          }
        />

        {/* Tab Bar */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <nav className="-mb-px flex gap-6 overflow-x-auto border-b border-gray-200 whitespace-nowrap">
            {([
              { id: 'overview',    label: 'Overview'    },
              { id: 'allocation',  label: 'Allocation'  },
              { id: 'reviews',    label: 'Reviews'     },
              { id: 'documents',  label: 'Documents'   },
            ] as { id: PortfolioTab; label: string }[]).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <PortfolioOverview
              portfolio={portfolio}
              overrideModelPortfolio={modelPortfolio}
            />
            <PortfolioPerformancePanel portfolioName={id} />
          </div>
        )}

        {/* Allocation Tab */}
        {tab === 'allocation' && <div className="mt-6">

          {/* Sub-tab bar */}
          <div className="mb-5 flex gap-4 border-b border-gray-200">
            {([
              { id: 'positions',  label: 'Positions'  },
              { id: 'history',    label: 'History'    },
              { id: 'change_log', label: 'Change Log' },
              { id: 'candidates', label: 'Candidates' },
            ] as { id: AllocationSubTab; label: string }[]).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setAllocationSubTab(st.id)}
                className={`pb-2.5 text-sm font-medium transition-colors border-b-2 ${
                  allocationSubTab === st.id
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Positions sub-tab */}
          {allocationSubTab === 'positions' && <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Positions
              </h2>
              {currentAllocation && (
                <p className="mt-0.5 text-xs text-gray-400">
                  Current allocation as of{' '}
                  {new Date(currentAllocation.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {bulkEditMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setBulkEditMode(false); setDraftBands({}) }}
                    disabled={bulkSaving}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={bulkSaving}
                    onClick={async () => {
                      setBulkSaving(true)
                      try {
                        await Promise.all(
                          positions.map((pos) => {
                            const draft = draftBands[pos.securityId]
                            if (!draft) return Promise.resolve()
                            const lower = draft.lower !== '' ? parseFloat(draft.lower) : null
                            const target = draft.target !== '' ? parseFloat(draft.target) : null
                            const upper = draft.upper !== '' ? parseFloat(draft.upper) : null
                            return updatePositionBands(id, pos.securityId, lower, target, upper)
                          })
                        )
                        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.positions(id) })
                        setBulkEditMode(false)
                        setDraftBands({})
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Failed to save position bands.')
                      } finally {
                        setBulkSaving(false)
                      }
                    }}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {bulkSaving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const init: DraftBands = {}
                      positions.forEach((p) => {
                        init[p.securityId] = {
                          lower: p.lowerLimit != null ? String(p.lowerLimit) : '',
                          target: p.targetWeight != null ? String(p.targetWeight) : '',
                          upper: p.upperLimit != null ? String(p.upperLimit) : '',
                        }
                      })
                      setDraftBands(init)
                      setBulkEditMode(true)
                    }}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPositionOpen(true)}
                    className="inline-flex items-center rounded-md border border-transparent bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Add position
                  </button>
                </>
              )}
            </div>
          </div>
          {positionsLoading ? (
            <p className="mt-2 text-sm text-gray-500">Loading positions…</p>
          ) : positionsError ? (
            <p className="mt-2 text-sm text-amber-700">
              Could not load positions. Ensure the positions and securities2
              tables exist in Supabase, and positions reference securities2.
            </p>
          ) : positions.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              No positions in this portfolio yet.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-semibold text-gray-900">Ticker</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold text-gray-900">Name</th>
                    {!bulkEditMode && currentAllocation && <th scope="col" className="px-4 py-2.5 font-semibold text-gray-900">Current</th>}
                    <th scope="col" className="px-4 py-2.5 font-semibold text-gray-900">Lower Limit</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold text-gray-900">Target</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold text-gray-900">Upper Limit</th>
                    {!bulkEditMode && <th scope="col" className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {positions.map((pos, index) => {
                    const draft = draftBands[pos.securityId]
                    return (
                      <tr
                        key={pos.securityId ? `security-${pos.securityId}` : `pos-${index}`}
                        role={!bulkEditMode && pos.numericId ? 'button' : undefined}
                        tabIndex={!bulkEditMode && pos.numericId ? 0 : undefined}
                        onClick={() =>
                          !bulkEditMode && pos.numericId &&
                          navigate(
                            `/security/${pos.numericId}?fromPortfolio=${encodeURIComponent(id)}`,
                            { state: { fromPortfolioId: id } },
                          )
                        }
                        onKeyDown={(e) => {
                          if (!bulkEditMode && pos.numericId && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault()
                            navigate(
                              `/security/${pos.numericId}?fromPortfolio=${encodeURIComponent(id)}`,
                              { state: { fromPortfolioId: id } },
                            )
                          }
                        }}
                        className={!bulkEditMode && pos.numericId ? 'group cursor-pointer hover:bg-gray-100 focus:bg-gray-100 focus:outline-none' : ''}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">{pos.ticker}</td>
                        <td className="px-4 py-2.5 text-gray-700">{pos.name ?? '—'}</td>

                        {bulkEditMode ? (
                          <>
                            {(['lower', 'target', 'upper'] as const).map((field) => (
                              <td key={field} className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number" min={0} max={100} step={0.1}
                                    value={draft?.[field] ?? ''}
                                    onChange={(e) =>
                                      setDraftBands((prev) => ({
                                        ...prev,
                                        [pos.securityId]: { ...prev[pos.securityId], [field]: e.target.value },
                                      }))
                                    }
                                    placeholder="—"
                                    className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none"
                                  />
                                  <span className="text-xs text-gray-400">%</span>
                                </div>
                              </td>
                            ))}
                          </>
                        ) : (
                          <>
                            {currentAllocation && (() => {
                              const actual = actualWeightFor(pos.securityId, pos.ticker)
                              if (actual == null)
                                return <td className="whitespace-nowrap px-4 py-2.5 text-gray-400">—</td>
                              const target = pos.targetWeight ?? pos.weight
                              const lower = pos.lowerLimit
                                ?? (isCashTicker(pos.securityId) ? modelPortfolio?.cash_lower_limit ?? null : driftLower(target))
                              const upper = pos.upperLimit
                                ?? (isCashTicker(pos.securityId) ? modelPortfolio?.cash_upper_limit ?? null : driftUpper(target))
                              const outOfBand =
                                (lower != null && actual < lower - 0.05) || (upper != null && actual > upper + 0.05)
                              return (
                                <td className={`whitespace-nowrap px-4 py-2.5 font-medium tabular-nums ${outOfBand ? 'text-amber-600' : 'text-gray-900'}`}>
                                  {actual.toFixed(1)}%
                                </td>
                              )
                            })()}
                            <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                              {(() => {
                                if (pos.lowerLimit != null) return `${pos.lowerLimit.toFixed(1)}%`
                                if (isCashTicker(pos.securityId) && modelPortfolio?.cash_lower_limit != null)
                                  return `${modelPortfolio.cash_lower_limit.toFixed(1)}%`
                                const target = pos.targetWeight ?? pos.weight
                                const val = driftLower(target)
                                return val != null ? `${val.toFixed(1)}%` : '—'
                              })()}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">
                              {pos.weight.toFixed(1)}%
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                              {(() => {
                                if (pos.upperLimit != null) return `${pos.upperLimit.toFixed(1)}%`
                                if (isCashTicker(pos.securityId) && modelPortfolio?.cash_upper_limit != null)
                                  return `${modelPortfolio.cash_upper_limit.toFixed(1)}%`
                                const target = pos.targetWeight ?? pos.weight
                                const val = driftUpper(target)
                                return val != null ? `${val.toFixed(1)}%` : '—'
                              })()}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditPosition(pos) }}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
                                aria-label={`Edit ${pos.ticker}`}
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                                </svg>
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                  <tr>
                    <td className="px-4 py-2.5 text-sm font-semibold text-gray-900">Total</td>
                    <td />
                    {!bulkEditMode && currentAllocation && (
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm font-semibold text-gray-900">
                        {positions.reduce((sum, p) => sum + (actualWeightFor(p.securityId, p.ticker) ?? 0), 0).toFixed(1)}%
                      </td>
                    )}
                    <td />
                    <td className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold ${
                      Math.abs(positions.reduce((sum, p) => sum + p.weight, 0) - 100) < 0.05
                        ? 'text-gray-900' : 'text-amber-600'
                    }`}>
                      {positions.reduce((sum, p) => sum + p.weight, 0).toFixed(1)}%
                    </td>
                    <td />
                    {!bulkEditMode && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          </> /* end positions sub-tab */}

          {/* History sub-tab — dated allocation snapshots */}
          {allocationSubTab === 'history' && (
            <AllocationHistoryPanel portfolioName={id} />
          )}

          {/* Change Log sub-tab — with sub-view dropdown */}
          {allocationSubTab === 'change_log' && (
            <div>
              <div className="flex items-center justify-between gap-4">
                <select
                  value={changeLogView}
                  onChange={(e) => setChangeLogView(e.target.value as ChangeLogView)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="changelog">Change Log</option>
                  <option value="rebalance">Rebalancing</option>
                  <option value="suitability">Suitability</option>
                </select>
                {changeLogView === 'suitability' && (
                  <p className="text-xs text-gray-400">Append-only · cannot be modified</p>
                )}
              </div>

              <div className="mt-4">
                {changeLogView === 'changelog' && <HoldingsChangeLog portfolioId={id} />}
                {changeLogView === 'rebalance' && <RebalancingPanel portfolioId={id} positions={positions} modelDriftPct={driftPct} />}
                {changeLogView === 'suitability' && <TradeSuitabilityLog portfolioId={id} />}
              </div>
            </div>
          )}

          {/* Candidates sub-tab */}
          {allocationSubTab === 'candidates' && (
            <CandidatesPanel portfolioId={id} />
          )}

        </div>} {/* end allocation tab */}

        {/* Reviews Tab */}
        {tab === 'reviews' && (
          <div className="mt-6 space-y-6">
            <PortfolioReviewsPanel portfolioId={id} />
            <PortfolioRiskPanel portfolioName={id} />
          </div>
        )}

        {tab === 'documents' && (
          <div className="mt-6">
            <DocumentsFolderPanel
              bucket={PORTFOLIO_DOCS_BUCKET}
              folder={id}
              scopeLabel={portfolio.name}
              emptyHint="Upload IPS, statements, compliance records, and other files here."
            />
          </div>
        )}

      </div>

      <AddPositionModal
        open={addPositionOpen}
        onClose={() => setAddPositionOpen(false)}
        portfolioId={id}
      />

      <EditPositionModal
        open={editPosition !== null}
        onClose={() => setEditPosition(null)}
        portfolioId={id}
        position={editPosition}
      />
    </div>
  )
}
