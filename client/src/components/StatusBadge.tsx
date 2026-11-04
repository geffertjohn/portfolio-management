/**
 * A pill for one of the statuses the app actually renders.
 *
 * The variant list is deliberately the REACHABLE set, not every status the
 * domain has. It carried 19 variants of which 8 were unreachable — the risk
 * verdicts (`pass`/`warn`/`breach`) and the substitution lifecycle
 * (`proposed`/`under_review`/`approved`/`swapped`/`rejected`) — so the
 * component advertised badges no surface could produce. Re-adding one is two
 * lines, in STYLES and DEFAULT_LABELS, and `variant` is typed from STYLES so
 * the two cannot fall out of step.
 *
 * The `label` override is gone too: no call site ever passed one, and three of
 * the four pass a dynamic value, which is exactly the case where a per-call
 * label would let two surfaces name the same status differently.
 */
const STYLES = {
  // Action item priority
  low:          'bg-gray-100 text-gray-600',
  medium:       'bg-amber-100 text-amber-800',
  high:         'bg-red-100 text-red-800',
  // Action item status
  open:         'bg-blue-100 text-blue-800',
  in_progress:  'bg-amber-100 text-amber-800',
  waiting:      'bg-purple-100 text-purple-800',
  blocked:      'bg-red-100 text-red-800',
  snoozed:      'bg-gray-100 text-gray-500',
  closed:       'bg-gray-100 text-gray-600',
  // Review Calendar row status (rowStatus → overdue | due_soon | null)
  overdue:      'bg-red-100 text-red-800',
  due_soon:     'bg-amber-100 text-amber-800',
} as const

export type StatusBadgeVariant = keyof typeof STYLES

const DEFAULT_LABELS: Record<StatusBadgeVariant, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
  open: 'Open', in_progress: 'In Progress', waiting: 'Waiting',
  blocked: 'Blocked', snoozed: 'Snoozed', closed: 'Closed',
  overdue: 'Overdue', due_soon: 'Due Soon',
}

export function StatusBadge({ variant }: { variant: StatusBadgeVariant }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[variant]}`}>
      {DEFAULT_LABELS[variant]}
    </span>
  )
}
