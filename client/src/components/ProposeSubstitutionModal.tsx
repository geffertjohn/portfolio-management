import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSubstitution } from '@/lib/substitutions'
import { fetchSecurities } from '@/lib/securities'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface ProposeSubstitutionModalProps {
  open: boolean
  onClose: () => void
  atRiskId: number
  incumbentSecurityId: string
  incumbentSymbol: string
}

export function ProposeSubstitutionModal({
  open,
  onClose,
  atRiskId,
  incumbentSecurityId,
  incumbentSymbol,
}: ProposeSubstitutionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [proposedId, setProposedId] = useState('')
  const [rationale, setRationale] = useState('')

  const { data: securities = [] } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
    enabled: open,
  })

  const candidates = securities.filter((s) => s.security_id !== incumbentSecurityId)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      d.showModal()
      setProposedId('')
      setRationale('')
      mutation.reset()
    } else {
      d.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const mutation = useMutation({
    mutationFn: () => {
      if (!proposedId) throw new Error('Select a security')
      return createSubstitution({
        at_risk_id: atRiskId,
        incumbent_security_id: incumbentSecurityId,
        proposed_security_id: proposedId,
        rationale: rationale.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.substitutions(atRiskId) })
      onClose()
    },
  })

  const handleClose = () => {
    if (!mutation.isPending) { onClose(); mutation.reset() }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30"
    >
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="p-6">
        <h2 className="text-lg font-semibold text-gray-900">Propose Substitution</h2>
        <p className="mt-1 text-sm text-gray-500">
          Propose a replacement for <strong>{incumbentSymbol}</strong>.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Proposed Security <span className="text-red-500">*</span>
            </label>
            <select
              value={proposedId}
              onChange={(e) => setProposedId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value="">Select a security…</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.security_id}>
                  {s.security_id}{s.security_name ? ` — ${s.security_name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Rationale <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              required
              placeholder="Why should this security replace the incumbent?"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>
        </div>

        {mutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to create substitution'}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={mutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || !proposedId || !rationale.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Propose'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
