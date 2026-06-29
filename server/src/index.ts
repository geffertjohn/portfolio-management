import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import express from 'express'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../../.env') })

const app = express()
const PORT = process.env.PORT ?? 3001

// Admin Supabase client — uses service role key, bypasses RLS
const adminSupabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const upload = multer({ storage: multer.memoryStorage() })

const BUCKET = 'security-uploads'
const KEEP_FILE = '.keep'

app.use(express.json())
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

// Handle CORS preflight for all routes
app.options('*', (_req, res) => {
  res.sendStatus(204)
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/ping', (_req, res) => {
  res.json({ pong: true })
})

// ── Folders ──────────────────────────────────────────────────────────────────

/**
 * GET /api/folders
 * Returns all top-level folder names in the bucket.
 */
app.get('/api/folders', async (_req, res) => {
  const { data, error } = await adminSupabase.storage
    .from(BUCKET)
    .list('', { limit: 500 })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  // Top-level entries without an id are folder placeholders; entries with id
  // are actual files uploaded directly to root (shouldn't happen in our schema).
  // We treat every top-level name as a folder.
  const folders = (data ?? []).map((item) => item.name).sort()
  res.json({ folders })
})

/**
 * POST /api/folders
 * Body: { name: string }
 * Creates a folder by uploading a tiny .keep placeholder file.
 */
app.post('/api/folders', async (req, res) => {
  const { name } = req.body as { name?: string }
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Folder name is required' })
    return
  }

  // Sanitise: allow letters, numbers, spaces, hyphens, underscores, dots
  const safe = name.trim().replace(/[^a-zA-Z0-9 ._-]/g, '_')
  const keepPath = `${safe}/${KEEP_FILE}`

  const { error } = await adminSupabase.storage
    .from(BUCKET)
    .upload(keepPath, new Uint8Array(0), {
      contentType: 'application/octet-stream',
      upsert: false,
    })

  // Ignore "already exists" — folder is already there
  if (error && !error.message.includes('already exists') && !error.message.includes('duplicate')) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ folder: safe })
})

/**
 * DELETE /api/folders
 * Body: { name: string }
 * Removes the folder by deleting all files inside it (including the .keep placeholder).
 */
app.delete('/api/folders', async (req, res) => {
  const { name } = req.body as { name?: string }
  if (!name) {
    res.status(400).json({ error: 'Folder name is required' })
    return
  }

  // List all files in folder, then remove them all
  const { data: files, error: listErr } = await adminSupabase.storage
    .from(BUCKET)
    .list(name, { limit: 500 })

  if (listErr) {
    res.status(500).json({ error: listErr.message })
    return
  }

  if (files && files.length > 0) {
    const paths = files.map((f) => `${name}/${f.name}`)
    const { error: delErr } = await adminSupabase.storage.from(BUCKET).remove(paths)
    if (delErr) {
      res.status(500).json({ error: delErr.message })
      return
    }
  }

  res.json({ deleted: true })
})

// ── Files ────────────────────────────────────────────────────────────────────

/**
 * GET /api/files
 * Returns all files (excluding .keep placeholders) across every folder,
 * plus the list of all folder names (so empty folders are visible).
 */
app.get('/api/files', async (_req, res) => {
  const { data: topLevel, error: fErr } = await adminSupabase.storage
    .from(BUCKET)
    .list('', { limit: 500 })

  if (fErr) {
    res.status(500).json({ error: fErr.message })
    return
  }

  if (!topLevel || topLevel.length === 0) {
    res.json({ files: [], folders: [] })
    return
  }

  const folderNames = topLevel.map((item) => item.name).sort()

  const allFiles: Array<{
    id: string
    name: string
    folder: string
    fullPath: string
    size: number | null
    mimetype: string | null
    updatedAt: string
    createdAt: string
  }> = []

  await Promise.all(
    folderNames.map(async (folderName) => {
      const { data: files, error: fErr2 } = await adminSupabase.storage
        .from(BUCKET)
        .list(folderName, { limit: 500 })
      if (fErr2 || !files) return
      for (const f of files) {
        if (f.name === KEEP_FILE) continue // skip placeholders
        allFiles.push({
          id: f.id ?? `${folderName}/${f.name}`,
          name: f.name,
          folder: folderName,
          fullPath: `${folderName}/${f.name}`,
          size: (f.metadata as any)?.size ?? null,
          mimetype: (f.metadata as any)?.mimetype ?? null,
          updatedAt: f.updated_at ?? f.created_at ?? '',
          createdAt: f.created_at ?? '',
        })
      }
    })
  )

  allFiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  res.json({ files: allFiles, folders: folderNames })
})

/**
 * POST /api/upload
 * Multipart: fields `folder` (string) + `file` (binary)
 * Generic upload to any folder — not tied to a specific security.
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const folder = (req.body.folder as string | undefined)?.trim()
  const file = req.file

  if (!folder) {
    res.status(400).json({ error: 'folder field is required' })
    return
  }
  if (!file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const datePrefix = new Date().toISOString().slice(0, 10)
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${folder}/${datePrefix}_${safeName}`

  const { error } = await adminSupabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ path: storagePath })
})

/**
 * POST /api/securities/:securityId/files
 * Backward-compatible upload used from Security detail pages.
 */
app.post('/api/securities/:securityId/files', upload.single('file'), async (req, res) => {
  const { securityId } = req.params
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const datePrefix = new Date().toISOString().slice(0, 10)
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${securityId}/${datePrefix}_${safeName}`

  const { error } = await adminSupabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ path: storagePath })
})

/**
 * DELETE /api/files
 * Body: { path: string } — full storage path, e.g. "AAPL/2025-01-01_fact.xlsx"
 */
app.delete('/api/files', async (req, res) => {
  const { path: filePath } = req.body as { path?: string }
  if (!filePath) {
    res.status(400).json({ error: 'Missing path in request body' })
    return
  }

  const { error } = await adminSupabase.storage.from(BUCKET).remove([filePath])

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ deleted: true })
})

/**
 * GET /api/files/signed-url?path=folder/filename
 * Returns a 1-hour signed URL for viewing/downloading a file.
 */
app.get('/api/files/signed-url', async (req, res) => {
  const filePath = req.query.path as string | undefined
  if (!filePath) {
    res.status(400).json({ error: 'Missing path query parameter' })
    return
  }

  const { data, error } = await adminSupabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 60)

  if (error || !data?.signedUrl) {
    res.status(500).json({ error: error?.message ?? 'Failed to create signed URL' })
    return
  }

  res.json({ url: data.signedUrl })
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
