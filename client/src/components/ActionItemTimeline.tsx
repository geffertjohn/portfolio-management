import { useQuery } from '@tanstack/react-query'
import { fetchActionItemEvents } from '@/lib/actionItemEvents'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import type { ActionStatus } from '@/lib/actionItems'

const STATUS_LABELS: Record<ActionStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  closed: 'Closed',
}

const STATUS_COLORS: Record<ActionStatus, string> = {
  open: 'bg-gray-200 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  closed: 'bg-green-100 text-green-700',
}

interface ActionItemTimelineProps {
  actionItemId: number
}

export function ActionItemTimeline({ actionItemId }: ActionItemTimelineProps) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.actionItemEvents(actionItemId),
    queryFn: () => fetchActionItemEvents(actionItemId),
  })

  if (isLoading) return <p className="text-xs text-gray-400">Loading history…</p>
  if (events.length === 0) return <p className="text-xs text-gray-400 italic">No status changes recorded yet.</p>

  return (
    <ol className="space-y-2">
      {events.map((ev, i) => (
        <li key={ev.id} className="flex items-start gap-3 text-xs">
          {/* Timeline dot + line */}
          <div className="mt-0.5 flex flex-col items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-gray-400 shrink-0" />
            {i < events.length - 1 && <div className="mt-1 w-px flex-1 bg-gray-200" style={{ minHeight: '1rem' }} />}
          </div>
          <div className="min-w-0 pb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {ev.from_status && (
                <>
                  <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ev.from_status]}`}>
                    {STATUS_LABELS[ev.from_status]}
                  </span>
                  <span className="text-gray-400">→</span>
                </>
              )}
              <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ev.to_status]}`}>
                {STATUS_LABELS[ev.to_status]}
              </span>
            </div>
            {ev.notes && <p className="mt-0.5 text-gray-500">{ev.notes}</p>}
            <p className="mt-0.5 text-gray-400">
              {new Date(ev.created_at).toLocaleString()}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
