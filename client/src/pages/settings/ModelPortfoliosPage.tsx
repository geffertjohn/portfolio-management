import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchModelPortfolios,
  createModelPortfolio,
  deleteModelPortfolio,
  groupModelsByFamily,
  ASSET_CLASS_ROWS,
} from '@/lib/modelPortfolios'
import type { ModelPortfolio } from '@/lib/modelPortfolios'
import { fetchModelPortfolioBenchmarkOptions } from '@/lib/benchmarks'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { ModelPortfolioModal } from './ModelPortfolioModal'

function pct(v: number | null) {
  return v != null ? `${v.toFixed(1)}%` : '—'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ModelPortfoliosPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: models = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolios,
    queryFn: fetchModelPortfolios,
  })

  const { data: benchmarkOptions = [] } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolioBenchmarkOptions,
    queryFn: fetchModelPortfolioBenchmarkOptions,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.modelPortfolios })

  const createMutation = useMutation({
    mutationFn: createModelPortfolio,
    onSuccess: () => { invalidate(); setCreating(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteModelPortfolio,
    onSuccess: () => { invalidate(); setConfirmDeleteId(null) },
  })

  return (
    <div className="mx-auto max-w-7xl">
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
                    {/* A label/value grid rather than four "Label: Value" lines —
                        in a third-width column the long labels pushed every
                        value onto a second line, so a four-fact card ran to
                        eight. The labels are shortened for the same reason; the
                        VALUES are never abbreviated, since those are the facts. */}
                    <dl className="mt-1 space-y-0.5 text-xs leading-snug">
                      {([
                        ['Objective', mp.investment_objective],
                        ['Risk',      mp.risk_profile],
                        ['Benchmark', mp.benchmark],
                        ['Rebalance', mp.rebalance_frequency],
                      ] as [string, string | null][]).map(([label, value]) => (
                        <div key={label} className="flex gap-1.5">
                          <dt className="w-16 shrink-0 text-gray-400">{label}</dt>
                          <dd className="min-w-0 text-gray-600">{value ?? '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => navigate(`/settings/model-portfolios/${mp.id}/edit`)}
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
                  {/* The narrative moved off `description` onto `objective_statement`
                      in Nov 2026, so read that first. The fallback is kept for a
                      legacy row the migration did not reach — nothing writes a
                      description now, but a blank card here would read as a model
                      with no narrative at all. */}
                  {(mp.objective_statement ?? mp.description) && (
                    <p className="mb-3 text-sm text-gray-600">{mp.objective_statement ?? mp.description}</p>
                  )}

                  {/* Asset Allocation — stored values */}
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Asset Allocation</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#0f2d4d] text-white">
                          <th className="px-2 py-1.5 text-left font-semibold rounded-tl-md">Category</th>
                          <th className="w-14 px-2 py-1.5 text-center font-semibold">Lower</th>
                          <th className="w-14 px-2 py-1.5 text-center font-semibold">Target</th>
                          <th className="w-14 px-2 py-1.5 text-center font-semibold rounded-tr-md">Upper</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 font-medium text-gray-900">Equity</td>
                          <td className="px-2 py-1.5 text-center text-gray-600">{pct(mp.equity_lower_limit)}</td>
                          <td className="px-2 py-1.5 text-center font-semibold text-gray-900">{pct(mp.equity_target)}</td>
                          <td className="px-2 py-1.5 text-center text-gray-600">{pct(mp.equity_upper_limit)}</td>
                        </tr>
                        <tr className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 font-medium text-gray-900">Fixed Income</td>
                          <td className="px-2 py-1.5 text-center text-gray-600">{pct(mp.fixed_income_lower_limit)}</td>
                          <td className="px-2 py-1.5 text-center font-semibold text-gray-900">{pct(mp.fixed_income_target)}</td>
                          <td className="px-2 py-1.5 text-center text-gray-600">{pct(mp.fixed_income_upper_limit)}</td>
                        </tr>
                        <tr className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 font-medium text-gray-900">Cash</td>
                          <td className="px-2 py-1.5 text-center text-gray-600">{pct(mp.cash_lower_limit)}</td>
                          <td className="px-2 py-1.5 text-center font-semibold text-gray-900">{pct(mp.cash_target)}</td>
                          <td className="px-2 py-1.5 text-center text-gray-600">{pct(mp.cash_upper_limit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Asset Class</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#0f2d4d] text-white">
                        <th className="px-2 py-1.5 text-left font-semibold rounded-tl-md">Asset Class</th>
                        <th className="w-14 px-2 py-1.5 text-center font-semibold">Lower</th>
                        <th className="w-14 px-2 py-1.5 text-center font-semibold">Target</th>
                        <th className="w-14 px-2 py-1.5 text-center font-semibold rounded-tr-md">Upper</th>
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
                            <td className="px-2 py-1.5 text-gray-800">{label}</td>
                            <td className="px-2 py-1.5 text-center text-gray-600">{pct(lower)}</td>
                            <td className="px-2 py-1.5 text-center font-semibold text-gray-900">{pct(target)}</td>
                            <td className="px-2 py-1.5 text-center text-gray-600">{pct(upper)}</td>
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

        /* THREE COLUMNS — Foundation / Fund / Strategy. The families differ in
           how many books a model runs, which is what a reader needs to know
           before editing one: a Fund model is SHARED by an ETF book and a
           Hybrid book, so an edit there lands in two places, while every
           Foundation and Strategy model runs exactly one. A flat list of
           fourteen said none of that.

           `groupModelsByFamily` returns all three families whether or not they
           hold anything — an empty column and a dropped column look identical
           to a reader, and only one of them is a fact about the book. */
        return (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {groupModelsByFamily(models).map((family) => (
              <section key={family.key} className="min-w-0">
                <div className="mb-3 border-b border-gray-200 pb-2">
                  <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
                    {family.label}
                    <span className="text-xs font-normal normal-case tracking-normal text-gray-400">
                      {family.models.length}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-400">{family.blurb}</p>
                </div>
                {family.models.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-xs text-gray-400">
                    No models in this family.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {family.models.map((mp) => renderCard(mp))}
                  </div>
                )}
              </section>
            ))}
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

    </div>
  )
}
