#!/bin/sh
# Bundle the headless importer into a single CommonJS file.
#
# The importers live in client/src/lib and use Vite's "@/" alias, so they cannot
# be run by node directly. Bundling resolves the alias and inlines everything
# except xlsx and supabase-js, which stay external and come from node_modules.
#
# Credentials are NOT baked in — lib/supabase.ts falls back to process.env, so
# the wrapper supplies them at run time from .env.
#
#   build.sh            build from the WORKING TREE — the developer path
#   build.sh main       build from that git ref instead — what refresh.sh uses
#
# WHY A REF AT ALL. The bundle is gitignored, so there is no diff and `git
# status` stays clean while the live importer disagrees with merged source. On
# 2026-11-16 the scheduled refresh rebuilt it mid-merge and produced a bundle
# carrying a defect that had already been fixed on main — it silently reverted
# two hand-corrected columns, and nothing anywhere reported it. Building from a
# named ref makes the importer's provenance a fact rather than an assumption,
# the same discipline the scheduled-job prompts already have by reading
# `git show main:…` rather than the checked-out file.
set -eu

cd "$(dirname "$0")/../.."

REF="${1-}"
SRC=.
TMPTREE=

if [ -n "$REF" ]; then
  # rev-parse --verify so a typo or a missing branch FAILS here rather than
  # silently falling back to the working tree, which is the thing being avoided.
  SHA="$(git rev-parse --verify "$REF^{commit}")"
  TMPTREE="$(mktemp -d)"
  trap 'test -n "$TMPTREE" && rm -rf "$TMPTREE"' EXIT INT TERM
  # Only the two paths the bundle can reach. Nothing outside them is resolvable:
  # every non-"@/" import in this graph is a node builtin or one of the two
  # externals below, so the export needs no node_modules of its own.
  git archive "$SHA" client/src scripts/refresh | tar -x -C "$TMPTREE"
  SRC="$TMPTREE"
fi

npx esbuild "$SRC/scripts/refresh/import-workbook.ts" \
  --bundle \
  --platform=node \
  --format=cjs \
  --target=node20 \
  --alias:@="$SRC/client/src" \
  --external:xlsx \
  --external:@supabase/supabase-js \
  --outfile=scripts/refresh/import-workbook.cjs

# The .rev sidecar is the whole point: it records WHICH COMMIT this bundle was
# built from, so refresh.sh can tell a current bundle from a stale one without
# guessing from mtimes. A working-tree build DELETES it rather than leaving the
# old sha in place — a local build must not be able to pass itself off as main,
# or the next scheduled run accepts it and the 2026-11-16 failure repeats.
if [ -n "$REF" ]; then
  printf '%s\n' "$SHA" > scripts/refresh/import-workbook.rev
  echo "built scripts/refresh/import-workbook.cjs from $REF ($SHA)"
else
  rm -f scripts/refresh/import-workbook.rev
  echo "built scripts/refresh/import-workbook.cjs from the working tree"
fi
