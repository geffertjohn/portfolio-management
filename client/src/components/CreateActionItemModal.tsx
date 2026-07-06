import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createActionItem, CATEGORY_LABELS, RECURRENCE_LABELS, type ActionPriority, type ActionCategory, type ActionRecurrence } from '@/lib/actionItems'
import { fetchSecurities } from '@/lib/securities'
import { fetchPortfolios } from '@/lib/portfolio'
import { fetchClients } from '@/lib/clients'
import type { Portfolio } from '@/types/portfolio'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface CreateActionItemModalProps {
  open: boolean
  onClose: () => void
  defaultSecurityId?: string | null
  defaultPortfolioName?: string | null
  defaultClientId?: number | null
}

export function CreateActionItemModal({ open, onClose, defaultSecurityId, defaultPortfolioName, defaultClientId }: CreateActionItemModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [securityId, setSecurityId] = useState<string>(defaultSecurityId ?? '')
  const [portfolioId, setPortfolioId] = useState<string>(defaultPortfolioName || '')
  const [clientId, setClientId] = useState<string>(defaultClientId != null ? String(defaultClientId) : '')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<ActionPriority>('medium')
  const [category, setCategory] = useState<ActionCategory>('operational')
  const [recurrence, setRecurrence] = useState<ActionRecurrence>('none')

  const { data: securities = [] } = useQuery({ queryKey: QUERY_KEYS.securities, queryFn: fetchSecurities, enabled: open })
  const { data: portfolios = [] } = useQuery<Portfolio[]>({ queryKey: QUERY_KEYS.portfolios, queryFn: fetchPortfolios, enabled: open })
  const { data: clients = [] } = useQuery({ queryKey: QUERY_KEYS.clients, queryFn: fetchClients, enabled: open })

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      d.showModal()
      setSecurityId(defaultSecurityId ?? '')
      setPortfolioId(defaultPortfolioName || '')
      setClientId(defaultClientId != null ? String(defaultClientId) : '')
      // Pre-set the category to match the launching context.
      if (defaultSecurityId) setCategory('security')
      else if (defaultPortfolioName) setCategory('portfolio')
      else if (defaultClientId != null) setCategory('client')
    } else d.close()
  }, [open, defaultSecurityId, defaultPortfolioName, defaultClientId])

  const mutation = useMutation({
    mutationFn: () => createActionItem({
      title,
      description: description || undefined,
      category,
      security_id: securityId || null,
      portfolio_name: portfolioId || null,
      linked_type: clientId ? 'client' : null,
      linked_id: clientId || null,
      due_date: dueDate || null,
      priority,
      recurrence,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItems })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allActions })
      if (securityId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItemsBySecurity(securityId) })
      if (portfolioId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItemsByPortfolio(portfolioId) })
      if (clientId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actionItemsByClient(Number(clientId)) })
      onClose(); reset()
    },
  })

  const reset = () => { setTitle(''); setDescription(''); setDueDate(''); setPriority('medium'); setCategory('operational'); setRecurrence('none'); setClientId(''); mutation.reset() }
  const handleClose = () => { if (!mutation.isPending) { onClose(); reset() } }

  return (
    <dialog ref={dialogRef} onCancel={handleClose}
      className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="p-6">
        <h2 className="text-lg font-semibold text-gray-900">New Action Item</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required
              placeholder="e.g. Review UITB vs benchmark"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Security</label>
              <select value={securityId} onChange={(e) => setSecurityId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                <option value="">None</option>
                {securities.map((s) => <option key={s.id} value={s.security_id}>{s.security_id}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Portfolio</label>
              <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                <option value="">None</option>
                {portfolios.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
              <option value="">None</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ActionCategory)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                {(Object.keys(CATEGORY_LABELS) as ActionCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Recurrence</label>
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as ActionRecurrence)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                {(Object.keys(RECURRENCE_LABELS) as ActionRecurrence[]).map((r) => (
                  <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ActionPriority)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>

        {mutation.isError && (
          <p className="mt-3 text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : 'Failed to create'}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={handleClose} disabled={mutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending || !title.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Create'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
