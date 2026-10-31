#!/bin/bash
# run-job.sh — run one scheduled committee job headlessly, from launchd.
#
#   launchd → this script → `claude -p` → Supabase / FMP / TipRanks → job_runs
#
# WHY THIS EXISTS. The seven routines used to run on the Claude Code app's own
# scheduler, which only fires while the app is open. Two of them died silently
# in Oct 2026, and the prompts had to be copied to a path the scheduler owned
# (`~/.claude/scheduled-tasks/`) by `sync.mjs`, so the repo could go stale
# without anything saying so. launchd fires whether or not the app is running,
# and this script reads the prompt STRAIGHT FROM THE REPO — so the repo is now
# the only copy that matters.
#
# Usage:  run-job.sh <task-id>        # e.g. run-job.sh at-risk-review
set -uo pipefail

TASK="${1:-}"
[ -z "$TASK" ] && { echo "usage: run-job.sh <task-id>" >&2; exit 2; }

# NOT ~/Desktop, ~/Documents or ~/Downloads. Those are TCC-protected and a
# LaunchAgent holds no grant for them — bash cannot even read a script there and
# exits 126 before one line runs. The YCharts refresh lost weeks to this; every
# manual test passed because Terminal already holds the grant. See
# scripts/refresh/refresh.sh.
REPO="${REPO:-$HOME/Developer/Portfolio Management}"
BASE="${JOBS_HOME:-$HOME/portfolio-jobs}"
LOGDIR="$BASE/logs"
LOCKDIR="$BASE/locks"

# The prompt is read from a COMMITTED REF, not the working tree.
#
# Reading the checked-out file would make the 09:00 job run whatever branch
# happened to be checked out — a half-finished prompt on a feature branch, or an
# uncommitted experiment, would silently become the thing that writes to the
# book. (Caught exactly that way: a test run produced no heartbeat because the
# tree was on a branch predating it.) Pinning to `main` means a job always runs
# the reviewed, merged prompt, which is the record an audit would expect.
PROMPT_REF="${JOB_PROMPT_REF:-main}"
PROMPT_PATH=".claude/scheduled-tasks/$TASK/SKILL.md"

mkdir -p "$LOGDIR" "$LOCKDIR"
LOG="$LOGDIR/$TASK-$(date +%Y-%m-%d).log"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

# A hung run must not block tomorrow's. mkdir is the atomic test-and-set.
LOCK="$LOCKDIR/$TASK.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  log "SKIP — $LOCK exists, a previous run is still going (or died holding it)"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

cd "$REPO" || { log "FAIL — cannot cd to $REPO"; exit 1; }

RAW="$(git show "$PROMPT_REF:$PROMPT_PATH" 2>/dev/null)"
[ -z "$RAW" ] && { log "FAIL — no prompt at $PROMPT_REF:$PROMPT_PATH"; exit 1; }

# The prompt is the BODY of the SKILL.md; the frontmatter is metadata for the
# app scheduler and is not instruction. Strip the first --- ... --- block only.
BODY="$(printf '%s\n' "$RAW" | awk 'NR==1 && $0=="---" {fm=1; next} fm && $0=="---" {fm=0; next} !fm')"
[ -z "$BODY" ] && { log "FAIL — prompt body empty after stripping frontmatter"; exit 1; }

# A prompt that lost its heartbeat block cannot report whether it ran, which is
# the whole point of moving off the app scheduler. Warn rather than refuse — the
# digest is still worth having — but say so in the log.
printf '%s' "$BODY" | grep -q job_runs || log "WARN — prompt carries no job_runs heartbeat; this run will be invisible in the app"

# Tools the jobs are allowed to use, named at SERVER level so a renamed FMP
# endpoint does not silently lose access mid-run.
#
# Bash and Write/Edit are deliberately ABSENT. Every prompt already forbids
# shell use (an approval prompt stalls an unattended run forever, and in -p mode
# there is nobody to answer it), and a drafting job has no business editing the
# working tree. Supabase writes still go through execute_sql.
ALLOW=(
  "mcp__claude_ai_Supabase"
  "mcp__claude_ai_FMP"
  "mcp__tipranks"
  "Agent" "Task" "ToolSearch"
  "Read" "Glob" "Grep"
  "WebSearch" "WebFetch"
)

# Jobs run 12-15 min; the cap is for a run that has stopped making progress.
TIMEOUT_SECS="${JOB_TIMEOUT_SECS:-3600}"

log "START $TASK (prompt=$PROMPT_REF:$PROMPT_PATH, timeout=${TIMEOUT_SECS}s)"

# CLAUDE_CODE_OAUTH_TOKEN is deliberately NOT set. It outranks the stored
# claude.ai login (authentication precedence rank 5 vs 7), and a session
# authenticated by that token CANNOT load claude.ai MCP connectors — which is
# where Supabase and FMP live. Setting it here would leave every job with no
# data access at all. The stored /login credential is the one that works.
unset CLAUDE_CODE_OAUTH_TOKEN

START_EPOCH=$(date +%s)
printf '%s\n' "$BODY" | timeout "$TIMEOUT_SECS" claude -p \
  --allowedTools "${ALLOW[@]}" \
  >> "$LOG" 2>&1
RC=$?
ELAPSED=$(( $(date +%s) - START_EPOCH ))

case $RC in
  0)   log "DONE  $TASK in ${ELAPSED}s" ;;
  124) log "TIMEOUT $TASK after ${ELAPSED}s — killed at the ${TIMEOUT_SECS}s cap" ;;
  *)   log "FAIL  $TASK rc=$RC after ${ELAPSED}s" ;;
esac

# The authoritative record is the job's own `job_runs` row, which it opens first
# and closes last. This log says whether the PROCESS ran; that table says
# whether the WORK did, and a row left open is how a death mid-run surfaces.
exit $RC
