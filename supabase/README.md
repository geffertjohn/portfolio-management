# Supabase

**The live Supabase database is the source of truth for the schema — not this directory.**

All schema changes are applied through the Supabase MCP `apply_migration` path (see
`CLAUDE.md` → "DDL vs DML via Supabase MCP") and are tracked in the project's remote
migration history. As of 2026-06-29 the remote history holds these 25 migrations:

```
20260526175057  add_partial_indexes_and_missing_fk_indexes
20260526175100  add_missing_updated_at_triggers
20260526175244  enable_rls_open_policies_all_tables
20260526175249  fix_non_security_integer_to_bigint_fks
20260526175546  cleanup_safe_duplicate_indexes_trigger_peer_group_pk_v2
20260526175728  standardize_security_fks_to_text
20260527172533  audit_firm_compliance_rules
20260528135146  add_stock_benchmark_preferences
20260528152021  deduplicate_category_benchmarks
20260529190425  add_3yr_growth_generic_to_benchmarks
20260529191336  drop_category_benchmarks_ticker_only_unique
20260529213957  add_review_date_to_review_log
20260602163450  add_alternatives_to_securities2
20260608184714  add_review_schedules_security_id_unique
20260616211023  add_is_comparison_only_to_securities2
20260617180414  restore_securities2_id_default
20260617184608  drop_dead_benchmarks_table
20260617200237  drop_writeonly_stock_metric_columns
20260617200922  drop_remaining_writeonly_stock_columns
20260617202645  create_fund_alternatives_table
20260625195625  review_log_add_recommendation
20260625202026  rename_watchlist_to_at_risk
20260625202040  create_prospects_watchlist
20260625204726  add_securities2_thesis
20260626190637  create_portfolio_allocations
```

## Generated types

The live schema is mirrored as TypeScript in **`client/src/types/database.types.ts`**,
which **is wired into the Supabase client** (`client/src/lib/supabase.ts` uses
`createClient<Database>`), so column/table mismatches are caught at compile time.
Regenerate after any schema change via the Supabase MCP `generate_typescript_types`
tool, or:

```
supabase gen types typescript --project-id oulahvazpuzfqxudmfef > client/src/types/database.types.ts
```

## `archive/`

Historical, **non-authoritative** SQL kept for reference only. These are the pre-MCP
hand-written scripts that document how the schema evolved (mostly `securities2` column
adds, the `portfolio` table, storage policies, benchmark indexes). They are superseded
by the remote migrations above and must not be replayed as a schema rebuild.
`archive/data/` holds one-off data loads.

Definitively-dead scripts (operating on the dropped `securities` / `benchmarks` /
`ychart_benchmarks` tables, one-off `fix_*`/`clean_*`/`find_*` repairs, and the obsolete
`seed_*_positions` files superseded by the `portfolio_allocations` table) were removed —
recover them from git history if ever needed.

## `.temp/`

Supabase CLI local state — gitignored.
