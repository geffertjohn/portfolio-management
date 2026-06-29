import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/clients'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface Portfolio { name: string; portfolio_strategy: string }

interface CreateClientModalProps {
  open: boolean
  onClose: () => void
  portfolios: Portfolio[]
}

export function CreateClientModal({ open, onClose, portfolios }: CreateClientModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [household, setHousehold] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [modelPortfolioId, setModelPortfolioId] = useState('')

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) d.showModal(); else d.close()
  }, [open])

  const mutation = useMutation({
    mutationFn: () => createClient({
      name,
      household_name: household || undefined,
      email: email || undefined,
      notes: notes || undefined,
      model_portfolio_name: modelPortfolioId || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients })
      onClose(); reset()
    },
  })

  const reset = () => { setName(''); setHousehold(''); setEmail(''); setNotes(''); setModelPortfolioId(''); mutation.reset() }
  const handleClose = () => { if (!mutation.isPending) { onClose(); reset() } }

  return (
    <dialog ref={dialogRef} onCancel={handleClose}
      className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="p-6">
        <h2 className="text-lg font-semibold text-gray-900">Add Client</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Household Name</label>
            <input value={household} onChange={(e) => setHousehold(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Model Portfolio</label>
            <select value={modelPortfolioId} onChange={(e) => setModelPortfolioId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
              <option value="">None</option>
              {portfolios.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} — {p.portfolio_strategy}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          </div>
        </div>
        {mutation.isError && (
          <p className="mt-3 text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : 'Failed'}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={handleClose} disabled={mutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending || !name.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Add Client'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
