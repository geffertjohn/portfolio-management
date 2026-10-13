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

const KEEP_FILE = '.keep'

// Files live in named Storage buckets. Default is the general `security-uploads`
// bucket (Settings → Documents); per-entity Documents tabs pass a dedicated
// bucket. Allowlisted so a bad/unknown value can't be targeted.
const DEFAULT_BUCKET = 'security-uploads'
const ALLOWED_BUCKETS = new Set([DEFAULT_BUCKET, 'fund-fact-sheets', 'Portfolio Documents', 'Security Documents'])
function resolveBucket(v: unknown): string {
  return typeof v === 'string' && ALLOWED_BUCKETS.has(v) ? v : DEFAULT_BUCKET
}

/**
 * Upload without ever overwriting an existing object.
 *
 * Storage paths are `<folder>/<YYYY-MM-DD>_<name>`, which is deterministic, and
 * the fund review evidence filename is deterministic too
 * (`<ticker>-review-<date>.pdf`). With `upsert: true` a second review of the
 * same fund on the same review date silently destroyed the first review's
 * frozen evidence, while BOTH review_log rows kept pointing at that one path --
 * an audit record linked to evidence it was not recorded with.
 *
 * So: insert-only, and on a collision suffix the basename `-2`, `-3`, ... The
 * first upload of a name is unchanged; later ones land beside it instead of on
 * top of it. Callers persist the returned path, so the suffix carries through.
 */
const MAX_UPLOAD_NAME_ATTEMPTS = 50

function isDuplicateObjectError(err: { message?: string; statusCode?: string } | null): boolean {
  if (!err) return false
  const status = String((err as { statusCode?: string }).statusCode ?? '')
  return status === '409' || /already exists|duplicate/i.test(err.message ?? '')
}

