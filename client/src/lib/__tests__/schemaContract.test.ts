import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isStorablePositionWeight } from '../portfolioAllocations'
import {
  CONVICTION_OPTIONS, OUTCOME_LABELS, OUTCOME_OPTIONS, RECOMMENDATION_LABELS,
  RECOMMENDATION_OPTIONS,
} from '../reviewLog'
import {
  ACTION_LABELS, ACTION_OPTIONS, ANNUAL_DECISION_LABELS, ANNUAL_DECISION_OPTIONS,
  BUSINESS_TREND_LABELS, BUSINESS_TREND_OPTIONS, CONVICTION_LABELS, CONVICTION_TIER_OPTIONS,
  THESIS_STATUS_LABELS, THESIS_STATUS_OPTIONS, VALUATION_LABELS, VALUATION_OPTIONS,
  WATCHLIST_TRIGGER_LABELS, WATCHLIST_TRIGGER_OPTIONS,
} from '../holdingReviews'
import { DECISION_LABELS, DECISION_OPTIONS } from '../securityAdditions'
import { AUDITED_TABLES } from '../auditLog'
import type { Rating, ReportType, ThesisStatus } from '../researchReports'
import type { ImportSource } from '../importRuns'
import { CATEGORY_LABELS, RECURRENCE_LABELS, STATUS_LABELS } from '../actionItems'

/**
 * Does the code still agree with the database?
 *
 * `supabase/schema.sql` is the schema mirrored into git, and CI already enforces
 * that it is regenerated whenever the types are — so it is a current, offline
 * copy of what the live database will accept. These tests read it and compare
 * it against the lists the app writes from and renders with. No connection, no
 * Docker, no credentials: this stays inside the pure-lib convention.
 *
 * It is NOT a substitute for integration tests against a real Postgres — those
 * would also cover FKs, RLS and PostgREST behaviour. It is the cheap half, and
 * it closes the specific failure this repo keeps hitting: a constraint and the
 * code that is supposed to mirror it drifting apart with nothing noticing.
 *
 * Two directions, and they are deliberately different:
 *
 *   OPTIONS ⊆ CHECK — every value the UI can WRITE must be one the database
 *                     accepts, or the save fails at runtime.
 *   LABELS  ⊇ CHECK — every value the database can HOLD must have a label, or
 *                     a stored row renders blank.
 *
 * An OPTIONS list narrower than the CHECK is legitimate and common: a retired
 * value stays permitted so old rows keep their meaning, while the way to record
 * a NEW one is gone. `review_log.outcome` is the standing example.
 */

const SCHEMA = readFileSync(
  fileURLToPath(new URL('../../../../supabase/schema.sql', import.meta.url)),
  'utf8',
)

/** The values a `col = ANY (ARRAY[...])` CHECK constraint permits. */
function checkValues(constraint: string): string[] {
  const m = SCHEMA.match(
    new RegExp(`CONSTRAINT "${constraint}" CHECK \\(([^;]*?)\\)\\),?\\n`, 's'),
  )
  if (!m) throw new Error(`constraint ${constraint} is not in supabase/schema.sql`)
  const vals = [...m[1].matchAll(/'([^']*)'::"text"/g)].map((v) => v[1])
  if (vals.length === 0) throw new Error(`constraint ${constraint} is not a value list`)
  return vals
}

/** The raw body of any CHECK constraint, for the non-enum ones. */
function checkBody(constraint: string): string {
  const m = SCHEMA.match(new RegExp(`CONSTRAINT "${constraint}" CHECK \\(([^;]*?)\\)\\),?\\n`, 's'))
  if (!m) throw new Error(`constraint ${constraint} is not in supabase/schema.sql`)
  return m[1]
}

