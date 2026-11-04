import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Test config for the PURE layer only — `src/lib/*.ts`, which is React-free by
 * the project's own layering rule. There is no component or E2E harness here on
 * purpose: the rules this tool rests on live in lib, and they need no DOM.
 *
 * The env block is what makes that possible. `lib/supabase.ts` THROWS at module
 * load when its two vars are missing, so importing any lib that happens to sit
 * in a file with a data-access function would fail before a single pure
 * function ran. These are placeholders pointing nowhere; no test performs I/O,
 * and CI has no `.env` to supply real ones.
 */
export default defineConfig({
  /**
   * Vitest's own cache, kept OUT of the dev server's.
   *
   * Both default to `node_modules/.vite`, so running the suite writes into the
   * directory Vite's dependency optimizer owns. Keeping them apart means a test
   * run can never disturb a running dev server's optimized deps.
   */
  cacheDir: 'node_modules/.vitest',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: {
      /**
       * Pinned, and load-bearing. Gotcha 24 — a `timestamptz` holding a calendar
       * DATE rendering a day early — can only reproduce WEST of Greenwich, so a
       * CI box running in UTC would pass those tests without exercising the bug
       * at all. This is the advisor's own zone.
       */
      TZ: 'America/New_York',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-credential',
      VITE_FMP_API_KEY: 'test-fmp-key-not-a-real-credential',
    },
  },
})
