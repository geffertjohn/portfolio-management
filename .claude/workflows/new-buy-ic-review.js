/**
 * new-buy-ic-review — the AI investment team's new-buy Investment Committee run.
 *
 * Full committee (default):
 *   Research analyst + Devil's advocate + Quant analyst (parallel, independent)
 *      → Portfolio manager (sizing)
 *      → Risk manager + Compliance/IPS officer (parallel, control gate)
 *      → IC memo synthesis  → returned to the orchestrator
 *
 * Pass args.lean = true for the original 4-role committee (no Quant, no Compliance) —
 * cheaper and faster.
 *
 * RUN (opt-in, from the orchestrator/main loop):
 *   Workflow({ scriptPath: '.../new-buy-ic-review.js',
 *              args: { ticker: 'GLW', portfolioName: 'Core Growth', additionId: 3 } })   // full
 *   Workflow({ ..., args: { ticker: 'X', portfolioName: 'Y', additionId: Z, lean: true } }) // lean
 *
 * Role instructions are inlined here (the workflow agent() registry doesn't resolve the
 * .claude/agents/*.md types; those files remain the source for direct Agent-tool use).
 * PERSISTENCE is done by the orchestrator AFTER the run (docs/ai-investment-team-charter.md §5):
 *   research/bear -> research_reports (author_role research_analyst / devils_advocate)
 *   quant         -> research_reports (author_role 'quant_analyst')
 *   risk          -> risk_reports (scope candidate)
 *   compliance    -> folded into the ic_memo rationale (no dedicated table yet)
 *   memo          -> ic_memos (status pending_cio)
 * No writes happen inside the workflow.
 *
 * args: { ticker: string, portfolioName?: string, additionId?: number, lean?: boolean }
 */
export const meta = {
  name: 'new-buy-ic-review',
  description: 'Run the new-buy Investment Committee for one ticker and synthesize an IC memo',
  phases: [
    { title: 'Research', detail: 'analyst + devil\'s advocate + quant, independent & parallel' },
    { title: 'Construct', detail: 'portfolio manager proposes a target weight' },
    { title: 'Control', detail: 'risk manager (pass/warn/veto) + compliance/IPS' },
    { title: 'Synthesize', detail: 'compose the IC memo' },
  ],
}

// args may arrive as an object or a JSON string depending on the caller — normalize.
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch { A = {} } }
A = A || {}
const ticker = (A.ticker ? String(A.ticker) : '').toUpperCase()
const portfolioName = A.portfolioName || null
const additionId = A.additionId ?? null
const lean = A.lean === true
if (!ticker) throw new Error('new-buy-ic-review requires args.ticker')

const FMP_NOTE =
  'Data: use the FMP MCP tools (load via ToolSearch — e.g. statements, discountedCashFlow, ' +
  'earningsTranscript, analyst, company, news, quote) and WebSearch/WebFetch. Cite external sources. ' +
  'For class tickers use the hyphen form on FMP (BRK.B -> BRK-B). These are GAAP figures.'

const ANALYST_ROLE =
  'You are a sector-aware equity RESEARCH ANALYST on an AI investment team; the human CIO makes the final ' +
  'call. Determine whether the business should be owned: identify the company/segments, assess fundamentals ' +
  '(growth, margins, ROIC, balance sheet, cash flow) and management, and estimate FAIR VALUE with a DCF or ' +
  'multiples — state every key assumption. Your fair value is a documented estimate, not a precise number. ' +
  'Give 2-4 concrete thesis reasons, a rating (buy/add/hold/trim/sell) and conviction (high/medium/low), and ' +
  'state what must be true for the thesis to work plus the single biggest risk. Recommend-only: never trade ' +
  'or modify positions. ' + FMP_NOTE

const BEAR_ROLE =
  'You are the RED TEAM / devil\'s advocate on an AI investment team. Build the strongest possible case ' +
  'AGAINST buying this security. Research INDEPENDENTLY from primary data — do not rely on any bull summary. ' +
  'Hunt for thesis-breakers, deteriorating fundamentals, valuation risk, competitive/secular threats, and ' +
  'management/capital-allocation red flags; describe the downside scenario with rough probability and ' +
  'magnitude. Default toward KILL when the evidence is ambiguous, but build only the strongest REAL bear ' +
  'case — if it is genuinely weak, say so. Recommend-only: never trade. ' + FMP_NOTE

