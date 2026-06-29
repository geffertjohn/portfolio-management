interface StatusBadgeProps {
  variant: 'pass' | 'warn' | 'breach' | 'open' | 'in_progress' | 'closed' | 'low' | 'medium' | 'high' | 'overdue' | 'due_soon' | 'proposed' | 'under_review' | 'approved' | 'swapped' | 'rejected'
  label?: string
}

const STYLES: Record<StatusBadgeProps['variant'], string> = {
  pass:         'bg-green-100 text-green-800',
  warn:         'bg-amber-100 text-amber-800',
  breach:       'bg-red-100 text-red-800',
  open:         'bg-blue-100 text-blue-800',
  in_progress:  'bg-amber-100 text-amber-800',
  closed:       'bg-gray-100 text-gray-600',
  low:          'bg-gray-100 text-gray-600',
  medium:       'bg-amber-100 text-amber-800',
  high:         'bg-red-100 text-red-800',
  overdue:      'bg-red-100 text-red-800',
  due_soon:     'bg-amber-100 text-amber-800',
  proposed:     'bg-blue-100 text-blue-800',
  under_review: 'bg-amber-100 text-amber-800',
  approved:     'bg-green-100 text-green-800',
  swapped:      'bg-gray-100 text-gray-600',
  rejected:     'bg-red-100 text-red-800',
}

const DEFAULT_LABELS: Record<StatusBadgeProps['variant'], string> = {
  pass: 'Pass', warn: 'Warn', breach: 'Breach',
  open: 'Open', in_progress: 'In Progress', closed: 'Closed',
  low: 'Low', medium: 'Medium', high: 'High',
  overdue: 'Overdue', due_soon: 'Due Soon',
  proposed: 'Proposed', under_review: 'Under Review',
  approved: 'Approved', swapped: 'Swapped', rejected: 'Rejected',
}

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[variant]}`}>
      {label ?? DEFAULT_LABELS[variant]}
    </span>
  )
}