async function uploadWithoutOverwriting(
  bucket: string,
  folder: string,
  originalName: string,
  body: Buffer,
  contentType: string,
): Promise<{ path: string | null; error: string | null }> {
  const datePrefix = new Date().toISOString().slice(0, 10)
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const dot = safeName.lastIndexOf('.')
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName
  const ext = dot > 0 ? safeName.slice(dot) : ''

  for (let attempt = 1; attempt <= MAX_UPLOAD_NAME_ATTEMPTS; attempt++) {
    const suffix = attempt === 1 ? '' : `-${attempt}`
    const storagePath = `${folder}/${datePrefix}_${stem}${suffix}${ext}`
    const { error } = await adminSupabase.storage
      .from(bucket)
      .upload(storagePath, body, { contentType, upsert: false })
    if (!error) return { path: storagePath, error: null }
    if (!isDuplicateObjectError(error)) return { path: null, error: error.message }
  }
  return { path: null, error: `Could not find a free name for ${safeName} after ${MAX_UPLOAD_NAME_ATTEMPTS} attempts` }
}

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
app.get('/api/folders', async (req, res) => {
  const bucket = resolveBucket(req.query.bucket)
  const { data, error } = await adminSupabase.storage
    .from(bucket)
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
  const bucket = resolveBucket(req.body.bucket)
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Folder name is required' })
    return
  }

  // Sanitise: allow letters, numbers, spaces, hyphens, underscores, dots
  const safe = name.trim().replace(/[^a-zA-Z0-9 ._-]/g, '_')
  const keepPath = `${safe}/${KEEP_FILE}`

  const { error } = await adminSupabase.storage
    .from(bucket)
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
  const bucket = resolveBucket(req.body.bucket)
  if (!name) {
    res.status(400).json({ error: 'Folder name is required' })
    return
  }

  // List all files in folder, then remove them all
  const { data: files, error: listErr } = await adminSupabase.storage
    .from(bucket)
    .list(name, { limit: 500 })

  if (listErr) {
    res.status(500).json({ error: listErr.message })
    return
  }

  if (files && files.length > 0) {
    const paths = files.map((f) => `${name}/${f.name}`)
    const { error: delErr } = await adminSupabase.storage.from(bucket).remove(paths)
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
app.get('/api/files', async (req, res) => {
  const bucket = resolveBucket(req.query.bucket)
  const { data: topLevel, error: fErr } = await adminSupabase.storage
    .from(bucket)
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
        .from(bucket)
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
  const bucket = resolveBucket(req.body.bucket)
  const file = req.file

  if (!folder) {
    res.status(400).json({ error: 'folder field is required' })
    return
  }
  if (!file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const { path: storagePath, error } = await uploadWithoutOverwriting(
    bucket, folder, file.originalname, file.buffer, file.mimetype,
  )

  if (error || !storagePath) {
    res.status(500).json({ error: error ?? 'Upload failed' })
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
  const bucket = resolveBucket(req.body.bucket)
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const { path: storagePath, error } = await uploadWithoutOverwriting(
    bucket, securityId, file.originalname, file.buffer, file.mimetype,
  )

  if (error || !storagePath) {
    res.status(500).json({ error: error ?? 'Upload failed' })
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
  const bucket = resolveBucket((req.body as { bucket?: unknown }).bucket)
  if (!filePath) {
    res.status(400).json({ error: 'Missing path in request body' })
    return
  }

  const { error } = await adminSupabase.storage.from(bucket).remove([filePath])

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
  const bucket = resolveBucket(req.query.bucket)
  if (!filePath) {
    res.status(400).json({ error: 'Missing path query parameter' })
    return
  }

  const { data, error } = await adminSupabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 60 * 60)

  if (error || !data?.signedUrl) {
    res.status(500).json({ error: error?.message ?? 'Failed to create signed URL' })
    return
  }

  res.json({ url: data.signedUrl })
})

// ── SEC XBRL (as-filed figures) ───────────────────────────────────────────────

/**
 * GET /api/sec/operating-income?cik=0000320193
 *
 * Returns the company's OWN filed annual operating income, straight from SEC
 * XBRL. This exists because the market-data vendor's `operatingIncome` relocates
 * charges out of the operating line: an audit against this endpoint found 17 of
 * 45 names disagreeing on at least one fiscal year, including a SIGN FLIP (BSX
 * FY2020: vendor +$601M against a filed -$80M operating loss) and IBM FY2022 off
 * by 607%. Pretax ties in every case, so nothing internal to the feed catches it,
 * and the vendor's `operatingProfitMargin` is derived from the same broken number
 * — which is what the Scorecard renders.
 *
 * It is proxied rather than fetched from the browser for two reasons, both hard:
 * data.sec.gov returns NO `access-control-allow-origin` on a 200 (only on its
 * error responses, which is a trap), and SEC asks for a descriptive User-Agent,
 * which a browser will not let JavaScript set.
 */
const SEC_UA = process.env.SEC_USER_AGENT
  ?? 'portfolio-management-app (admin contact configured via SEC_USER_AGENT)'
// Operating income is tagged differently by a few filers; try the standard tag first.
const SEC_OPINC_TAGS = ['OperatingIncomeLoss', 'OperatingIncomeLossIncludingNoncontrollingInterest']
const SEC_CACHE_TTL_MS = 12 * 60 * 60 * 1000 // as-filed history only changes on a new filing
const secCache = new Map<string, { at: number; body: unknown }>()

interface SecFact { start?: string; end?: string; val?: number; filed?: string; fy?: number; form?: string }

app.get('/api/sec/operating-income', async (req, res) => {
  const raw = typeof req.query.cik === 'string' ? req.query.cik : ''
  const cik = raw.replace(/\D/g, '').padStart(10, '0')
  if (!/^\d{10}$/.test(cik) || Number(cik) === 0) {
    res.status(400).json({ error: 'cik must be a numeric CIK' })
    return
  }

  const hit = secCache.get(cik)
  if (hit && Date.now() - hit.at < SEC_CACHE_TTL_MS) {
    res.json(hit.body)
    return
  }

  try {
    for (const tag of SEC_OPINC_TAGS) {
      const r = await fetch(
        `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`,
        { headers: { 'User-Agent': SEC_UA, Accept: 'application/json' } },
      )
      if (r.status === 404) continue
      if (!r.ok) {
        res.status(502).json({ error: `SEC returned ${r.status}` })
        return
      }
      const json = (await r.json()) as { units?: Record<string, SecFact[]> }
      const facts = Object.values(json.units ?? {}).find(Array.isArray) ?? []

      // Key on the PERIOD END DATE. SEC's `fy`/`fp` describe the filing a fact
      // appears in, not the period it covers, so a 10-K tags its own prior-year
      // comparatives with the filing's own fiscal year — keying on `fy` silently
      // compares different years.
      //
      // Then rank candidates for the same period: an ANNUAL REPORT always beats a
      // quarterly one, and only within the same class does the most recent filing
      // win (which is how a genuine restatement gets picked up). Letting "latest
      // filed" win outright is wrong: Comfort Systems' FY2025 is $1,315M in its
      // 10-K, but a later 10-Q carries a 365-day fact ending on the same date
      // valued at $209M, which would silently replace the audited figure.
      const ANNUAL_FORMS = /^(10-K|20-F|40-F|10-KT)/
      const rank = (f: SecFact) => (ANNUAL_FORMS.test(f.form ?? '') ? 1 : 0)
      const byEnd = new Map<string, SecFact>()
      for (const f of facts) {
        if (!f.start || !f.end || typeof f.val !== 'number') continue
        const days = (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000
        if (days < 330 || days > 400) continue // annual periods only
        const prev = byEnd.get(f.end)
        if (!prev) { byEnd.set(f.end, f); continue }
        const better = rank(f) !== rank(prev)
          ? rank(f) > rank(prev)
          : Date.parse(f.filed ?? '') > Date.parse(prev.filed ?? '')
        if (better) byEnd.set(f.end, f)
      }

      const body = {
        cik,
        tag,
        periods: [...byEnd.values()]
          .sort((a, b) => Date.parse(b.end!) - Date.parse(a.end!))
          .slice(0, 12)
          .map((f) => ({ end: f.end, start: f.start, val: f.val, filed: f.filed, form: f.form })),
      }
      secCache.set(cik, { at: Date.now(), body })
      res.json(body)
      return
    }
    // Banks, insurers and some foreign filers do not tag operating income at all.
    const body = { cik, tag: null, periods: [] }
    secCache.set(cik, { at: Date.now(), body })
    res.json(body)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'SEC request failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
