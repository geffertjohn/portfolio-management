/**
 * Shared mapper for rows that embed `securities2(id, security_id, security_name)`.
 *
 * PostgREST returns a many-to-one embed as an object, but some queries surface it
 * as a single-element array — this normalizes both and flattens the joined ticker,
 * name, and numeric id onto the row. Replaces the copy-pasted `(row: any) => ({...})`
 * mappers that previously lived in actionItems / alertRules / communicationLog /
 * reviewSchedules.
 */

interface JoinedSecurity {
  id?: number | null
  security_id?: string | null
  security_name?: string | null
}

export interface SecurityJoinFields {
  security_symbol: string | null
  security_name: string | null
  security_numeric_id: number | null
}

export function mapSecurityJoin<T extends object>(row: T): T & SecurityJoinFields {
  const embed = (row as { securities2?: JoinedSecurity | JoinedSecurity[] | null }).securities2
  const sec = Array.isArray(embed) ? embed[0] : embed
  return {
    ...row,
    security_symbol: sec?.security_id ?? null,
    security_name: sec?.security_name ?? null,
    security_numeric_id: sec?.id ?? null,
  }
}