/** What the UI can write, against what the database accepts. */
const WRITES: Array<[string, string, readonly (string | number)[]]> = [
  ['review_log.recommendation',       'review_log_recommendation_check',        RECOMMENDATION_OPTIONS],
  ['review_log.outcome',              'review_log_outcome_check',               OUTCOME_OPTIONS],
  ['holding_reviews.thesis_status',   'holding_reviews_thesis_status_check',    THESIS_STATUS_OPTIONS],
  ['holding_reviews.business_trend',  'holding_reviews_business_trend_check',   BUSINESS_TREND_OPTIONS],
  ['holding_reviews.valuation',       'holding_reviews_valuation_check',        VALUATION_OPTIONS],
  ['holding_reviews.action',          'holding_reviews_action_check',           ACTION_OPTIONS],
  ['holding_reviews.annual_decision', 'holding_reviews_annual_decision_check',  ANNUAL_DECISION_OPTIONS],
  ['holding_reviews.watchlist_trigger', 'holding_reviews_watchlist_trigger_check', WATCHLIST_TRIGGER_OPTIONS],
  ['holding_reviews.conviction',      'holding_reviews_conviction_check',       Object.keys(CONVICTION_LABELS)],
  ['security_additions.decision',     'security_additions_decision_check',      DECISION_OPTIONS],
  ['research_reports.conviction',     'research_reports_conviction_check',      CONVICTION_OPTIONS],
]

/** What the database can hold, against what the UI can render. */
const RENDERS: Array<[string, string, Record<string, unknown>]> = [
  ['review_log.recommendation',       'review_log_recommendation_check',       RECOMMENDATION_LABELS],
  ['review_log.outcome',              'review_log_outcome_check',              OUTCOME_LABELS],
  ['holding_reviews.thesis_status',   'holding_reviews_thesis_status_check',   THESIS_STATUS_LABELS],
  ['holding_reviews.business_trend',  'holding_reviews_business_trend_check',  BUSINESS_TREND_LABELS],
  ['holding_reviews.valuation',       'holding_reviews_valuation_check',       VALUATION_LABELS],
  ['holding_reviews.action',          'holding_reviews_action_check',          ACTION_LABELS],
  ['holding_reviews.annual_decision', 'holding_reviews_annual_decision_check', ANNUAL_DECISION_LABELS],
  ['holding_reviews.watchlist_trigger', 'holding_reviews_watchlist_trigger_check', WATCHLIST_TRIGGER_LABELS],
  ['holding_reviews.conviction',      'holding_reviews_conviction_check',      CONVICTION_LABELS],
  ['security_additions.decision',     'security_additions_decision_check',     DECISION_LABELS],
  ['action_items.category',           'action_items_category_check',           CATEGORY_LABELS],
  ['action_items.status',             'action_items_status_check',             STATUS_LABELS],
  ['action_items.recurrence',         'action_items_recurrence_check',         RECURRENCE_LABELS],
]

describe('the schema snapshot is usable', () => {
  it('is present and is the real dump', () => {
    expect(SCHEMA.length).toBeGreaterThan(10_000)
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS "public"."positions"')
  })
})

describe('every value the UI can write, the database accepts', () => {
  it.each(WRITES)('%s', (_label, constraint, options) => {
    const allowed = new Set(checkValues(constraint))
    const rejected = options.filter((o) => !allowed.has(String(o)))
    expect(rejected, `would be rejected by ${constraint}`).toEqual([])
  })
})

describe('every value the database can hold, the UI can render', () => {
  it.each(RENDERS)('%s', (_label, constraint, labels) => {
    const unlabelled = checkValues(constraint).filter((v) => !(v in labels))
    expect(unlabelled, `would render blank — add to the labels map`).toEqual([])
  })
})

