import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPortfoliosHoldingSecurity,
  updatePosition,
} from '@/lib/positions'
import { advanceSubstitutionStatus, type Substitution } from '@/lib/substitutions'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface ExecuteSwapModalProps {
  open: boolean
  onClose: () => void
  substitution: Substitution
  atRiskId: number
}

export function ExecuteSwapModal({
  open,
  onClose,
  substitution,
  atRiskId,
}: ExecuteSwapModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const incumbentSymbol = substitution.incumbent_symbol ?? ''
  const proposedSymbol = substitution.proposed_symbol ?? ''

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.portfoliosHoldingSecurity(incumbentSymbol),
    queryFn: () => fetchPortfoliosHoldingSecurity(incumbentSymbol),
    enabled: open && !!incumbentSymbol,
  })

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      d.showModal()
      // Pre-select all portfolios
      setSelected(new Set())
    } else {
      d.close()
    }
  }, [open])

  // Pre-select all once data loads
  useEffect(() => {
    if (holdings.length > 0) {
      setSelected(new Set(holdings.map((h) => h.portfolioId)))
    }
  }, [holdings])

  const swapMutation = useMutation({
    mutationFn: async () => {
      // Replace position in each selected portfolio
      await Promise.all(
        holdings
          .filter((h) => selected.has(h.portfolioId))
          .map((h) =>
            updatePosition(
              h.portfolioId,
              incumbentSymbol,
              proposedSymbol,
              h.weight,
            )
          )
      )
      // Mark substitution as swapped
      await advanceSubstitutionStatus(substitution.id, 'swapped')
    },
    onSuccess: () => {
      // Invalidate all affected portfolio positions + substitution list
      selected.forEach((pid) =>
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.positions(pid) })
      )
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.substitutions(atRiskId) })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.portfoliosHoldingSecurity(incumbentSymbol),
      })
      onClose()
    },
  })

  const handleClose = () => { if (!swapMutation.isPending) onClose() }
  const togglePortfolio = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-900">Execute Swap</h2>
        <p className="mt-1 text-sm text-gray-500">
          Replace{' '}
          <strong>{substitution.incumbent_symbol ?? `Security #${substitution.incumbent_security_id}`}</strong>
          {' '}with{' '}
          <strong>{substitution.proposed_symbol ?? `Security #${substitution.proposed_security_id}`}</strong>
          {' '}in the selected portfolios. The existing weight will be preserved.
        </p>

        <div className="mt-5">
          <p className="text-sm font-medium text-gray-700">
            Portfolios holding {substitution.incumbent_symbol}
          </p>

          {isLoading ? (
            <p className="mt-3 text-sm text-gray-500">Loading portfolios…</p>
          ) : holdings.length === 0 ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800">
                No portfolios currently hold {substitution.incumbent_symbol}.
                The swap can still be recorded as completed.
              </p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
              {holdings.map((h) => (
                <li key={h.portfolioId} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    id={`swap-portfolio-${h.portfolioId}`}
                    checked={selected.has(h.portfolioId)}
                    onChange={() => togglePortfolio(h.portfolioId)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  />
                  <label
                    htmlFor={`swap-portfolio-${h.portfolioId}`}
                    className="flex-1 cursor-pointer text-sm text-gray-900"
                  >
                    {h.portfolioName}
                  </label>
                  <span className="text-xs text-gray-500">{h.weight.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}

          {holdings.length > 1 && (
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setSelected(new Set(holdings.map((h) => h.portfolioId)))}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Deselect all
              </button>
            </div>
          )}
        </div>

        {swapMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {swapMutation.error instanceof Error ? swapMutation.error.message : 'Swap failed'}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={swapMutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={swapMutation.isPending || (holdings.length > 0 && selected.size === 0)}
            onClick={() => swapMutation.mutate()}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {swapMutation.isPending
              ? 'Swapping…'
              : `Execute Swap${selected.size > 0 ? ` (${selected.size} portfolio${selected.size > 1 ? 's' : ''})` : ''}`}
          </button>
        </div>
      </div>
    </dialog>
  )
}
