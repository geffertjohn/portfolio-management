export const SECURITY_UPLOADS_BUCKET = 'security-uploads'

const SERVER_BASE = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

if (import.meta.env.PROD && !import.meta.env.VITE_SERVER_URL) {
  console.error(
    '[securityFileStorage] VITE_SERVER_URL is not set. File uploads will target localhost and will fail in production.'
  )
}

/**
 * Uploads a file to Supabase Storage via the Express server (service role key, bypasses RLS).
 * Path: security-uploads/{symbol}/{YYYY-MM-DD}_{filename}
 * Returns the storage path on success.
 */
export async function uploadSecurityFile(symbol: string, file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  let res: Response
  try {
    res = await fetch(
      `${SERVER_BASE}/api/securities/${encodeURIComponent(symbol)}/files`,
      { method: 'POST', body: formData }
    )
  } catch (networkErr) {
    throw new Error(
      `Could not reach the upload server. Check that the Express server is running. (${
        networkErr instanceof Error ? networkErr.message : String(networkErr)
      })`
    )
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(`Storage upload failed (${res.status}): ${body.error ?? res.statusText}`)
  }

  const data = await res.json().catch(() => {
    throw new Error('Upload succeeded but the server returned an unreadable response.')
  }) as { path?: string }

  if (!data.path) {
    throw new Error('Upload succeeded but the server did not return a file path.')
  }

  return data.path
}
