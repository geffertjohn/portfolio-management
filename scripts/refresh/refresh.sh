#!/bin/bash
# refresh.sh — the scheduled YCharts refresh, driven from macOS on the mini.
#
#   launchd → this script → Parallels VM (Excel + YCharts add-in) → Supabase
#
# The VM is a short-lived worker: started, used, suspended. It is never left
# running, because Windows wants ~4GB of an 8GB machine.
#
# Excel is launched by dropping a TRIGGER FILE the guest is watching for, not by
# `prlctl exec` — that command is Parallels Pro/Business only. See
# watch-trigger.cmd. The Mac still owns the schedule; it just asks rather than
# tells.
#
# Completion is detected by the OUTPUT FILE APPEARING. Nothing on this side can
# see the Excel process at all, so the file is the only completion signal — and
# it is the right one, since a hung Excel would otherwise wedge the run.
set -uo pipefail

REPO="${REPO:-$HOME/portfolio-management}"
VM="${VM_NAME:-Windows 11}"
BASE="${REFRESH_HOME:-$HOME/portfolio-refresh}"

INBOX="$BASE/inbox"
PROCESSED="$BASE/processed"
FAILED="$BASE/failed"
LOGDIR="$BASE/logs"
LOCK="$BASE/.lock"

OUTPUT="$INBOX/Ycharts-refreshed.xlsx"
VM_ERROR="$INBOX/refresh-error.txt"          # written by the macro's abort path
TRIGGER="$INBOX/REFRESH-NOW"                 # watch-trigger.cmd polls for this

# The guest sees the Mac home as Z:, so $INBOX is Z:\portfolio-refresh\inbox.
# Parallels' "Shared Profile" already provides that — no extra shared folder.

# The guest polls every 2 min, and a first open takes a few minutes while the
# add-in fetches every data point, so allow generously.
WAIT_SECS="${WAIT_SECS:-1500}"               # 25 min
POLL_SECS=10
KEEP_DAYS=30

mkdir -p "$INBOX" "$PROCESSED" "$FAILED" "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m-%d).log"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

# ── One run at a time ───────────────────────────────────────────────────────
# A run that overruns its schedule must not have the next one start a second VM.
exec 9>"$LOCK"
if ! flock -n 9 2>/dev/null; then
  # macOS has no flock(1); fall back to a pid file.
  if [ -f "$BASE/.pid" ] && kill -0 "$(cat "$BASE/.pid")" 2>/dev/null; then
    log "SKIP: a refresh is already running (pid $(cat "$BASE/.pid"))"
    exit 0
  fi
fi
echo $$ > "$BASE/.pid"
cleanup() { rm -f "$BASE/.pid"; }
trap cleanup EXIT

log "=== refresh start ==="

# ── Credentials ─────────────────────────────────────────────────────────────
if [ ! -f "$REPO/.env" ]; then
  log "FATAL: no $REPO/.env — need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  exit 1
fi
set -a; . "$REPO/.env"; set +a

# ── Start the VM from whatever state it is in ───────────────────────────────
# Suspended is the normal case; stopped happens after a host power cut or a
# Parallels update. `prlctl start` resumes or boots as appropriate.
STATE="$(prlctl list -a -o status --no-header "$VM" 2>/dev/null | tr -d ' ')"
log "VM \"$VM\" state: ${STATE:-unknown}"
if [ "$STATE" != "running" ]; then
  prlctl start "$VM" >>"$LOG" 2>&1 || { log "FATAL: could not start the VM"; exit 1; }
  # A resume is quick; a cold boot needs Windows to auto-login before Excel can
  # be launched into a desktop session.
  sleep 45
fi

# ── Clear last run's artefacts so a stale file can never be mistaken for new ──
rm -f "$OUTPUT" "$VM_ERROR" "$TRIGGER"

# ── Ask the guest to open the workbook ──────────────────────────────────────
log "dropping trigger for the guest watcher"
date '+%Y-%m-%d %H:%M:%S' > "$TRIGGER"

# ── Wait for the macro to produce the file ──────────────────────────────────
waited=0
while [ ! -f "$OUTPUT" ]; do
  if [ -f "$VM_ERROR" ]; then
    log "FATAL: the macro aborted — $(cat "$VM_ERROR")"
    prlctl suspend "$VM" >>"$LOG" 2>&1
    exit 1
  fi
  if [ "$waited" -ge "$WAIT_SECS" ]; then
    log "FATAL: no output after ${WAIT_SECS}s — Excel is hung, or the macro never fired"
    prlctl suspend "$VM" >>"$LOG" 2>&1
    exit 1
  fi
  sleep "$POLL_SECS"; waited=$((waited + POLL_SECS))
done
log "output appeared after ${waited}s"

# ── Give the RAM back before importing ──────────────────────────────────────
prlctl suspend "$VM" >>"$LOG" 2>&1 && log "VM suspended" || log "WARN: suspend failed"

# ── Import ──────────────────────────────────────────────────────────────────
STAMPED="$(date +%Y-%m-%d_%H%M%S)"
if node "$REPO/scripts/refresh/import-workbook.cjs" "$OUTPUT" >>"$LOG" 2>&1; then
  mv "$OUTPUT" "$PROCESSED/Ycharts-$STAMPED.xlsx"
  log "=== refresh OK ==="
  RC=0
else
  # Left in failed/, never deleted — a file here is the evidence for the
  # in-app action the importer has already recorded.
  mv "$OUTPUT" "$FAILED/Ycharts-$STAMPED.xlsx" 2>/dev/null
  log "=== refresh FAILED (see above; workbook kept in failed/) ==="
  RC=1
fi

find "$PROCESSED" -name '*.xlsx' -mtime +$KEEP_DAYS -delete 2>/dev/null
find "$LOGDIR" -name '*.log' -mtime +$KEEP_DAYS -delete 2>/dev/null
exit $RC