describe('numeric guards match the constraint they stand in for', () => {
  /**
   * The specific drift this file was written for. `positions.allocation_pct` is
   * constrained 0–100 and `portfolio_allocations.weight` is not constrained at
   * all, so the History grid can hold a weight the Positions table will reject.
   * `isStorablePositionWeight` refuses it up front — and has to keep agreeing
   * with the constraint it is standing in for.
   */
  it('isStorablePositionWeight agrees with positions_allocation_pct_check', () => {
    const body = checkBody('positions_allocation_pct_check')
    const bounds = [...body.matchAll(/\(([-\d.]+)\)::"?numeric"?/g)].map((m) => Number(m[1]))
    expect(bounds, 'expected a two-sided numeric range').toHaveLength(2)
    const [lo, hi] = [Math.min(...bounds), Math.max(...bounds)]

    expect(isStorablePositionWeight(lo)).toBe(true)
    expect(isStorablePositionWeight(hi)).toBe(true)
    expect(isStorablePositionWeight(lo - 0.01)).toBe(false)
    expect(isStorablePositionWeight(hi + 0.01)).toBe(false)
  })

  it('conviction tiers 1–4 are the four the UI offers', () => {
    const body = checkBody('holding_reviews_conviction_tier_check')
    const bounds = [...body.matchAll(/>= (\d+)|<= (\d+)/g)].map((m) => Number(m[1] ?? m[2]))
    expect([...CONVICTION_TIER_OPTIONS]).toEqual([bounds[0], 2, 3, bounds[1]])
  })
})

describe('the process document is append-only', () => {
  /**
   * `process_documents` carries no `log_audit` trigger: its VERSION LINEAGE is
   * the audit record, and that only holds while adopted versions are immutable.
   * Drop this trigger and the table silently becomes an editable blob with a
   * version number on it — which would read as an audit trail while being none.
   */
  it('still has its append-only trigger', () => {
    expect(SCHEMA).toContain('CREATE OR REPLACE TRIGGER "process_documents_append_only"')
  })

  it('still refuses to adopt an empty document', () => {
    // The committee reads the adopted row; an empty one would be a standard
    // that says nothing while reading as a standard that exists.
    expect(SCHEMA).toContain('process_documents_published_is_complete')
  })
})

describe('the invariants enforced by a partial unique index still exist', () => {
  /**
   * Each of these IS a documented rule rather than an optimisation, so dropping
   * one silently re-opens the defect it was added for. Named, not counted, so
   * the failure says which rule went.
   */
  const INDEXES: Array<[string, string]> = [
    ['one pre-earnings brief per call',        'research_reports_one_pre_per_period'],
    ['one post-earnings brief per pre-brief',  'research_reports_one_post_per_parent'],
    ['one draft thesis per security',          'security_theses_one_draft'],
    ['one adopted thesis per security',        'security_theses_one_current'],
    ['one live watchlist idea per ticker',     'prospects_active_security_key'],
    ['one open portfolio review per cadence',  'portfolio_review_log_one_draft'],
    ['one open candidate per ticker',          'security_additions_one_draft'],
    ['one unacknowledged at-risk alert',       'alert_events_one_live_at_risk'],
    ['one draft process document',             'process_documents_one_draft'],
    ['one adopted process document',           'process_documents_one_current'],
  ]

  it.each(INDEXES)('%s', (_rule, index) => {
    expect(SCHEMA).toContain(`CREATE UNIQUE INDEX "${index}"`)
  })
})

/**
 * Some domain types are a bare TS union with no runtime list to compare, so
 * nothing ties them to the database at all. `Exhaustive` closes the loop in
 * three places at once: `tsc` fails if the UNION gains a member the literal
 * below omits, and the test fails if the DATABASE and the literal disagree.
 *
 * `research_reports.report_type` is the reason this is worth the few lines —
 * its `pre_earnings` value was renamed from `earnings_review` across 30 rows,
 * exactly the kind of change that lands in one place and not the other.
 */
type Exhaustive<Union extends string, Listed extends string> =
  Exclude<Union, Listed> extends never ? readonly Listed[] : never

const RATING_VALUES: Exhaustive<Rating, 'buy' | 'add' | 'hold' | 'trim' | 'sell'> =
  ['buy', 'add', 'hold', 'trim', 'sell'] as const
const REPORT_TYPE_VALUES: Exhaustive<ReportType, 'initial' | 'pre_earnings' | 'post_earnings' | 'update'> =
  ['initial', 'pre_earnings', 'post_earnings', 'update'] as const
