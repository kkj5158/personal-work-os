# POS PostgreSQL 17 migration image

Extend the existing Railway PostgreSQL 17 SSL image with Supabase Vault 0.3.1,
from the upstream release commit `6e0cd916242d922a646e4d611cc215e09dd429f4`.
The image build compiles the extension and verifies its creation on PostgreSQL.
It preserves Railway's volume, SSL and lifecycle wrapper. No database or
application credentials belong in this directory.

The Vault encryption key is created once on the persistent volume, owned by
postgres with mode 0600, and supplied to PostgreSQL through a private pipe.
The mounted volume and its backups must retain this key. This image is suitable
for the verified empty source Vault; restoring nonempty source Vault ciphertext
requires its original encryption key and is a separate migration prerequisite.

Keep each application on its source database until the restored destination
passes schema/data/Flyway and authenticated application acceptance checks.
Changing the PostgreSQL service source does not authorize an application
cutover or deleting its source database.

The base major is fixed to 17; its patch version must be recorded after deployment.
