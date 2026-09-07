#!/bin/bash
# refresh.sh — the scheduled YCharts refresh, driven from macOS on the mini.
#
#   launchd → this script → Parallels VM (Excel + YCharts add-in) → Supabase
#
# The VM is a short-lived worker: started, used, suspended. It is never left
# running, because Windows wants ~4GB of an 8GB machine.
#
# Deliberately NOT using Windows Task Scheduler. Driving Excel through
# `prlctl exec` keeps scheduling in one place (launchd) instead of two that can
# disagree, and removes a component that needs its own logged-in-user setting.
#
# Completion is detected by the OUTPUT FILE APPEARING, not by the Excel process
# exiting — `prlctl exec` does not reliably block, and a hung Excel would
# otherwise wedge the run until the timeout.
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
WORKBOOK='C:\portfolio\Ycharts.xlsm'

WAIT_SECS="${WAIT_SECS:-1200}"               # 20 min: recalc + fetch, generously
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
rm -f "$OUTPUT" "$VM_ERROR"

# ── Drive Excel; the Workbook_Open macro does the rest ──────────────────────
log "launching Excel on $WORKBOOK"
prlctl exec "$VM" cmd.exe /c start "" "$WORKBOOK" >>"$LOG" 2>&1 \
  || log "WARN: prlctl exec returned non-zero (Excel may still have launched)"

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
