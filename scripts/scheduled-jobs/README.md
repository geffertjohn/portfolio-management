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
| `portfolio-committee-review` | weekdays 10:45 |

Staggered 15–30 minutes because a run takes 12–15 minutes.
`portfolio-committee-review` goes last: it acts only when a fund annual review
has been handed off, which is a handful of times a year, so an empty queue
costs one query. **`at-risk-review` must precede `post-earnings-brief`** — the brief reports any same-day at-risk
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

### This already happened (Nov 2026)

Three of the seven — `post-earnings-brief`, `pre-earnings-brief` and
`earnings-call-summary` — were found **enabled alongside their LaunchAgents**,
so each ran twice a day. Eleven double-run days across seven jobs, and
`reviews-due-digest` managed three on 31 Oct. It is not harmless: the two
`pre-earnings-brief` runs on 2 Nov both wrote, which is where the duplicate
pre-briefs for APP, ELF and DUK came from.

**The app scheduler bypasses the lock below**, because it runs the prompt
inside Claude Code rather than through `run-job.sh` — so nothing in this script
can defend against it. Configuration is the only guard.

Two things make it easy to spot:

- A launchd run starts within a few seconds of its slot (`09:30:0x`). An app
  run carries a per-task jitter and only fires while Claude Code is open, so it
  lands at an **irregular time**, often catching up hours late.
- ```sql
  select job_id, started_at::date, count(*) from job_runs
  group by 1, 2 having count(*) > 1 order by 2 desc;
  ```

To check what the app scheduler currently thinks it owns, list the tasks and
confirm every one reads `enabled: false` with no `nextRunAt`.

## The lock, and why a dead run no longer blocks the next one

`run-job.sh` takes `$JOBS_HOME/locks/<task>.lock` with `mkdir`, an atomic
test-and-set, and releases it from an EXIT trap.

**The trap does not cover every death.** A SIGKILL, or the machine sleeping,
logging out or losing power mid-run, leaves the directory behind with no
process to release it — and every later run then reads a lock it can never
clear. On 4 Nov 2026 `post-earnings-brief` started at 09:30:05, logged no
`DONE`, `TIMEOUT` or `FAIL`, and left its lock; the next morning's run logged
`SKIP` and did nothing. That day's briefs existed only because the duplicate
app-scheduler run wrote them outside this script — one bug silently covering
for another.

The lock now records the holder's **pid**, and a run that finds the lock held:

- **respects it** when that pid is alive *and* is a `run-job.sh` — two copies of
  a drafting job writing at once is how duplicate briefs appear;
- **reclaims it** otherwise, logging `RECLAIM`, which covers both a dead holder
  and a lock written without a pid.

The command is checked as well as the pid because pids are recycled, and an
unrelated process inheriting the number would otherwise block the job forever.
A stuck lock can still be cleared by hand:

```bash
rmdir ~/portfolio-jobs/locks/<task>.lock
```