const THESIS_STATUS_VALUES: Exhaustive<ThesisStatus, 'intact' | 'at_risk' | 'broken'> =
  ['intact', 'at_risk', 'broken'] as const
// Five since Nov 2026, when the Holdings sheet got its own source. It was
// four, and CLAUDE.md said six until this test was written — the six-card
// import page collapsed to two in Sep 2026 and the prose did not follow.
const IMPORT_SOURCE_VALUES: Exhaustive<
  ImportSource,
  'ycharts_benchmarks' | 'ycharts_funds' | 'ycharts_portfolios' | 'ycharts_allocations' | 'ycharts_holdings'
> = [
  'ycharts_benchmarks', 'ycharts_funds', 'ycharts_portfolios', 'ycharts_allocations',
  'ycharts_holdings',
] as const

describe('a bare type union still matches its constraint exactly', () => {
  it.each([
    ['research_reports.rating',        'research_reports_rating_check',      RATING_VALUES],
    ['research_reports.report_type',   'research_reports_report_type_check', REPORT_TYPE_VALUES],
    ['research_reports.thesis_status', 'research_reports_thesis_status_check', THESIS_STATUS_VALUES],
    ['import_runs.source',             'import_runs_source_check',           IMPORT_SOURCE_VALUES],
  ] as const)('%s', (_label, constraint, values) => {
    expect([...checkValues(constraint)].sort()).toEqual([...values].sort())
  })
})

/**
 * The committee's write API.
 *
 * The scheduled jobs run under launchd with a tool allowlist that excludes
 * Bash, so their only write channel is Supabase SQL — these functions ARE the
 * guard on everything the committee writes. A dropped one, or a table quietly
 * removed from the allowlist, takes the validation with it and nothing else
 * would notice; the prompts would keep calling and start failing at 07:25.
 */
