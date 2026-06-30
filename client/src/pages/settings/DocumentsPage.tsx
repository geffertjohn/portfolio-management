import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSecurities } from '@/lib/securities'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import {
  fetchAllFiles as fetchAll, createFolder, deleteFolder, uploadFile, deleteFile, getSignedUrl, formatBytes, isServerUnreachable,
  DEFAULT_BUCKET, type StoredFile,
} from '@/lib/documents'

const FILES_QUERY_KEY = QUERY_KEYS.documentsFiles(DEFAULT_BUCKET)


function FileIcon({ mimetype }: { mimetype: string | null }) {
  if (mimetype?.includes('pdf')) {
    return (
      <svg className="h-5 w-5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    )
  }
  if (mimetype?.includes('spreadsheet') || mimetype?.includes('excel') || mimetype?.includes('xlsx')) {
    return (
      <svg className="h-5 w-5 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
      </svg>
    )
  }
  return (
    <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

// ── New Folder modal ──────────────────────────────────────────────────────────

interface NewFolderModalProps {
  onClose: () => void
  onCreate: (name: string) => void
  isPending: boolean
  error: string | null
}

function NewFolderModal({ onClose, onCreate, isPending, error }: NewFolderModalProps) {
  const [name, setName] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">New Folder</h2>
        <p className="mt-1 text-sm text-gray-500">
          Create a folder to organise documents that aren't tied to a specific security.
        </p>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onCreate(name.trim())
            if (e.key === 'Escape') onClose()
          }}
          placeholder="e.g. Compliance, Manager Research"
          className="mt-4 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || isPending}
            onClick={() => onCreate(name.trim())}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? 'Creating…' : 'Create folder'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function DocumentsPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload state
  const [uploadFolder, setUploadFolder] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  // UI state
  const [search, setSearch] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderError, setNewFolderError] = useState<string | null>(null)
  const [viewingPath, setViewingPath] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: FILES_QUERY_KEY,
    queryFn: () => fetchAll(),
    staleTime: 1000 * 30,
  })

  const files = data?.files ?? []
  const allFolders = data?.folders ?? []

  const { data: securities = [] } = useQuery({
    queryKey: QUERY_KEYS.securities,
    queryFn: fetchSecurities,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(name),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY })
      setShowNewFolder(false)
      setNewFolderError(null)
      // Auto-select the new folder for upload
      setUploadFolder(result.folder)
    },
    onError: (err) => {
      setNewFolderError(err instanceof Error ? err.message : 'Failed to create folder')
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: (name: string) => deleteFolder(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY }),
  })

  const uploadMutation = useMutation({
    mutationFn: ({ folder, file }: { folder: string; file: File }) =>
      uploadFile(folder, file),
    onSuccess: (_, { file }) => {
      queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY })
      setUploadSuccess(`"${file.name}" uploaded successfully.`)
      setUploadError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      window.setTimeout(() => setUploadSuccess(null), 4000)
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
      setUploadSuccess(null)
    },
  })

  const deleteFileMutation = useMutation({
    mutationFn: (path: string) => deleteFile(path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY }),
  })

  const viewMutation = useMutation({
    mutationFn: (path: string) => getSignedUrl(path),
    onSuccess: (url) => {
      setViewingPath(null)
      window.open(url, '_blank')
    },
    onError: (err) => {
      setViewingPath(null)
      alert(err instanceof Error ? err.message : 'Could not open file')
    },
  })

  // ── Derived data ───────────────────────────────────────────────────────────

  const securitySymbols = new Set(securities.map((s) => s.security_id))

  // Build destination options: securities first, then custom folders
  const securityFolders = allFolders.filter((f) => securitySymbols.has(f)).sort()
  const customFolders = allFolders.filter((f) => !securitySymbols.has(f)).sort()

  // Filter files by search
  const filtered = search.trim()
    ? files.filter(
        (f) =>
          f.folder.toLowerCase().includes(search.toLowerCase()) ||
          f.name.toLowerCase().includes(search.toLowerCase())
      )
    : files

  // Group by folder — include empty folders too
  const grouped: Record<string, StoredFile[]> = {}
  for (const folder of allFolders) grouped[folder] = []
  for (const f of filtered) {
    grouped[f.folder] = grouped[f.folder] ?? []
    grouped[f.folder].push(f)
  }

  // If searching, hide folders with no matching files
  const visibleFolders = search.trim()
    ? Object.entries(grouped).filter(([, f]) => f.length > 0)
    : Object.entries(grouped)

  const serverDown = isServerUnreachable(loadError)

  function toggleCollapse(folder: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Documents</h1>
          <p className="mt-1 text-gray-600">
            Upload and manage files per security or in custom folders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowNewFolder(true); setNewFolderError(null) }}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          New Folder
        </button>
      </div>

      {/* Server-down banner */}
      {serverDown && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Express server not reachable</p>
          <p className="mt-1 text-sm text-amber-700">
            Start it with:{' '}
            <code className="rounded bg-amber-100 px-1">cd server && npm run dev</code>
          </p>
        </div>
      )}

      {/* ── Upload panel ──────────────────────────────── */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Upload Document</h2>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          {/* Destination selector */}
          <div className="min-w-[200px] flex-1">
            <label className="block text-xs font-medium text-gray-600">
              Destination folder
            </label>
            <select
              value={uploadFolder}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setShowNewFolder(true)
                  setNewFolderError(null)
                } else {
                  setUploadFolder(e.target.value)
                }
              }}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value="">Select folder…</option>
              {securityFolders.length > 0 && (
                <optgroup label="Securities">
                  {securityFolders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </optgroup>
              )}
              {customFolders.length > 0 && (
                <optgroup label="Custom Folders">
                  {customFolders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </optgroup>
              )}
              <option value="__new__">＋ Create new folder…</option>
            </select>
          </div>

          {/* File picker */}
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600">File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.pdf,.csv,.docx,.doc,.txt,.png,.jpg,.jpeg"
              disabled={!uploadFolder || uploadMutation.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadMutation.mutate({ folder: uploadFolder, file: f })
              }}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:opacity-50"
            />
          </div>
        </div>

        {uploadMutation.isPending && (
          <p className="mt-2 text-sm text-gray-500">Uploading…</p>
        )}
        {uploadSuccess && <p className="mt-2 text-sm text-green-600">{uploadSuccess}</p>}
        {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
      </div>

      {/* ── File library ──────────────────────────────── */}
      <div className="mt-6">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Search folders or filenames…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          <span className="shrink-0 text-sm text-gray-400">
            {files.length} file{files.length !== 1 ? 's' : ''} across{' '}
            {allFolders.length} folder{allFolders.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {loadError && !serverDown && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Failed to load files</p>
            <p className="mt-1 text-sm text-red-600">
              {loadError instanceof Error ? loadError.message : String(loadError)}
            </p>
          </div>
        )}

        {!isLoading && !loadError && allFolders.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-14 text-center">
            <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <p className="mt-3 text-sm text-gray-500">No folders yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Create a folder or upload a file to get started.
            </p>
            <button
              type="button"
              onClick={() => { setShowNewFolder(true); setNewFolderError(null) }}
              className="mt-3 text-sm text-gray-600 underline"
            >
              Create your first folder
            </button>
          </div>
        )}

        {/* Folder list */}
        {visibleFolders.map(([folderName, folderFiles]) => {
          const isCustom = !securitySymbols.has(folderName)
          const isCollapsed = collapsedFolders.has(folderName)

          return (
            <div
              key={folderName}
              className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
            >
              {/* Folder header */}
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleCollapse(folderName)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <svg
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  <svg
                    className={`h-4 w-4 shrink-0 ${isCustom ? 'text-blue-400' : 'text-yellow-500'}`}
                    fill="currentColor" viewBox="0 0 24 24"
                  >
                    <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-900">{folderName}</span>
                  {isCustom && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                      Custom
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Folder actions */}
                <div className="flex items-center gap-1">
                  {/* Quick upload into this folder */}
                  <button
                    type="button"
                    title="Upload to this folder"
                    onClick={() => setUploadFolder(folderName)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </button>

                  {/* Delete folder (only custom folders, or empty security folders) */}
                  {(isCustom || folderFiles.length === 0) && (
                    <button
                      type="button"
                      title="Delete folder"
                      disabled={deleteFolderMutation.isPending}
                      onClick={() => {
                        const msg = folderFiles.length > 0
                          ? `Delete folder "${folderName}" and all ${folderFiles.length} file${folderFiles.length !== 1 ? 's' : ''} inside?`
                          : `Delete empty folder "${folderName}"?`
                        if (!confirm(msg)) return
                        deleteFolderMutation.mutate(folderName)
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* File list */}
              {!isCollapsed && (
                <>
                  {folderFiles.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-gray-400">Empty folder</p>
                      <button
                        type="button"
                        onClick={() => setUploadFolder(folderName)}
                        className="mt-1 text-xs text-gray-500 underline"
                      >
                        Upload the first file
                      </button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {folderFiles.map((f) => (
                        <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <FileIcon mimetype={f.mimetype} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">{f.name}</p>
                              <p className="text-xs text-gray-400">
                                {formatBytes(f.size)}
                                {f.mimetype
                                  ? ` · ${f.mimetype.split('/')[1]?.toUpperCase() ?? f.mimetype}`
                                  : ''}
                                {f.updatedAt
                                  ? ` · ${new Date(f.updatedAt).toLocaleDateString()}`
                                  : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              disabled={viewMutation.isPending && viewingPath === f.fullPath}
                              onClick={() => {
                                setViewingPath(f.fullPath)
                                viewMutation.mutate(f.fullPath)
                              }}
                              className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {viewMutation.isPending && viewingPath === f.fullPath
                                ? 'Opening…'
                                : 'View'}
                            </button>
                            <button
                              type="button"
                              disabled={deleteFileMutation.isPending}
                              onClick={() => {
                                if (!confirm(`Delete "${f.name}"?`)) return
                                deleteFileMutation.mutate(f.fullPath)
                              }}
                              className="rounded border border-red-100 bg-white px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* New Folder modal */}
      {showNewFolder && (
        <NewFolderModal
          isPending={createFolderMutation.isPending}
          error={newFolderError}
          onClose={() => setShowNewFolder(false)}
          onCreate={(name) => createFolderMutation.mutate(name)}
        />
      )}
    </div>
  )
}
