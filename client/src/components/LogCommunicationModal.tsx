import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCommEntry, type CommType } from '@/lib/communicationLog'
import { QUERY_KEYS } from '@/hooks/queryKeys'

interface LogCommunicationModalProps {
  open: boolean
  onClose: () => void
  clientId: number
}

export function LogCommunicationModal({ open, onClose, clientId }: LogCommunicationModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const queryClient = useQueryClient()
  const [type, setType] = useState<CommType>('meeting')
  const [subject, setSubject] = useState('')
  const [notes, setNotes] = useState('')
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10))
  const [followUpDue, setFollowUpDue] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) d.showModal(); else d.close()
  }, [open])

  const mutation = useMutation({
    mutationFn: () => createCommEntry({
      client_id: clientId,
      type,
      subject,
      notes: notes || undefined,
      occurred_at: new Date(occurredAt).toISOString(),
      follow_up_due: followUpDue || null,
      follow_up_notes: followUpNotes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.communicationLog(clientId) })
      onClose(); reset()
    },
  })

  const reset = () => { setSubject(''); setNotes(''); setFollowUpDue(''); setFollowUpNotes(''); mutation.reset() }
  const handleClose = () => { if (!mutation.isPending) { onClose(); reset() } }

  return (
    <dialog ref={dialogRef} onCancel={handleClose}
      className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/30">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="p-6">
        <h2 className="text-lg font-semibold text-gray-900">Log Communication</h2>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as CommType)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none">
                <option value="meeting">Meeting</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="note">Note</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Date</label>
              <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Subject <span className="text-red-500">*</span></label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required
              placeholder="e.g. Q1 portfolio review call"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Follow-up Due</label>
              <input type="date" value={followUpDue} onChange={(e) => setFollowUpDue(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Follow-up Notes</label>
              <input value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="What needs to happen?"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={handleClose} disabled={mutation.isPending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending || !subject.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Log Communication'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
