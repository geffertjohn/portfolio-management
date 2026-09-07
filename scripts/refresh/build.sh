#!/bin/sh
# Bundle the headless importer into a single CommonJS file.
#
# The importers live in client/src/lib and use Vite's "@/" alias, so they cannot
# be run by node directly. Bundling resolves the alias and inlines everything
# except xlsx and supabase-js, which stay external and come from node_modules.
#
# Credentials are NOT baked in — lib/supabase.ts falls back to process.env, so
# the wrapper supplies them at run time from .env.
set -eu

cd "$(dirname "$0")/../.."

npx esbuild scripts/refresh/import-workbook.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --target=node20 \
  --alias:@=./client/src \
  --external:xlsx \
  --external:@supabase/supabase-js \
  --outfile=scripts/refresh/import-workbook.cjs

echo "built scripts/refresh/import-workbook.cjs"