describe('the committee write API still exists', () => {
  it.each([
    ['insert one row, validated',        'committee_insert'],
    ['update one row, raising on no-op', 'committee_update'],
    ['the payload validator',            'committee_check_payload'],
    ['the table allowlist',              'committee_writable_tables'],
    ['open a heartbeat',                 'job_run_open'],
    ['close a heartbeat',                'job_run_close'],
  ])('%s', (_what, fn) => {
    expect(SCHEMA).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION "public"\\."${fn}"`, 'i'))
  })

  /**
   * A function's text runs from its CREATE header to the ALTER FUNCTION line
   * the dump emits after it. Not to the closing `$$`: pg_dump re-quotes a body
   * that already contains `$$` with a different tag, so anchoring on `$$;`
   * silently matched only some of them.
   */
  const bodyOf = (fn: string): string => {
    const start = SCHEMA.indexOf(`CREATE OR REPLACE FUNCTION "public"."${fn}"`)
    if (start < 0) return ''
    const end = SCHEMA.indexOf(`ALTER FUNCTION "public"."${fn}"`, start)
    return SCHEMA.slice(start, end < 0 ? start + 4000 : end)
  }

  it('still permits every table the jobs write', () => {
    // Each of these is written by at least one prompt. Dropping one from the
    // allowlist does not fail a build — it fails a 07:25 run.
    const allowlist = bodyOf('committee_writable_tables')
    expect(allowlist).not.toBe('')
    for (const t of ['research_reports', 'risk_reports', 'ic_memos', 'job_runs', 'alert_events', 'at_risk',
                     'portfolio_review_memos']) {
      expect(allowlist, t).toContain(`'${t}'`)
    }
  })

  it('is SECURITY INVOKER, never DEFINER', () => {
    // These validate and report; they are not a way around a missing RLS
    // policy. DEFINER would turn the write API into a privilege escalation.
    const names = ['committee_check_payload', 'committee_insert', 'committee_update',
                   'committee_writable_tables', 'committee_generated_columns',
                   'job_run_open', 'job_run_close']
    for (const fn of names) {
      const body = bodyOf(fn)
      expect(body, fn).not.toBe('')
      expect(body, fn).not.toMatch(/SECURITY DEFINER/i)
    }
  })
})

/**
 * Two objects were filed as dead schema on 3 Nov 2026 and both findings were
 * wrong. They are pinned here because the mistake is cheap to repeat: in each
 * case the evidence for "dead" was a count, and the count was real.
 */
/**
 * `AUDITED_TABLES` must name exactly the tables a `log_audit` trigger fires on.
 *
 * **It had drifted BOTH ways** and nothing noticed. It listed `positions`,
 * which is not a `log_audit` table at all — its `positions_audit` trigger runs
 * `log_position_change()` into `holdings_change_log` — so filtering the audit
 * page by it could only ever return nothing. And it omitted
 * `firm_compliance_rules`, which carries a real trigger and eleven rows that
 * were reachable only under "All". A filter that silently returns nothing is
 * the worst shape for this list: the page looks like it worked.
 *
 * Both directions, because they fail differently. A table in the list with no
 * trigger is an empty filter; a trigger whose table is missing from the list is
 * a record nobody can find.
 */
describe('the audit-log table list matches the triggers', () => {
  /** Every table `log_audit` is wired to, read out of the schema snapshot. */
  const TRIGGERED = [...SCHEMA.matchAll(
    /CREATE (?:OR REPLACE )?TRIGGER "[^"]+"[^\n]*? ON "public"\."([^"]+)"[^\n]*?EXECUTE FUNCTION "public"\."log_audit"\(\)/gi,
  )].map((m) => m[1])

  it('found the triggers at all', () => {
    // Guards the guard: a regex that matches nothing would make both
    // assertions below vacuously true.
    expect(new Set(TRIGGERED).size).toBeGreaterThanOrEqual(10)
  })

  it('every audited table named in code has a trigger', () => {
    const missing = AUDITED_TABLES.filter((t) => !TRIGGERED.includes(t))
    expect(missing, 'listed in AUDITED_TABLES but nothing logs it').toEqual([])
  })

  it('every table with a trigger is named in code', () => {
    const unlisted = [...new Set(TRIGGERED)].filter(
      (t) => !(AUDITED_TABLES as readonly string[]).includes(t),
    )
    expect(unlisted, 'logged by log_audit but missing from AUDITED_TABLES').toEqual([])
  })

  // The asymmetry worth stating: securities2 carries TWO triggers (a
  // conditional update and an unconditional insert/delete) and one entry.
  it('counts a table once however many triggers it carries', () => {
    expect(TRIGGERED.filter((t) => t === 'securities2').length).toBe(2)
    expect(AUDITED_TABLES.filter((t) => t === 'securities2').length).toBe(1)
  })
})

describe('securities2 joins the audit log for DECISIONS only', () => {
  /**
   * Added Nov 2026 so a hand-set classification leaves a trail. It is the one
   * `log_audit` table whose trigger is CONDITIONAL, and that is the whole
   * design: `securities2` is 93 columns wide and 59 of its 102 rows are
   * rewritten on a normal day by the YCharts workbook and
   * `refreshSecurityFromFMP`. Logging every write would add ~199 MB a year to
   * a 2 MB `audit_log` and bury a governed edit roughly one row in 1,800 —
   * the "signal that cries wolf" failure this codebase has already paid for
   * with `never_run` and "AI research pending".
   *
   * Pinned because the easy future mistake is to "make it consistent with the
   * other nine" by replacing the pair with one unconditional trigger, which
   * would reintroduce exactly that.
   */

  it('logs every INSERT and DELETE unconditionally', () => {
    // A security entering or leaving the universe is a fact worth keeping
    // whatever column carried it.
    expect(SCHEMA).toMatch(
      /CREATE (OR REPLACE )?TRIGGER "audit_securities2_ins_del" AFTER INSERT OR DELETE ON "public"\."securities2"/i,
    )
  })

  it('logs an UPDATE only when a GOVERNED column changes value', () => {
    const trigger = SCHEMA.split('\n').find((l) => l.includes('"audit_securities2_update"')) ?? ''
    expect(trigger, 'the conditional update trigger must exist').toBeTruthy()
    expect(trigger).toMatch(/AFTER UPDATE ON "public"\."securities2"/i)
    // WHEN, not a bare AFTER UPDATE — without it the workbook's daily rewrite
    // of the return columns would log 46 rows a day.
    expect(trigger).toMatch(/\bWHEN\b/i)
    for (const col of [
      'category_name',
      'preferred_benchmark1_id', 'preferred_benchmark2_id',
      'scorecard_cohort',
      'alt_1', 'alt_2', 'alt_3',
    ]) {
      expect(trigger, `${col} must be a logged decision`).toContain(`"${col}"`)
    }
  })

  it('compares with IS DISTINCT FROM, so a null-to-value edit still logs', () => {
    // These columns are all nullable, and setting one for the FIRST time is
    // exactly the manual category edit the trigger was added to record. `<>`
    // would return null there and the write would go unlogged.
    const trigger = SCHEMA.split('\n').find((l) => l.includes('"audit_securities2_update"')) ?? ''
    expect(trigger).toMatch(/IS DISTINCT FROM/i)
    expect(trigger).not.toMatch(/"old"\."category_name" <> /i)
  })

  it('does NOT log the vendor columns the workbook rewrites daily', () => {
    const trigger = SCHEMA.split('\n').find((l) => l.includes('"audit_securities2_update"')) ?? ''
    for (const col of [
      'one_month_total_return_nav', 'ytd_total_return_nav', 'one_year_total_return_nav',
      'expense_ratio_generic', 'security_name', 'long_description',
      'last_earnings_release', 'next_earnings_release',
    ]) {
      expect(trigger, `${col} is vendor data, not a decision`).not.toContain(`"${col}"`)
    }
  })
})

describe('the objects that only LOOK dead', () => {
  it('keeps holdings_change_log, which a trigger on positions still writes', () => {
    // Filed as "208 rows, zero readers — archive and drop". It has no reader,
    // but it does have a writer: positions_audit -> log_position_change(),
    // AFTER INSERT OR UPDATE OR DELETE on positions, appending since Apr 2026.
    // Dropping the table would make every write to positions fail, which is
    // every allocation import and every History grid edit.
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS "public"."holdings_change_log"')
    expect(SCHEMA).toMatch(
      /CREATE (OR REPLACE )?TRIGGER "positions_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"\."positions"/i,
    )
    expect(SCHEMA).toMatch(/EXECUTE FUNCTION "public"\."log_position_change"/i)
    expect(SCHEMA).toMatch(/INSERT INTO holdings_change_log/i)
  })

  it('keeps the 3y/5y block on portfolio, which is pre-inception and not dead', () => {
    // Filed as ">=18 of 147 columns all-null and unreferenced". 25 of the 26
    // all-null columns are 3-year or 5-year metrics, and the oldest of the 19
    // models is 2.5 years old -- while every ONE-year sibling is populated on
    // 18 of 19. The workbook carries the whole block; there is simply no
    // three-year figure yet. They start filling in Apr 2027.
    //
    // Dropping them would delete the landing place for that data AND break the
    // next workbook import, because the importers map sheet header straight to
    // DB column with no whitelist (gotcha 7).
    const start = SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS "public"."portfolio"')
    expect(start).toBeGreaterThan(-1)
    const ddl = SCHEMA.slice(start, SCHEMA.indexOf(');', start))
    for (const col of [
      'annualized_three_year_total_return', 'annualized_five_year_total_return',
      'annualized_ten_year_total_return', 'historical_sharpe_3y', 'historical_sharpe_5y',
      'historical_sortino_3y', 'max_drawdown_3y', 'max_drawdown_5y', 'tracking_error_3y',
      'upside_downside_3y', 'market_alpha_36_month', 'quarterly_market_beta_36_month',
      'monthly_standard_deviation_annualized_3y', 'best_return_three_year',
      'worst_return_three_year',
    ]) {
      expect(ddl, col).toContain(`"${col}"`)
    }
    // ...and the one-year siblings that prove the block is live, not dead.
    for (const col of ['historical_sharpe_1y', 'max_drawdown_1y', 'market_alpha_12_month']) {
      expect(ddl, col).toContain(`"${col}"`)
    }
  })

  it('has actually dropped the three objects that WERE dead', () => {
    // alert_rules (0 rows, no reader, no writer) and the FK column whose only
    // meaning was pointing at it; portfolio.next_rebalance_date (null on all
    // 19, its only writer uncalled). alert_events itself SURVIVES.
    expect(SCHEMA).not.toContain('"public"."alert_rules"')
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS "public"."alert_events"')
    const ae = SCHEMA.slice(
      SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS "public"."alert_events"'),
      SCHEMA.indexOf(');', SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS "public"."alert_events"')),
    )
    expect(ae).not.toContain('"rule_id"')
    expect(ae).toContain('"threshold_value"')  // kept: an alert still has a number
    const pf = SCHEMA.slice(
      SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS "public"."portfolio"'),
      SCHEMA.indexOf(');', SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS "public"."portfolio"')),
    )
    expect(pf).not.toContain('"next_rebalance_date"')
    expect(pf).toContain('"last_rebalance_date"')  // populated, left alone
  })
})

describe('the seed trigger does not create the collision the app then has to dodge', () => {
  /**
   * `advanceSchedule` keeps a monthly off a quarterly or annual date, but that
   * rule only runs when a review is COMPLETED. A portfolio's FIRST set of
   * dates comes from this trigger, so a seed that collides is a collision
   * nothing will clear until the advisor completes something.
   *
   * This is the exact defect #90 found: quarterly and annual were both seeded
   * at now(), so all 19 portfolios were born colliding. Monthly was then
   * seeded at now() too, which put every new Equity book on the quarterly's
   * own day. Pinned here rather than restated in prose, because prose did not
   * stop it the first time.
   */
  const seedFn = (() => {
    const m = /FUNCTION "public"\."seed_portfolio_review_schedules"\(\)[\s\S]*?\$\$([\s\S]*?)\$\$;/
      .exec(SCHEMA)
    return m?.[1] ?? ''
  })()

  it('is present in the snapshot', () => {
    // Guards the guard: an empty match would pass every assertion below.
    expect(seedFn).toContain('portfolio_review_schedules')
    expect(seedFn).toContain("'Equity'")
  })

  it('seeds the monthly at an OFFSET, never at the quarterly instant', () => {
    // To END OF LINE, not to the first ')' — that one sits inside `now()`,
    // so a `[^)]*` capture reads " now(" and the assertion fails on a seed
    // that is actually correct.
    const monthly = /values \(new\.name, 'monthly',([^\n]*)/.exec(seedFn)?.[1] ?? ''
    expect(monthly, 'the monthly seed line should still be there').not.toBe('')
    expect(monthly, "a bare now() puts the monthly on the quarterly's own day")
      .toMatch(/now\(\)\s*\+\s*interval/)
  })

  it('still seeds the quarterly and the annual apart', () => {
    expect(seedFn).toMatch(/'quarterly', now\(\)/)
    expect(seedFn).toMatch(/'annual',\s*now\(\) \+ interval '9 months'/)
  })

  it('still gives a monthly row to Equity books only', () => {
    const guard = seedFn.indexOf("new.portfolio_strategy = 'Equity'")
    const monthlyAt = seedFn.indexOf("'monthly'")
    expect(guard).toBeGreaterThan(-1)
    expect(monthlyAt, 'the monthly insert must sit INSIDE the Equity guard')
      .toBeGreaterThan(guard)
  })
})

describe('the parser itself', () => {
  it('fails loudly on a constraint that is not there', () => {
    // Otherwise a renamed constraint would quietly stop being checked.
    expect(() => checkValues('no_such_constraint')).toThrow(/not in supabase\/schema.sql/)
  })

  it('refuses to read a non-enum constraint as a value list', () => {
    expect(() => checkValues('positions_allocation_pct_check')).toThrow(/not a value list/)
  })
})