const QUANT_ROLE =
  'You are the QUANTITATIVE ANALYST on an AI investment team — the systematic, data-first lens that ' +
  'complements (does not duplicate) the fundamental analyst. Produce a systematic screen: valuation ' +
  'percentiles vs the name\'s own history and its sector, momentum (3/6/12-mo price + estimate-revision ' +
  'direction), volatility/beta/max-drawdown, quality (ROIC/ROE, margin stability, leverage, FCF conversion), ' +
  'and — most importantly — CORRELATION/overlap with the portfolio\'s existing large positions and themes ' +
  '(flag redundancy the fundamental lens misses). Also compare the candidate to the portfolio\'s EXISTING ' +
  'holdings in its sector/theme — does it screen better or worse than those incumbents on ' +
  'valuation/quality/momentum (the input the PM needs to decide whether adding is worth displacing what is ' +
  'owned)? Be explicit about data limits; do not over-fit noise. Recommend-only: never trade. ' + FMP_NOTE

const PM_ROLE =
  'You are a PORTFOLIO MANAGER (capital allocator, not a stock picker) on an AI investment team. Given the ' +
  'research, bear case, and quant screen plus the portfolio\'s positions and model bands, propose a TARGET ' +
  'WEIGHT and explain the sizing. Reference: conviction high 4-5%, medium 2-4%, low 1-2%; adjust for ' +
  'volatility, liquidity, and correlation with existing holdings; respect the model\'s position/cash bands ' +
  'and flag any breach; state the funding source. Read positions/model bands read-only via the Supabase MCP ' +
  'if available, else reason from the context you are given. Recommend-only: never execute, never write ' +
  'positions/allocations. Construction is RELATIVE, not standalone: use model_portfolio_data (style/asset-class ' +
  'targets + bands, conviction tiers, equity/cash bands) with the current positions to place the candidate in ' +
  'its sector, read the book\'s CURRENT allocation to that sector, and run the opportunity-cost test — if the ' +
  'sector is already well-served, is the candidate clearly better than the marginal existing name it would ' +
  'displace? A high-merit stock can still be watchlist/reject when maintaining the existing holdings is the ' +
  'better allocation; say so and name the incumbents. If a sensible size would breach the mandate, recommend ' +
  'watchlist or reject.'

const RISK_ROLE =
  'You are the RISK MANAGER on an AI investment team — a control gate before the CIO. Assess what could hurt ' +
  'the portfolio if this candidate is added at the proposed weight: concentration (position and sector), ' +
  'factor exposure (growth/value, size, quality, rate sensitivity, beta), and every mandate/limit (single-name ' +
  'cap, sector cap, cash floor, strategy fit) with an explicit pass/fail each; stress it in a reasonable ' +
  'downside. Return a verdict: pass (no material issue), warn (acceptable with stated caveats), or veto ' +
  '(hard-limit breach or unacceptable risk — name the specific reason). Recommend-only: never trade.'

const COMPLIANCE_ROLE =
  'You are the COMPLIANCE / IPS-SUITABILITY officer on an AI investment team; this firm exists for audit ' +
  'defense, so your check must be documented well enough to defend later. Given the proposed buy and the ' +
  'portfolio\'s mandate/model, determine suitability: mandate fit (strategy/objective), IPS suitability (risk ' +
  'tolerance, permitted asset classes, restrictions, liquidity/horizon), concentration/limits (coordinate ' +
  'with risk — do not contradict a hard veto), and whether the documentation on file is sufficient for audit. ' +
  'Return suitable / caution (suitable with caveats) / unsuitable, with per-check pass/fail and notes. If no ' +
  'IPS data is available, say so explicitly and check against the model mandate only. Recommend-only: never trade.'

const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: true,
  properties: {
    thesis: { type: 'string' },
    bull_case: { type: 'string' },
    rating: { type: 'string', enum: ['buy', 'add', 'hold', 'trim', 'sell'] },
    conviction: { type: 'string', enum: ['high', 'medium', 'low'] },
    fair_value: { type: ['number', 'null'] },
    current_price: { type: ['number', 'null'] },
    valuation_summary: { type: 'object', additionalProperties: true },
    key_risk: { type: 'string' },
    sources: {
      type: 'array',
      items: { type: 'object', additionalProperties: true, properties: { title: { type: 'string' }, url: { type: 'string' } } },
    },
  },
  required: ['thesis', 'bull_case', 'rating'],
}

