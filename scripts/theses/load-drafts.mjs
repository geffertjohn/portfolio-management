#!/usr/bin/env node
/**
 * load-drafts.mjs — load committee output into `security_theses` as DRAFTS.
 *
 * The AI committee writes two JSON files per ticker into a staging directory:
 *   <TICKER>.research.json   business_description, competitive_position,
 *                            reasons[] each with metrics[], conviction
 *   <TICKER>.bear.json       bear_case[]
 * This merges them, VALIDATES against docs/research-standard.md, and inserts a
 * draft. Nothing is ever published: adoption is the advisor's act, and a
 * published version is immutable, so a bad automated publish would be permanent.
 *
 * Validation rejects the whole ticker rather than loading something that only
 * looks finished — a thesis of record that quietly dropped a break test is
 * worse than one that is obviously missing.
 *
 *   node scripts/theses/load-drafts.mjs <staging-dir> [--dry-run]
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../../.env') })

const dir = process.argv[2]
const dryRun = process.argv.includes('--dry-run')
if (!dir) {
  console.error('usage: node scripts/theses/load-drafts.mjs <staging-dir> [--dry-run]')
  process.exit(1)
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
)

const str = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * The durability rule, mechanised: a durable section must carry no FIGURE and no
 * DATE. Not "no digit" — company names legitimately contain them (L3Harris,
 * Mark43, 3M, P25), and rejecting a named peer set is the opposite of what the
 * standard asks for. So test for the things that actually go stale:
 * money, percentages, fiscal periods, years, and bare standalone numbers.
 */
function digitsIn(text) {
  if (/\$\s?\d/.test(text)) return true                 // $109.2B
  if (/\d\s*%/.test(text)) return true                   // 26.2%
  if (/\bFY\s?\d{2,4}\b/i.test(text)) return true       // FY2025
  if (/\bQ[1-4]\b/.test(text)) return true               // Q3
  if (/\b(?:19|20)\d{2}\b/.test(text)) return true       // 2026
  // A bare number with no letter touching either side — "grew 15 times" — is a
  // figure; one welded into a word is a name.
  return /(^|[^0-9A-Za-z])\d[\d,.]*([^0-9A-Za-z]|$)/.test(text)
}

/**
 * Unknown keys are a REPORTED problem, not a dropped one. `build()` reads a
 * fixed set of fields, so anything else an agent supplies -- a `_sources` list,
 * an `_analyst_notes` block -- vanishes into nothing. Silently discarding part
 * of a thesis of record is exactly the failure this script exists to prevent,
 * so say so and let the operator decide whether it needed folding in first.
 */
function unknownKeys(obj, allowed, where, warns) {
  for (const k of Object.keys(obj ?? {})) {
    if (!allowed.has(k)) warns.push(`${where}: unknown key "${k}" -- build() will not persist it`)
  }
}

const RESEARCH_KEYS = new Set(['security_id', 'business_description', 'competitive_position', 'reasons', 'conviction'])
const REASON_KEYS = new Set(['key', 'title', 'rationale', 'metrics'])
const METRIC_KEYS = new Set(['label', 'metric', 'baseline', 'trend', 'breaks_if', 'context'])
const BEAR_KEYS = new Set(['security_id', 'bear_case', 'conviction'])
const BEAR_POINT_KEYS = new Set(['label', 'metric', 'baseline', 'trend', 'worsens_if', 'breaks_if', 'context'])

function validate(ticker, research, bear) {
  const errs = []
  const warns = []
  unknownKeys(research, RESEARCH_KEYS, 'research', warns)
  unknownKeys(bear, BEAR_KEYS, 'bear', warns)
  const bd = str(research.business_description)
  const cp = str(research.competitive_position)

  if (!bd) errs.push('business_description missing (required to publish)')
  if (bd && digitsIn(bd)) errs.push('business_description contains a digit — durable sections carry no figures')
  if (cp && digitsIn(cp)) errs.push('competitive_position contains a digit — durable sections carry no figures')

  const reasons = Array.isArray(research.reasons) ? research.reasons : []
  if (reasons.length < 3) errs.push(`only ${reasons.length} reasons (expected 3-5)`)

  const seen = new Set()
  reasons.forEach((r, i) => {
    unknownKeys(r, REASON_KEYS, `reason ${i + 1}`, warns)
    const key = str(r.key), title = str(r.title), rationale = str(r.rationale)
    if (!key) errs.push(`reason ${i + 1}: no key`)
    if (seen.has(key)) errs.push(`reason ${i + 1}: duplicate key "${key}"`)
    seen.add(key)
    if (!title) errs.push(`reason ${i + 1}: no title`)
    if (!rationale) errs.push(`reason ${i + 1}: no rationale`)
    if (rationale && digitsIn(rationale)) {
      errs.push(`reason "${title || key}": rationale contains a digit — the figures belong in its metrics`)
    }
    const ms = Array.isArray(r.metrics) ? r.metrics : []
    if (ms.length < 2) errs.push(`reason "${title || key}": ${ms.length} metrics (expected 2-3)`)
    ms.forEach((m, j) => {
      unknownKeys(m, METRIC_KEYS, `reason "${title || key}" metric ${j + 1}`, warns)
      for (const f of ['label', 'metric', 'baseline', 'trend']) {
        if (!str(m[f])) errs.push(`reason "${title || key}" metric ${j + 1}: ${f} missing`)
      }
      if (!str(m.breaks_if)) {
        errs.push(`reason "${title || key}" metric ${j + 1}: breaks_if missing — without it the metric cannot be re-tested`)
      }
    })
  })

  const bears = Array.isArray(bear.bear_case) ? bear.bear_case : []
  if (bears.length < 4) errs.push(`only ${bears.length} bear points (expected 4-6)`)
  bears.forEach((b, i) => {
    unknownKeys(b, BEAR_POINT_KEYS, `bear ${i + 1}`, warns)
    for (const f of ['label', 'metric', 'baseline', 'trend']) {
      if (!str(b[f])) errs.push(`bear ${i + 1}: ${f} missing`)
    }
    if (!str(b.worsens_if) && !str(b.breaks_if)) errs.push(`bear ${i + 1}: worsens_if missing`)
  })

  const conviction = str(research.conviction) || str(bear.conviction)
  if (conviction && !['high', 'medium', 'low'].includes(conviction)) {
    errs.push(`conviction "${conviction}" is not high/medium/low`)
  }
  return { errs, warns }
}

