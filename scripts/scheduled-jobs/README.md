# Scheduled committee jobs — launchd

The seven committee routines run from **launchd**, not the Claude Code app's
scheduler.

```
launchd (per-job LaunchAgent) → run-job.sh <task-id> → claude -p → Supabase / FMP / TipRanks
                                                                 → job_runs heartbeat
```

## Why this replaced the app scheduler

| | App scheduler | launchd |
|---|---|---|
| Runs when | only while the Claude Code app is open | whenever the Mac is awake and logged in |
| Prompt source | `~/.claude/scheduled-tasks/` — a copy, kept in step by `sync.mjs` | `git show main:.claude/scheduled-tasks/…` — the repo, directly |
| Drift | repo could go stale silently; a symlink there fails *looking healthy* | impossible; there is one copy |
| Failure visible as | nothing | non-zero exit in the log, plus an open `job_runs` row |

## Commands

```bash
node scripts/scheduled-jobs/generate-plists.mjs   # after editing the JOBS table
./scripts/scheduled-jobs/install.sh install       # copy to ~/Library/LaunchAgents and load
./scripts/scheduled-jobs/install.sh status        # what launchd currently holds
./scripts/scheduled-jobs/install.sh run <task-id> # fire one NOW, through launchd
./scripts/scheduled-jobs/install.sh uninstall     # unload and remove
```

**Always test with `install.sh run`, never by calling `run-job.sh` from a
shell.** A shell cannot reproduce launchd's environment — different `PATH`, no
TCC grants, no shell profile — which is exactly how the YCharts refresh passed
every manual test while failing at 05:30 every morning.

## Schedule

| Job | When |
|---|---|
| `weekly-risk-report` | Mondays 07:15 |
| `reviews-due-digest` | Mondays 07:40 |
| `at-risk-review` | weekdays 09:00 |
| `post-earnings-brief` | weekdays 09:30 |
| `pre-earnings-brief` | weekdays 09:45 |
| `earnings-call-summary` | weekdays 10:00 |
| `watchlist-research` | weekdays 10:20 |

Staggered 15–30 minutes because a run takes 12–15 minutes. **`at-risk-review`
must precede `post-earnings-brief`** — the brief reports any same-day at-risk
change and there is only ever one brief per print. Under the app scheduler the
two earnings jobs both nominally fired at 09:30 and were separated only by
random jitter, which is a coin flip rather than a schedule.

## Four things that will bite

1. **The prompt comes from `main`, not the working tree.** `JOB_PROMPT_REF`
   overrides it for testing. Reading the checked-out file would mean the 09:00
   job runs whatever branch you happened to leave checked out — this was caught
   exactly that way, by a test run that produced no heartbeat because the tree
   sat on a branch predating it. A job runs the reviewed, merged prompt.

2. **Do not set `CLAUDE_CODE_OAUTH_TOKEN`.** It outranks the stored claude.ai
   login, and a session authenticated by that token **cannot load claude.ai MCP
   connectors** — which is where Supabase and FMP live. Setting it leaves every
   job with no data access at all. `run-job.sh` unsets it defensively. A
   malformed one in `~/.claude/settings.json`'s `env` block broke every `claude`
   CLI invocation on this machine until Oct 2026; the desktop app never read it,
   so nothing surfaced the breakage.

3. **The repo must stay outside `~/Desktop`, `~/Documents` and `~/Downloads`.**
   TCC-protected; a LaunchAgent holds no grant and bash cannot even read a
   script there, exiting 126 before one line runs. See `scripts/refresh/`.

4. **The tool allowlist excludes `Bash` and `Write`/`Edit`.** Every prompt
   already forbids shell use — an approval prompt stalls an unattended run
   forever, and under `-p` there is nobody to answer it. MCP tools are allowed
   at **server** level (`mcp__claude_ai_Supabase`, `mcp__claude_ai_FMP`,
   `mcp__tipranks`) so a renamed endpoint does not silently lose access.
   Note these names differ from the desktop app's UUID-based ones.

## Logs

- `~/portfolio-jobs/logs/<task-id>-YYYY-MM-DD.log` — the runner's own log plus
  the model's output.
- `~/portfolio-jobs/logs/launchd-<task-id>.{out,err}` — launchd's capture, for
  failures that happen before the runner can log anything. **Check these first**
  when a job leaves no log at all.

The authoritative record is the job's **`job_runs`** row, which it opens first
and closes last. These logs say whether the PROCESS ran; that table says whether
the WORK did, and a row left open is how a death mid-run surfaces.

## The app scheduler's copies

The seven tasks are **disabled**, not deleted, so re-enabling them is one call
if this needs reverting — but then both would run. `sync.mjs` is no longer part
of the live path; it remains only for that revert.
