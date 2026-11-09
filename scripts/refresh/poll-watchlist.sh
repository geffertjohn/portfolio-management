#!/usr/bin/env bash
#
# poll-watchlist.sh — run a refresh when a newly watched fund is waiting for one.
#
# A fund added to the Watchlist populates nothing until the workbook has carried
# it through a refresh, so until now an idea added at 09:00 showed "Category
# pending" until the next morning. This closes that to about a quarter of an
# hour, without a person running anything.
#
# It is DELIBERATELY THIN. `pending-funds.cjs` decides, `refresh.sh` does the
# work and already holds its own lock, so this only applies the two guards that
# belong to the clock rather than to the data, and logs what happened.
#
# WHY A POLLER AND NOT A PUSH. Adding a fund is a browser write to Supabase.
# There is no path from the browser to this machine's shell — the app has no
# bridge to the scheduler, which is the same reason the committee runs in Claude
# Code rather than from a button. So the Mac asks, on a cycle.
set -u

REPO="${REPO:-$HOME/Developer/Portfolio Management}"
BASE="${REFRESH_HOME:-$HOME/portfolio-refresh}"
LOGDIR="$BASE/logs"
LOG="$LOGDIR/poller.log"
STAMP="$BASE/.poll-trigger"

# Daylight hours only. Nothing is gained by waking the VM at 03:00 for an idea
# nobody is looking at, and launchd does not wake a sleeping Mac anyway, so an
# overnight cycle would mostly be a no-op that still has to be reasoned about.
# Weekends included on purpose: a fund added on Saturday is one the advisor
# wants to read about on Saturday, and YCharts serves Friday's close happily.
HOUR_START="${POLL_HOUR_START:-7}"
HOUR_END="${POLL_HOUR_END:-19}"

# The floor between poller-initiated runs.
#
# The date comparison in pending-funds.cjs already stops a ticker asking twice,
# but ONLY once an import has succeeded: a refresh that fails writes no
# `import_runs` row, so the stamp stays old and the same fund reads as untried
# on the next cycle. Retrying is right — a VM that was asleep deserves another
# go — but not every quarter hour, so this bounds a broken VM to about a dozen
# attempts a day rather than ninety-six.
MIN_GAP_MINUTES="${POLL_MIN_GAP_MINUTES:-45}"

mkdir -p "$LOGDIR"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

hour=$(date +%-H)
if [ "$hour" -lt "$HOUR_START" ] || [ "$hour" -ge "$HOUR_END" ]; then
  exit 0   # outside hours: silent, or the log is 96 lines of nothing a day
fi

if [ -f "$STAMP" ]; then
  age_min=$(( ( $(date +%s) - $(stat -f %m "$STAMP") ) / 60 ))
  if [ "$age_min" -lt "$MIN_GAP_MINUTES" ]; then
    exit 0   # also silent: this is the common case between additions
  fi
fi

if [ ! -f "$REPO/.env" ]; then
  log "FATAL: no $REPO/.env — need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  exit 1
fi
set -a; . "$REPO/.env"; set +a

decision=$(node "$REPO/scripts/refresh/pending-funds.cjs" 2>&1); rc=$?
case "$rc" in
  10) exit 0 ;;                                  # nothing waiting — the quiet path
  0)  log "$decision" ;;
  *)  log "WARN: could not decide whether to refresh — $decision"; exit 1 ;;
esac

# Stamped BEFORE the run, not after: if refresh.sh hangs, the floor above is
# what stops the next cycle starting a second one, and a stamp written on the
# way out would never be reached.
date '+%Y-%m-%d %H:%M:%S' > "$STAMP"

log "starting a refresh"
if bash "$REPO/scripts/refresh/refresh.sh" >> "$LOG" 2>&1; then
  log "refresh finished"
else
  log "WARN: the refresh did not complete — see the refresh log"
fi
