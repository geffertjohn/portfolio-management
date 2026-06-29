import { supabase } from './supabase'

export type SubstitutionStatus = 'proposed' | 'under_review' | 'approved' | 'swapped' | 'rejected'

export interface Substitution {
  id: number
  at_risk_id: number
  incumbent_security_id: string
  proposed_security_id: string
  status: SubstitutionStatus
  rationale: string | null
  reviewed_at: string | null
  approved_at: string | null
  swapped_at: string | null
  created_at: string
  updated_at: string
  // joined
  incumbent_symbol?: string | null
  incumbent_name?: string | null
  proposed_symbol?: string | null
  proposed_name?: string | null
}

export const SUBSTITUTION_STATUS_LABELS: Record<SubstitutionStatus, string> = {
  proposed: 'Proposed',
  under_review: 'Under Review',
  approved: 'Approved',
  swapped: 'Swapped',
  rejected: 'Rejected',
}

export const SUBSTITUTION_STATUS_ORDER: SubstitutionStatus[] = [
  'proposed', 'under_review', 'approved', 'swapped',
]

export async function fetchSubstitutionsByAtRisk(atRiskId: number): Promise<Substitution[]> {
  const { data, error } = await supabase
    .from('substitutions')
    .select(`
      *,
      incumbent:securities2!substitutions_incumbent_security_id_fkey(security_id, security_name),
      proposed:securities2!substitutions_proposed_security_id_fkey(security_id, security_name)
    `)
    .eq('at_risk_id', atRiskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  type JoinedSec = { security_id: string | null; security_name: string | null } | null
  type SubstitutionRow = Substitution & { incumbent: JoinedSec; proposed: JoinedSec }
  return (data ?? []).map((row: SubstitutionRow): Substitution => ({
    ...row,
    incumbent_symbol: row.incumbent?.security_id ?? null,
    incumbent_name: row.incumbent?.security_name ?? null,
    proposed_symbol: row.proposed?.security_id ?? null,
    proposed_name: row.proposed?.security_name ?? null,
  }))
}

export async function createSubstitution(sub: {
  at_risk_id: number
  incumbent_security_id: string
  proposed_security_id: string
  rationale?: string
}): Promise<void> {
  const { error } = await supabase.from('substitutions').insert(sub)
  if (error) throw error
}

export async function advanceSubstitutionStatus(
  id: number,
  newStatus: SubstitutionStatus
): Promise<void> {
  const patch: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'under_review') patch.reviewed_at = new Date().toISOString()
  if (newStatus === 'approved') patch.approved_at = new Date().toISOString()
  if (newStatus === 'swapped') patch.swapped_at = new Date().toISOString()
  const { error } = await supabase.from('substitutions').update(patch).eq('id', id)
  if (error) throw error
}
