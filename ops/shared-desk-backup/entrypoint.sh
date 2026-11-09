#!/bin/sh
# coreutils timeout owns the process group, including pg_dump/pg_restore.
# TERM normally records safe failure; KILL bounds a blocked driver after 30s.
set -eu
budget="${BACKUP_MAX_SECONDS:-10800}"
case "$budget" in ''|*[!0-9]*) echo '{"state":"FAILED","code":"LIMIT_CONFIG"}'; exit 1;; esac
if [ "$budget" -lt 60 ] || [ "$budget" -gt 14400 ]; then
  echo '{"state":"FAILED","code":"LIMIT_CONFIG"}'
  exit 1
fi
exec timeout --signal=TERM --kill-after=30s "${budget}s" python runner.py "$@"
