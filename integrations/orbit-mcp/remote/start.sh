#!/bin/sh
set -eu
# Railway mounts the persistent volume as root; initialize permissions before
# dropping privileges. Only this dedicated OAuth volume is touched.
test "${ORBIT_DATA_DIR:-/data}" = /data
mkdir -p /data
chown node:node /data
chmod 700 /data
exec su-exec node node remote/main.mjs
