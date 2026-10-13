#!/bin/sh
set -eu
auth &
auth_pid=$!
caddy run --config /etc/pos-auth/Caddyfile --adapter caddyfile &
proxy_pid=$!
stop() {
  kill -TERM "$auth_pid" "$proxy_pid" 2>/dev/null || true
  wait "$auth_pid" "$proxy_pid" 2>/dev/null || true
}
trap stop INT TERM EXIT
while kill -0 "$auth_pid" 2>/dev/null && kill -0 "$proxy_pid" 2>/dev/null; do
  sleep 1
done
exit 1
