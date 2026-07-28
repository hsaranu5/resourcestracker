#!/usr/bin/env bash
#
# Weekly maintenance for the KC Resources server. Runs the four things that
# actually keep it healthy, in order:
#
#   1. Roll the events window forward   (Street Sheet clinics stay populated)
#   2. Load the regenerated events      (seedEvents.js)
#   3. Prune + archive + compact the DB (maintenance.js — the real cache free-age)
#   4. Restart the server process       (clean process, picks up new data)
#
# Designed to be invoked by the OS scheduler (systemd timer on Linux, launchd on
# macOS, Task Scheduler on Windows) once a week. Everything except the restart is
# host-agnostic; the restart command is supplied via $RESTART_CMD so the same
# script works everywhere.
#
# Usage from a scheduler:
#   RESTART_CMD="systemctl restart kcresources" /path/to/scripts/weekly-maintenance.sh
#
# If RESTART_CMD is unset, steps 1-3 still run and the restart is skipped with a
# note — safe for a dry run.

set -euo pipefail

# Resolve the repo root from this script's location, so it works no matter where
# it's called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

LOG_PREFIX="[weekly-maintenance $(date -u +%Y-%m-%dT%H:%M:%SZ)]"
echo "$LOG_PREFIX starting in $REPO_ROOT"

# Pick a python; the M70 build may expose either name.
PYTHON="$(command -v python3 || command -v python || true)"
if [ -z "$PYTHON" ]; then
  echo "$LOG_PREFIX python not found — skipping events roll" >&2
else
  echo "$LOG_PREFIX rolling events window (next 21 days)"
  "$PYTHON" data/generate_events.py --days 21

  echo "$LOG_PREFIX seeding regenerated events"
  node server/seedEvents.js
fi

echo "$LOG_PREFIX pruning + archiving + compacting database"
node server/maintenance.js

if [ -n "${RESTART_CMD:-}" ]; then
  echo "$LOG_PREFIX restarting server: $RESTART_CMD"
  # shellcheck disable=SC2086
  eval "$RESTART_CMD"
else
  echo "$LOG_PREFIX RESTART_CMD not set — skipping restart (data + DB were still refreshed)"
fi

echo "$LOG_PREFIX done"
