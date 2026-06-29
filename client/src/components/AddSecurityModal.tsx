import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSecurityBySymbol } from '@/lib/securities'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface AddSecurityModalProps {
  open: boolean
  onClose: () => void
}

export function AddSecurityModal({ open, onClose }: AddSecurityModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()

  const [symbol, setSymbol] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => createSecurityBySymbol(symbol),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.securities })
      setSymbol('')
      onClose()
      setLocalError(null)
    },
    onError: (err) => {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to add security',
      )
    },
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) dialog.showModal()
    else dialog.close()
  }, [open])

  const handleClose = () => {
    if (!mutation.isPending) {
      onClose()
      setSymbol('')
      setLocalError(null)
      mutation.reset()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const sym = symbol.trim().toUpperCase()
    if (!sym) return
    setSymbol(sym)
    mutation.mutate()
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30"
      aria-labelledby="add-security-title"
    >
      <form onSubmit={handleSubmit} className="p-6">
        <h2 id="add-security-title" className="text-lg font-semibold text-gray-900">
          Add security
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Enter a ticker symbol to create a new <code className="rounded bg-gray-100 px-1">securities2</code> row.
        </p>

        <div className="mt-4 space-y-2">
          <label
            htmlFor="add-security-symbol"
            className="block text-sm font-medium text-gray-700"
          >
            Symbol
          </label>
          <input
            id="add-security-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g. AAPL"
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>

        {localError && (
          <p className="mt-3 text-sm text-red-600">
            {localError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={mutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || !symbol.trim()}
            className="rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {mutation.isPending ? 'Adding…' : 'Add security'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

