#!/bin/sh
set -eu

# The source Vault must be confirmed empty before this destination is used.
# Its new encryption key belongs to the persistent volume, never the image.
volume=/var/lib/postgresql/data
key="$volume/pos-vault-root.key"
test -d "$volume"
if [ ! -e "$key" ]; then
    umask 077
    openssl rand -hex 32 > "$key"
fi
grep -Eq '^[0-9a-f]{64}$' "$key"
chown postgres:postgres "$key"
chmod 600 "$key"

# Preserve the upstream volume checks, TLS, shutdown and backup behavior.
exec /usr/local/bin/wrapper.sh "$@"
