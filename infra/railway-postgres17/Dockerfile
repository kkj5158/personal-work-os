# Keep Railway's PostgreSQL 17 volume, TLS and lifecycle wrapper.
FROM ghcr.io/railwayapp-templates/postgres-ssl:17 AS vault-build
USER root
ARG VAULT_COMMIT=6e0cd916242d922a646e4d611cc215e09dd429f4
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates curl libsodium-dev postgresql-server-dev-17 \
    && mkdir /tmp/vault-source \
    && curl --fail --location --retry 3 "https://github.com/supabase/vault/archive/${VAULT_COMMIT}.tar.gz" \
       | tar --extract --gzip --strip-components=1 --directory=/tmp/vault-source \
    && make -C /tmp/vault-source PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config \
    && make -C /tmp/vault-source PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config DESTDIR=/opt/vault-install install \
    && grep -q "default_version = '0.3.1'" /opt/vault-install/usr/share/postgresql/17/extension/supabase_vault.control

FROM ghcr.io/railwayapp-templates/postgres-ssl:17
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends libsodium23 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=vault-build /opt/vault-install/ /
COPY --chmod=755 vault-wrapper.sh /usr/local/bin/pos-vault-wrapper.sh
COPY --chmod=755 vault-getkey.sh /usr/local/bin/pos-vault-getkey.sh

# Fail the image build if the exact extension cannot be created on PG17.
USER postgres
RUN initdb --pgdata=/tmp/pos-vault-build-check --auth=trust --no-locale \
    && pg_ctl --pgdata=/tmp/pos-vault-build-check --options="-c listen_addresses= -c unix_socket_directories=/tmp" --wait start \
    && psql --host=/tmp --dbname=postgres --set=ON_ERROR_STOP=1 \
       --command="CREATE EXTENSION supabase_vault VERSION '0.3.1'; SELECT extversion FROM pg_extension WHERE extname='supabase_vault';" \
    && pg_ctl --pgdata=/tmp/pos-vault-build-check --mode=fast --wait stop \
    && rm -rf /tmp/pos-vault-build-check
USER root
STOPSIGNAL SIGINT
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/pos-vault-wrapper.sh"]
CMD ["postgres", "-p", "5432", "-c", "listen_addresses=*", "-c", "shared_preload_libraries=pg_stat_statements,supabase_vault", "-c", "vault.getkey_script=/usr/local/bin/pos-vault-getkey.sh"]
