BEGIN;
DO $$ BEGIN PERFORM vault.create_secret('pos-migration-20261014-disposable','pos-migration-20261014-vault-probe'); END $$;
SELECT json_build_object('kind','vaultRoundTrip','pass',decrypted_secret='pos-migration-20261014-disposable') FROM vault.decrypted_secrets WHERE name='pos-migration-20261014-vault-probe';
CREATE TEMP TABLE vault_metadata(line text);
COPY vault_metadata FROM PROGRAM 'stat -c "%a %U %G %s" /var/lib/postgresql/data/pos-vault-root.key';
SELECT json_build_object('kind','keyMetadata','metadata',line) FROM vault_metadata;
SELECT json_build_object('kind','runtime','ssl',current_setting('ssl'),'preload',current_setting('shared_preload_libraries'),'version',current_setting('server_version'));
ROLLBACK;
