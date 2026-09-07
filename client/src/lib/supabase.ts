import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * The app's single Supabase client.
 *
 * Config comes from Vite in the browser and from `process.env` outside it — the
 * scheduled YCharts refresh on the mini reuses the same `lib/*ExcelUpload.ts`
 * importers from Node, and they reach the DB through this singleton. Without the
 * fallback, importing any lib into a Node script fails at module load.
 *
 * The anon key is the only credential either path needs: RLS is open on these
 * tables, so this is no more privileged than what already ships in the bundle.
 */
function env(key: string): string | undefined {
  // `import.meta.env` is replaced at build time by Vite and is absent in Node.
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return viteEnv?.[key] ?? (typeof process !== 'undefined' ? process.env?.[key] : undefined)
}

const supabaseUrl = env('VITE_SUPABASE_URL')
const supabaseAnonKey = env('VITE_SUPABASE_ANON_KEY')

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
