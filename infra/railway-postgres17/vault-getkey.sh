#!/bin/sh
set -eu
# PostgreSQL reads this stdout through a private pipe. Do not log this value.
exec cat /var/lib/postgresql/data/pos-vault-root.key