const BEAR_SCHEMA = {
  type: 'object', additionalProperties: true,
  properties: {
    bear_case: { type: 'string' },
    recommendation: { type: 'string', enum: ['kill', 'keep'] },
    top_reason: { type: 'string' },
    downside: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  required: ['bear_case', 'recommendation', 'top_reason'],
}

const QUANT_SCHEMA = {
  type: 'object', additionalProperties: true,
  properties: {
    screen_verdict: { type: 'string', enum: ['attractive', 'neutral', 'unattractive'] },
    factor_scores: { type: 'object', additionalProperties: true },
    correlation_note: { type: 'string' },
    notes: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  required: ['screen_verdict', 'notes'],
}

const SIZING_SCHEMA = {
  type: 'object', additionalProperties: true,
  properties: {
    proposed_weight: { type: ['number', 'null'] },
    pm_rationale: { type: 'string' },
    recommendation: { type: 'string', enum: ['approve', 'watchlist', 'reject'] },
    funding_source: { type: 'string' },
  },
  required: ['pm_rationale', 'recommendation'],
}

const RISK_SCHEMA = {
  type: 'object', additionalProperties: true,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'warn', 'veto'] },
    mandate_checks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: true,
        properties: { limit: { type: 'string' }, actual: {}, pass: { type: 'boolean' } },
        required: ['limit', 'pass'],
      },
    },
    concentration: { type: 'object', additionalProperties: true },
    factor_exposures: { type: 'object', additionalProperties: true },
    notes: { type: 'string' },
  },
  required: ['verdict', 'notes'],
}

