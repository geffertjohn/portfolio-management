import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    /**
     * One React instance, always.
     *
     * This is an npm-workspaces repo, so a transitive dependency can resolve
     * its own copy of React and the app then renders with two — which surfaces
     * as "Invalid hook call … dispatcher is null" at the FIRST hook of whatever
     * component mounts first, pointing at a file that is not the problem.
     * Cheap insurance against a whole class of confusing failure.
     */
    dedupe: ['react', 'react-dom'],
  },
  /**
   * Every dependency, declared up front — this is a correctness fix, not a
   * speed one.
   *
   * Vite's first optimize pass only sees what it can crawl from the entry, and
   * every route here is `lazy()`. So `recharts`, `xlsx` and `jspdf` are first
   * discovered when a lazy page actually loads, which triggers a SECOND
   * optimize pass and a new browser hash — while the page already holds React
   * from the first. Two React instances in one tree, and the dispatcher is
   * null at the first hook of whatever mounted, reported against a file that
   * has nothing to do with it ("Invalid hook call" in Layout, or in
   * PortfolioDetailPage).
   *
   * It only bites on a COLD cache, which is why it looks random: it reappears
   * after a dependency install or a change to this file, and not otherwise.
   * Listing the deps makes the first pass complete, so there is never a second.
   *
   * Anything imported by a lazy page belongs here. The cost of a missing entry
   * is the bug above; the cost of a stale one is nothing.
   */
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      '@supabase/supabase-js',
      'recharts',
      'xlsx',
      'jspdf',
      'jspdf-autotable',
      'pdfjs-dist',
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
