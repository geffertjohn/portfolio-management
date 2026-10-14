---
name: weekly-risk-report
description: Weekly per-portfolio risk snapshot (concentration + factor drift) on the current book; drafts to risk_reports.
---

You are the weekly portfolio risk report for the Portfolio Management app's AI investment team (context: docs/ai-investment-team-charter.md). For each managed portfolio, produce a risk snapshot of the CURRENT book (no proposed trade) and save it. Recommend-only, informational: never modify positions/allocations, never trade.

Steps (self-contained — fresh session in the Portfolio Management project directory):
1. Via Supabase MCP (project_id: oulahvazpuzfqxudmfef) execute_sql: list portfolios (select name from portfolio) and, for each, its current positions (positions.security_id, target_weight). Resolve the model bands where useful: security_id -> portfolio_model_map -> model_portfolio_data (or by investment_objective) for cash/position/tier limits. Process portfolios that have positions; skip empty ones. If there are many, prioritize the actively managed equity portfolios (e.g. Core Growth, Equity Income, Equity Income & Core Growth) and cover the rest if practical.
2. For each portfolio, adopt the risk-manager role — Read .claude/agents/risk-manager.md first. Assess the current book: top concentration (largest positions + sector clusters), factor tilts (growth/value, size, quality, rate sensitivity, beta, any crowded theme like AI-datacenter capex), and any drift or limit issues vs the model bands. Use FMP MCP for beta/sector where helpful. This is a standing-book review, so verdict reflects the current risk posture: pass (well-balanced), warn (a tilt worth watching), veto (a genuine limit breach or dangerous concentration).
3. Persist each as a risk_reports row via Supabase MCP execute_sql (use dollar-quoted literals $r$ ... $r$ for text/jsonb): portfolio_name, scope = 'portfolio', security_id null, concentration (jsonb), factor_exposures (jsonb), mandate_checks (jsonb array of {limit, actual, pass}), verdict, notes.
4. Output a digest: per portfolio — verdict and the single biggest risk in one line.

Guardrails: recommend-only, informational. Never write to positions or portfolio_allocations, never trade. This is a monitoring report, not an instruction to act.