const COMPLIANCE_SCHEMA = {
  type: 'object', additionalProperties: true,
  properties: {
    suitability: { type: 'string', enum: ['suitable', 'caution', 'unsuitable'] },
    checks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: true,
        properties: { check: { type: 'string' }, pass: { type: 'boolean' }, note: { type: 'string' } },
        required: ['check', 'pass'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['suitability', 'notes'],
}

const forCtx = portfolioName ? ` for the "${portfolioName}" portfolio` : ''

// ── Phase 1: Research (independent, parallel) ───────────────────────────────
phase('Research')
const researchThunks = [
  () => agent(
    `${ANALYST_ROLE}\n\nResearch ${ticker}${forCtx}. Build the thesis, assess fundamentals and management, ` +
    `and estimate fair value with your assumptions stated. Return your report as structured data.`,
    { schema: RESEARCH_SCHEMA, label: `analyst:${ticker}`, phase: 'Research' },
  ),
  () => agent(
    `${BEAR_ROLE}\n\nBuild the strongest independent bear case against buying ${ticker}${forCtx}. Go to the ` +
    `primary data yourself. Default toward "kill" if the evidence is ambiguous. Return structured data.`,
    { schema: BEAR_SCHEMA, label: `red-team:${ticker}`, phase: 'Research' },
  ),
]
if (!lean) {
  researchThunks.push(() => agent(
    `${QUANT_ROLE}\n\nRun a systematic screen on ${ticker}${forCtx}, including correlation/overlap with the ` +
    `portfolio's current holdings and how it screens vs the existing names in its sector. Return structured data.`,
    { schema: QUANT_SCHEMA, label: `quant:${ticker}`, phase: 'Research' },
  ))
}
const researchResults = await parallel(researchThunks)
const research = researchResults[0]
const bear = researchResults[1]
const quant = lean ? null : researchResults[2]

// ── Phase 2: Construct (sizing) ─────────────────────────────────────────────
phase('Construct')
const pm = await agent(
  `${PM_ROLE}\n\nYou are sizing a potential new position in ${ticker}${forCtx}.\n\n` +
  `Research summary:\n${JSON.stringify(research)}\n\nBear case:\n${JSON.stringify(bear)}\n\n` +
  (quant ? `Quant screen:\n${JSON.stringify(quant)}\n\n` : '') +
  `Propose a target weight and explain the sizing (conviction, fit, concentration impact, funding). ` +
  `Explicitly evaluate portfolio CONSTRUCTION: read model_portfolio_data and the current positions, identify ` +
  `${ticker}'s sector, measure the book's current allocation to that sector, and run the opportunity-cost test ` +
  `vs the existing names there — a high-merit stock can still be watchlist/reject if keeping the incumbents is ` +
  `the better allocation. Respect the model bands; if a sensible size would breach them, recommend watchlist/reject. Return structured data.`,
  { schema: SIZING_SCHEMA, label: `pm:${ticker}`, phase: 'Construct' },
)

// ── Phase 3: Control (risk verdict + compliance) ────────────────────────────
phase('Control')
const controlThunks = [
  () => agent(
    `${RISK_ROLE}\n\nAssess the risk of adding ${ticker}${forCtx} at ${pm.proposed_weight ?? '(PM-proposed)'}%.\n\n` +
    `Research:\n${JSON.stringify(research)}\n\nPM proposal:\n${JSON.stringify(pm)}\n\n` +
    `Check concentration, factor exposure, and every mandate/limit; stress a reasonable downside. Return a ` +
    `verdict (pass/warn/veto) with mandate_checks and notes, as structured data.`,
    { schema: RISK_SCHEMA, label: `risk:${ticker}`, phase: 'Control' },
  ),
]
if (!lean) {
  controlThunks.push(() => agent(
    `${COMPLIANCE_ROLE}\n\nAssess suitability of adding ${ticker}${forCtx} at ${pm.proposed_weight ?? '(PM-proposed)'}%.\n\n` +
    `PM proposal:\n${JSON.stringify(pm)}\n\nRead the portfolio's mandate/model (Supabase MCP, read-only) and any ` +
    `IPS data. Return suitability (suitable/caution/unsuitable) with per-check pass/fail and notes, as structured data.`,
    { schema: COMPLIANCE_SCHEMA, label: `compliance:${ticker}`, phase: 'Control' },
  ))
}
const controlResults = await parallel(controlThunks)
const risk = controlResults[0]
const compliance = lean ? null : controlResults[1]

// ── Phase 4: Synthesize the IC memo ─────────────────────────────────────────
phase('Synthesize')
// A risk veto or an 'unsuitable' compliance finding forces the committee recommendation to 'reject'.
const blocked = risk.verdict === 'veto' || (compliance && compliance.suitability === 'unsuitable')
const recommendation = blocked ? 'reject' : pm.recommendation

const rationale = await agent(
  `Write a concise Investment Committee memo (5-8 sentences) for ${ticker}${forCtx} that a CIO can act on. ` +
  `Synthesize — do not just concatenate — the analyst thesis, the bear case, ` +
  (quant ? `the quant screen, ` : '') + `the PM's sizing proposal, the risk verdict, ` +
  (compliance ? `and the compliance/IPS suitability finding ` : '') +
  `into a clear recommendation and its reasoning. State the committee recommendation (${recommendation}) and ` +
  `why, and flag any risk warn/veto or compliance caution/unsuitable prominently. If the committee declines a ` +
  `fundamentally sound name for portfolio-construction reasons (sector already well-served / existing holdings ` +
  `preferable), make that reasoning explicit — "good business, but not additive to this book because …".\n\n` +
  `Analyst: ${JSON.stringify(research)}\nBear: ${JSON.stringify(bear)}\n` +
  (quant ? `Quant: ${JSON.stringify(quant)}\n` : '') +
  `PM: ${JSON.stringify(pm)}\nRisk: ${JSON.stringify(risk)}\n` +
  (compliance ? `Compliance: ${JSON.stringify(compliance)}\n` : ''),
  { label: `memo:${ticker}`, phase: 'Synthesize' },
)

// Return the full deliverable bundle. The orchestrator persists it after the run —
// no writes happen inside the workflow.
return {
  ticker,
  portfolioName,
  additionId,
  lean,
  research,
  bear,
  quant,
  pm,
  risk,
  compliance,
  memo: {
    proposed_weight: pm.proposed_weight ?? null,
    pm_rationale: pm.pm_rationale,
    recommendation,           // committee recommendation (risk veto / compliance unsuitable → reject)
    rationale,                // synthesized memo text
    status: 'pending_cio',    // awaiting the CIO's decision
    risk_verdict: risk.verdict,
    compliance_suitability: compliance ? compliance.suitability : null,
  },
}