function build(ticker, research, bear) {
  const reasons = research.reasons.map((r) => ({
    key: str(r.key), title: str(r.title), rationale: str(r.rationale),
  }))
  const bull = research.reasons.flatMap((r, ri) =>
    (r.metrics ?? []).map((m, mi) => ({
      key: `${str(r.key)}-m${mi + 1}`,
      reasonKey: str(r.key),
      label: str(m.label), metric: str(m.metric),
      baseline: str(m.baseline), trend: str(m.trend),
      breaksIf: str(m.breaks_if), context: str(m.context),
    })),
  )
  const bears = (bear.bear_case ?? []).map((b, i) => ({
    key: `bear-${i + 1}`,
    reasonKey: null,
    label: str(b.label), metric: str(b.metric),
    baseline: str(b.baseline), trend: str(b.trend),
    breaksIf: str(b.worsens_if) || str(b.breaks_if), context: str(b.context),
  }))
  return {
    security_id: ticker,
    version: 1,
    status: 'draft',
    business_description: str(research.business_description),
    competitive_position: str(research.competitive_position) || null,
    thesis: reasons,
    bull_case: bull,
    bear_case: bears,
    conviction: str(research.conviction) || str(bear.conviction) || null,
  }
}

// Only the two filenames the committee actually writes. Taking everything up to the
// first dot turned an unrelated `HWM-stub-before-replacement.json` sitting in the
// staging directory into a phantom ticker, which then "failed" and set the exit code --
// a clean load reported as a broken one. Notes and backups can live beside the pair.
const PAIR = /^([A-Za-z][A-Za-z0-9.-]*)\.(research|bear)\.json$/
const tickers = [...new Set(
  readdirSync(dir).map((f) => f.match(PAIR)?.[1]).filter(Boolean),
)].sort()

let loaded = 0, skipped = 0, failed = 0
for (const ticker of tickers) {
  const rp = path.join(dir, `${ticker}.research.json`)
  const bp = path.join(dir, `${ticker}.bear.json`)
  let research, bear
  try {
    research = JSON.parse(readFileSync(rp, 'utf8'))
    bear = JSON.parse(readFileSync(bp, 'utf8'))
  } catch (e) {
    console.log(`✗ ${ticker}: ${e.message}`)
    failed++
    continue
  }

  const { errs, warns } = validate(ticker, research, bear)
  for (const w of warns) console.log(`! ${ticker} ${w}`)
  if (errs.length) {
    console.log(`✗ ${ticker} REJECTED (${errs.length})`)
    for (const e of errs) console.log(`    · ${e}`)
    failed++
    continue
  }

  // One live thesis lineage per security; never clobber an existing one.
  const { data: existing, error: exErr } = await supabase
    .from('security_theses').select('id, status').eq('security_id', ticker)
  if (exErr) { console.log(`✗ ${ticker}: ${exErr.message}`); failed++; continue }
  if (existing?.length) {
    console.log(`– ${ticker} skipped — already has ${existing.length} version(s)`)
    skipped++
    continue
  }

  const row = build(ticker, research, bear)
  if (dryRun) {
    console.log(`✓ ${ticker} OK (dry run) — ${row.thesis.length} reasons, ${row.bull_case.length} metrics, ${row.bear_case.length} bear`)
    loaded++
    continue
  }
  const { error } = await supabase.from('security_theses').insert(row)
  if (error) { console.log(`✗ ${ticker}: ${error.message}`); failed++; continue }
  console.log(`✓ ${ticker} — ${row.thesis.length} reasons, ${row.bull_case.length} metrics, ${row.bear_case.length} bear, ${row.conviction ?? 'no'} conviction`)
  loaded++
}

console.log(`\n${loaded} loaded · ${skipped} skipped · ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
