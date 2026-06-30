import { useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchAllFiles, uploadFile, deleteFile, getSignedUrl, formatBytes,
  type StoredFile,
} from '@/lib/documents'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { formatDate } from '@/lib/fundFormat'

function FileIcon({ mimetype }: { mimetype: string | null }) {
  const cls = 'h-5 w-5 shrink-0'
  if (mimetype?.includes('pdf')) {
    return <svg className={`${cls} text-red-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
  }
  if (mimetype?.includes('spreadsheet') || mimetype?.includes('excel') || mimetype?.includes('xlsx')) {
    return <svg className={`${cls} text-green-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  }
  return <svg className={`${cls} text-gray-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
}

/** Documents for one portfolio — files in a folder named after the portfolio. */
export function PortfolioDocumentsPanel({ portfolioId }: { portfolioId: string }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.documentsFiles,
    queryFn: fetchAllFiles,
    staleTime: 1000 * 30,
  })
  const files: StoredFile[] = (data?.files ?? []).filter((f) => f.folder === portfolioId)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.documentsFiles })

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadFile(portfolioId, file),
    onSuccess: () => { invalidate(); if (inputRef.current) inputRef.current.value = '' },
  })
  const deleteMut = useMutation({
    mutationFn: (path: string) => deleteFile(path),
    onSuccess: invalidate,
  })
  const viewMut = useMutation({
    mutationFn: (path: string) => getSignedUrl(path),
    onSuccess: (url) => window.open(url, '_blank'),
    onError: (e) => alert(e instanceof Error ? e.message : 'Could not open file'),
  })

  const serverDown = error instanceof Error && error.message.includes('Failed to fetch')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Documents</h2>
          <p className="mt-1 text-xs text-gray-400">Files stored for <span className="font-medium text-gray-600">{portfolioId}</span>.</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMut.isPending || serverDown}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {uploadMut.isPending ? 'Uploading…' : 'Upload document'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f) }}
        />
      </div>

      {serverDown && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Express server not reachable</p>
          <p className="mt-1 text-sm text-amber-700">Start it with <code className="rounded bg-amber-100 px-1">cd server &amp;&amp; npm run dev</code>.</p>
        </div>
      )}

      {uploadMut.isError && <p className="text-sm text-red-600">{uploadMut.error instanceof Error ? uploadMut.error.message : 'Upload failed'}</p>}

      {!serverDown && (
        isLoading ? (
          <p className="text-sm text-gray-500">Loading documents…</p>
        ) : files.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-500">No documents for this portfolio yet.</p>
            <p className="mt-1 text-xs text-gray-400">Upload IPS, statements, compliance records, and other files here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <button type="button" onClick={() => viewMut.mutate(f.fullPath)} className="flex min-w-0 items-center gap-3 text-left">
                  <FileIcon mimetype={f.mimetype} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900 hover:text-blue-600">{f.name}</span>
                    <span className="block text-xs text-gray-400">{formatBytes(f.size)} · {formatDate(f.updatedAt)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => { if (confirm(`Delete "${f.name}"?`)) deleteMut.mutate(f.fullPath) }}
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  aria-label={`Delete ${f.name}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
