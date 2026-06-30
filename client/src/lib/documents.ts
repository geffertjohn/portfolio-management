/**
 * documents.ts
 *
 * Client for the Express file store (`server/`), backing the Settings → Documents
 * page and the per-portfolio Documents tab. Files live in named folders; a
 * portfolio's documents use a folder equal to the portfolio name.
 */
export const SERVER_BASE = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export interface StoredFile {
  id: string
  name: string
  folder: string
  fullPath: string
  size: number | null
  mimetype: string | null
  updatedAt: string
  createdAt: string
}

export interface FilesResponse {
  files: StoredFile[]
  folders: string[]
}

async function asError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? `${fallback} (${res.status})`)
}

export async function fetchAllFiles(): Promise<FilesResponse> {
  const res = await fetch(`${SERVER_BASE}/api/files`)
  if (!res.ok) return asError(res, 'Failed to load files')
  return res.json() as Promise<FilesResponse>
}

export async function createFolder(name: string): Promise<{ folder: string }> {
  const res = await fetch(`${SERVER_BASE}/api/folders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
  if (!res.ok) return asError(res, 'Failed to create folder')
  return res.json() as Promise<{ folder: string }>
}

export async function deleteFolder(name: string): Promise<void> {
  const res = await fetch(`${SERVER_BASE}/api/folders`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
  if (!res.ok) await asError(res, 'Failed to delete folder')
}

export async function uploadFile(folder: string, file: File): Promise<void> {
  const formData = new FormData()
  formData.append('folder', folder)
  formData.append('file', file)
  const res = await fetch(`${SERVER_BASE}/api/upload`, { method: 'POST', body: formData })
  if (!res.ok) await asError(res, 'Upload failed')
}

export async function deleteFile(path: string): Promise<void> {
  const res = await fetch(`${SERVER_BASE}/api/files`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
  })
  if (!res.ok) await asError(res, 'Delete failed')
}

export async function getSignedUrl(path: string): Promise<string> {
  const res = await fetch(`${SERVER_BASE}/api/files/signed-url?path=${encodeURIComponent(path)}`)
  if (!res.ok) return asError(res, 'Could not get signed URL')
  const data = (await res.json()) as { url: string }
  return data.url
}

/**
 * True when an error looks like "the Express proxy isn't reachable" — covers the
 * browser-specific fetch-failure messages (Chrome "Failed to fetch", Safari
 * "Load failed", Firefox "NetworkError"). Used to show a graceful banner.
 */
export function isServerUnreachable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /failed to fetch|load failed|networkerror|could not connect/i.test(err.message)
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
