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
