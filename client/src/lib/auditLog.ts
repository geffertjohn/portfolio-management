/**
 * auditLog.ts
 *
 * Read access for the `audit_log` table.
 * Entries are written automatically by DB triggers on: review_schedules,
 * compliance_rules, clients, at_risk, prospects, and action_items.
 */
import { supabase } from './supabase'

export interface AuditLogEntry {
  id: number
  table_name: string
  record_id: number | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_at: string
}

export const AUDITED_TABLES = [
  'review_schedules',
  'compliance_rules',
  'clients',
  'at_risk',
  'prospects',
  'action_items',
  'positions',
  'portfolio_allocations',
  'investment_policy_statements',
] as const

export type AuditedTable = (typeof AUDITED_TABLES)[number]

export const PAGE_SIZE = 50

export async function fetchAuditLog(opts?: {
  tableName?: AuditedTable
  page?: number
}): Promise<{ entries: AuditLogEntry[]; hasMore: boolean }> {
  const page = opts?.page ?? 0
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE // fetch one extra to detect hasMore

  let q = supabase
    .from('audit_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .range(from, to)

  if (opts?.tableName) q = q.eq('table_name', opts.tableName)

  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as AuditLogEntry[]
  return { entries: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE }
}

export async function exportAuditLogCSV(tableName?: AuditedTable): Promise<void> {
  // Fetch all entries (no limit) for export
  let q = supabase
    .from('audit_log')
    .select('*')
    .order('changed_at', { ascending: false })

  if (tableName) q = q.eq('table_name', tableName)

  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as AuditLogEntry[]

  const escape = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const headers = ['id', 'table_name', 'record_id', 'action', 'changed_at', 'old_data', 'new_data']
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [r.id, r.table_name, r.record_id, r.action, r.changed_at, r.old_data, r.new_data]
        .map(escape)
        .join(',')
    ),
  ]

  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
