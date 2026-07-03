/**
 * InvestmentCommitteePage — Settings → Investment Committee.
 *
 * Reference page documenting the AI investment team's roles & responsibilities
 * (see docs/ai-investment-team-charter.md). Read-only, informational — the roles
 * are the role-scoped subagents that run in Claude Code and persist their
 * deliverables (research_reports / risk_reports / ic_memos). Recommend-only.
 */

interface Role {
  name: string
  question: string
  responsibilities: string[]
  deliverable: string
}

interface Group {
  key: string
  label: string
  blurb: string
  accent: string // border + text accent classes
  chip: string   // small badge classes
  roles: Role[]
}

const GROUPS: Group[] = [
  {
    key: 'leadership',
    label: 'Leadership',
    blurb: 'Sets the mandate and owns the final call. The orchestrator convenes the committee and synthesizes the memo.',
    accent: 'border-slate-300',
    chip: 'bg-slate-100 text-slate-700',
    roles: [
      {
        name: 'CIO — You',
        question: 'What is the mandate, and what do we do?',
        responsibilities: [
          'Set each portfolio’s mandate, objective, and risk tolerance.',
          'Approve, reject, or tie-break every committee recommendation.',
          'Own the decision — the committee advises; the CIO decides.',
        ],
        deliverable: 'The final approve / reject decision (manual, using the existing add-to-portfolio path).',
      },
      {
        name: 'Investment Orchestrator',
        question: 'Does the committee agree?',
        responsibilities: [
          'Convene the committee for a new-buy or review and route work between roles.',
          'Synthesize the independent deliverables into a single IC memo.',
          'Surface disagreement (e.g. a risk veto) rather than smoothing it over.',
        ],
        deliverable: 'ic_memos (status = pending CIO).',
      },
    ],
  },
  {
    key: 'idea',
    label: 'Idea generation',
    blurb: 'Independent perspectives on whether a security is worth owning — fundamental, systematic, and top-down.',
    accent: 'border-blue-300',
    chip: 'bg-blue-100 text-blue-700',
    roles: [
      {
        name: 'Research Analyst',
        question: 'Should we own it?',
        responsibilities: [
          'Fundamental research, financial modeling, valuation, and earnings review.',
          'Assess business quality, management, and a defensible fair-value estimate.',
          'Build the bull-side thesis and name what could go wrong.',
        ],
        deliverable: 'research_reports — thesis, bull case, fair value + method, rating, DCF inputs, sources.',
      },
      {
        name: 'Quant Analyst',
        question: 'What do the numbers say?',
        responsibilities: [
          'Systematic factor, valuation, and volatility screens.',
          'Correlation-to-book and backtest context.',
          'Complements — does not duplicate — the fundamental analyst.',
        ],
        deliverable: 'research_reports (quant screen) — a systematic attractive / unattractive verdict.',
      },
      {
        name: 'Macro Strategist',
        question: 'What’s the weather?',
        responsibilities: [
          'Top-down context: rates, inflation, growth regime, sector rotation.',
          'Track the economic calendar and what it means for the portfolios.',
          'Set the macro backdrop that feeds bottom-up decisions.',
        ],
        deliverable: 'A standing macro brief / top-down context for the committee.',
      },
    ],
  },
  {
    key: 'challenge',
    label: 'Challenge',
    blurb: 'A dedicated bear-case role guards against over-agreeableness — it argues to reject.',
    accent: 'border-rose-300',
    chip: 'bg-rose-100 text-rose-700',
    roles: [
      {
        name: "Devil's Advocate",
        question: 'Why is this wrong?',
        responsibilities: [
          'Build the strongest possible bear case, researching independently and blind to the bull case.',
          'Name what breaks the thesis, what the analyst is ignoring, and the downside scenario.',
          'Default toward “reject” when uncertain.',
        ],
        deliverable: 'research_reports (bear case) + a kill / keep recommendation with rationale.',
      },
    ],
  },
  {
    key: 'construction',
    label: 'Construction',
    blurb: 'Turns a “yes, own it” into “how much, and how does it fit.” An allocator, not a stock picker.',
    accent: 'border-teal-300',
    chip: 'bg-teal-100 text-teal-700',
    roles: [
      {
        name: 'Portfolio Manager',
        question: 'How much do we own?',
        responsibilities: [
          'Position sizing, portfolio construction, sector allocation, cash management.',
          'Weigh the risk contribution and fit against the rest of the book.',
          'Propose a target weight vs. the effective bands, plus buy / sell / rebalance.',
        ],
        deliverable: 'A proposed target weight + sizing rationale that feeds the IC memo.',
      },
    ],
  },
  {
    key: 'control',
    label: 'Risk & control',
    blurb: 'The last gate before a proposal reaches the CIO — what could hurt us, and is it in-mandate?',
    accent: 'border-amber-300',
    chip: 'bg-amber-100 text-amber-700',
    roles: [
      {
        name: 'Risk Manager',
        question: 'What could hurt us?',
        responsibilities: [
          'Monitor concentration, factor exposures, and stress scenarios.',
          'Verify the actual book against the mandate + the Compliance Rules hub.',
          'Return a verdict — a veto blocks the memo from reaching the CIO as approval-ready.',
        ],
        deliverable: 'risk_reports — concentration, factor exposures, mandate checks, verdict (pass / warn / veto).',
      },
      {
        name: 'Compliance / IPS Officer',
        question: 'Is it suitable and in-mandate?',
        responsibilities: [
          'Check every decision against the mandate, concentration limits, and IPS suitability.',
          'Produce the audit-defense paper trail; flag documentation gaps.',
          'Optional ESG dimension.',
        ],
        deliverable: 'A compliance / IPS-suitability assessment recorded with the IC memo.',
      },
    ],
  },
]

export function InvestmentCommitteePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Investment Committee</h1>
        <p className="mt-1 text-sm text-gray-500">
          The roles and responsibilities of the AI investment team. Each role is a
          scoped agent that runs in Claude Code and persists its own deliverable —
          separation of duties means research (own it?), construction (how much?),
          and control (what could hurt us?) must agree before capital moves.
          Recommend-only: the CIO makes the final call.
        </p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.key}>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${group.chip}`}>{group.label}</span>
            <p className="text-xs text-gray-400">{group.blurb}</p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {group.roles.map((role) => (
              <div key={role.name} className={`rounded-lg border-l-4 ${group.accent} border-y border-r border-gray-200 bg-white p-4 shadow-sm`}>
                <h2 className="text-sm font-semibold text-gray-900">{role.name}</h2>
                <p className="mt-0.5 text-xs italic text-gray-500">“{role.question}”</p>

                <ul className="mt-3 space-y-1.5">
                  {role.responsibilities.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                  <span className="font-medium uppercase tracking-wide text-gray-400">Deliverable </span>
                  {role.deliverable}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Guardrails */}
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        <h2 className="text-sm font-semibold text-gray-900">Guardrails (non-negotiable)</h2>
        <ul className="mt-3 space-y-1.5">
          {[
            'No agent executes trades or moves money — approval is a manual CIO action.',
            'No agent writes to positions or portfolio_allocations; agents write only their own recommendation tables.',
            'An agent’s fair-value / DCF is a documented, defensible estimate — the value is the reasoning + the bear-case rebuttal + CIO sign-off, not the number.',
          ].map((g, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
