import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchCommunicationLog, deleteCommEntry, type CommType } from '@/lib/communicationLog'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'

const TYPE_ICON: Record<CommType, string> = {
  meeting: '🤝',
  call: '📞',
  email: '✉️',
  note: '📝',
}

const TYPE_COLORS: Record<CommType, string> = {
  meeting: 'bg-purple-100 text-purple-800',
  call: 'bg-blue-100 text-blue-800',
  email: 'bg-green-100 text-green-800',
  note: 'bg-gray-100 text-gray-700',
}

export function CommunicationTimeline({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient()

  const { data: entries = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.communicationLog(clientId),
    queryFn: () => fetchCommunicationLog(clientId),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCommEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.communicationLog(clientId) }),
  })

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-10 text-center">
        <p className="text-sm text-gray-500">No communications logged yet.</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="absolute left-5 top-0 h-full w-0.5 bg-gray-200" />
      <ul className="space-y-4">
        {entries.map((entry) => (
          <li key={entry.id} className="relative flex gap-4 pl-12">
            <span className={`absolute left-0 flex h-10 w-10 items-center justify-center rounded-full text-lg ${TYPE_COLORS[entry.type]}`}>
              {TYPE_ICON[entry.type]}
            </span>
            <div className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{entry.subject}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(entry.occurred_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[entry.type]}`}>
                    {entry.type}
                  </span>
                  <button onClick={() => deleteMutation.mutate(entry.id)}
                    className="text-xs text-red-400 hover:text-red-600">Delete</button>
                </div>
              </div>
              {entry.notes && <p className="mt-2 text-sm text-gray-700">{entry.notes}</p>}
              {entry.follow_up_due && (
                <p className="mt-2 text-xs text-amber-700">
                  Follow-up by {entry.follow_up_due}
                  {entry.follow_up_notes && ` — ${entry.follow_up_notes}`}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
