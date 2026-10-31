#!/bin/bash
# install.sh — load/unload the committee job LaunchAgents.
#
#   ./install.sh install     copy plists to ~/Library/LaunchAgents and load them
#   ./install.sh uninstall   unload and remove them
#   ./install.sh status      show what launchd currently holds
#   ./install.sh run <id>    fire one job NOW through launchd (not a shell)
#
# `run` uses `launchctl kickstart`, never a direct shell call. A shell cannot
# reproduce launchd's environment — different PATH, no TCC grants — which is
# exactly how the YCharts refresh looked healthy in every manual test while
# failing at 05:30 every morning.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/launchagents"
DEST="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"
PREFIX="com.john.pm-"

# Glob into an array — NEVER `for p in $(ls ...)`. The repo path contains a
# space ("Portfolio Management"), so command substitution splits every path in
# half and every cp fails on a directory that does not exist.
shopt -s nullglob
PLISTS=("$SRC"/${PREFIX}*.plist)
shopt -u nullglob
[ ${#PLISTS[@]} -eq 0 ] && { echo "no plists in $SRC — run generate-plists.mjs first" >&2; exit 1; }

case "${1:-status}" in
  install)
    mkdir -p "$DEST" "$HOME/portfolio-jobs/logs" "$HOME/portfolio-jobs/locks"
    for p in "${PLISTS[@]}"; do
      label="$(basename "$p" .plist)"
      launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null
      cp "$p" "$DEST/"
      if launchctl bootstrap "gui/$UID_NUM" "$DEST/$(basename "$p")" 2>/dev/null; then
        echo "✓ loaded  $label"
      else
        echo "✗ FAILED  $label — check: launchctl print gui/$UID_NUM/$label"
      fi
    done
    ;;
  uninstall)
    for p in "${PLISTS[@]}"; do
      label="$(basename "$p" .plist)"
      launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null && echo "✓ unloaded $label" || echo "– not loaded $label"
      rm -f "$DEST/$(basename "$p")"
    done
    ;;
  status)
    printf '%-40s %s\n' "LABEL" "STATE"
    for p in "${PLISTS[@]}"; do
      label="$(basename "$p" .plist)"
      if launchctl print "gui/$UID_NUM/$label" >/dev/null 2>&1; then
        next="$(launchctl print "gui/$UID_NUM/$label" 2>/dev/null | grep -m1 'runs =' | tr -d '\t')"
        printf '%-40s loaded   %s\n' "$label" "$next"
      else
        printf '%-40s NOT LOADED\n' "$label"
      fi
    done
    ;;
  run)
    id="${2:-}"; [ -z "$id" ] && { echo "usage: install.sh run <task-id>" >&2; exit 2; }
    launchctl kickstart -k "gui/$UID_NUM/${PREFIX}${id}" \
      && echo "kicked ${PREFIX}${id} — tail ~/portfolio-jobs/logs/${id}-$(date +%Y-%m-%d).log"
    ;;
  *)
    sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
