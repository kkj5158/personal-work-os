# Shared Desk private daily backup

This short-lived Railway cron service makes a coherent PostgreSQL and file set.
It has no HTTP listener, public domain, persistent volume, API token, or frontend.
Use one service per environment, daily `0 18 * * *` UTC (03:00 KST), one replica,
restart policy `NEVER`, root directory `/ops/shared-desk-backup`, Dockerfile build.
The image clears the inherited PostgreSQL entrypoint. Its CMD is
`/app/entrypoint.sh backup`; Railway's custom start may use this same command.
The wrapper applies a coreutils process-group
timeout (TERM at the configured budget, KILL after another 30 seconds), covering
blocked DB drivers and pipes as well as normal streaming deadlines. The process
exits zero only after the
remote encrypted set is verified, committed, and retention succeeds.

## Configuration

Set secrets using Railway references or secure stdin. Never put values in Git,
command arguments, shell history, reports, Drive, screenshots, or build logs.

| Variable | Contract |
| --- | --- |
| `BACKUP_ENVIRONMENT` | `dev` or `prod`; namespace and source key validation |
| `BACKUP_DATABASE_URL` | Direct PostgreSQL URL; all database dump/read permission and advisory lock permission; no transaction pooler |
| `BACKUP_ENCRYPTION_KEY_B64` | Exactly 32 cryptographically random bytes, base64; environment only |
| `BACKUP_KEY_ID` | Stable nonsecret key identifier, e.g. `20261109-v1` |
| `DATA_S3_ENDPOINT`, `DATA_S3_REGION`, `DATA_S3_BUCKET` | Source data bucket HTTPS endpoint, SDK region, physical bucket name |
| `DATA_S3_ACCESS_KEY_ID`, `DATA_S3_SECRET_ACCESS_KEY` | Source bucket credentials; read access is sufficient for this job |
| `DATA_S3_PATH_STYLE` | `false` for Railway virtual host URLs |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET` | Separate private backup bucket; prefer a region distinct from PROD data |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | Only this backup service receives these credentials |
| `BACKUP_S3_PATH_STYLE` | `false` for Railway virtual host URLs |
| `SOURCE_REVISION` | Optional nonsecret deployed source commit |
| `BACKUP_MAX_DUMP_BYTES` | Optional ciphertext temporary-disk budget: plaintext dump maximum 16 GiB by default, hard ceiling 128 GiB |
| `BACKUP_MAX_SECONDS` | Optional total run budget: 10,800 seconds by default, hard ceiling 14,400 seconds |

The API service receives **data** bucket references only. The backup service
receives DB + data + backup references. Distinct physical bucket identities are
enforced. A bucket credential may be broader than read-only on providers without
per-prefix policies; the backup implementation never writes/deletes source data.
Use a dedicated private bucket and credentials, no public CORS, no assumed
versioning, lifecycle, object lock, cross-account replication, or malware scan.

The key is required to recover every archived set. Losing it loses recovery.
Keep the key ID and recoverable Railway secret access under owner control; do not
rotate or remove an old key while its retained sets are needed. A different key
or key ID causes authentication failure and stops pruning. This version uses
one configured key; coordinated multi-key rotation is a separate operation.

## Consistency and encryption

Before running the job, deploy the API cleanup guard. Both components use the
database-local two-integer advisory lock `(1396982321, 1)`: maintenance takes the
shared session lock nonblocking and skips its entire sweep if a backup holds the
exclusive counterpart. Backup holds its exclusive session through the exported
repeatable-read snapshot, full `pg_dump --snapshot`, table manifest, all actual
READY bytes (including trash), completion, and retention. Normal app writes
continue. Immutable READY keys make files committed after the snapshot irrelevant.
Only maintenance physically removes published files; failed uncommitted adapter
copies are not READY and are not part of the snapshot.

The full logical database dump includes application/auth schemas and data, but
not cluster-global roles/passwords/tablespaces. `--no-owner --no-acl` makes restore
map ownership to its restore role. Existing policy-referenced roles and required
extensions must be available on the isolated restore cluster. Do not claim this
is a replacement for PostgreSQL physical/PITR backup. Railway native volume
backups are useful additional protection, but do not include this file bucket.

Each artifact derives an independent AES-256-GCM key from the master key and a
random 256-bit salt (HKDF-SHA256). Authenticated one-MiB frames bind the complete
header, run/artifact identity, and monotonic frame counter. A mandatory encrypted
empty end frame rejects truncation; trailing bytes are rejected. Only ciphertext
is written to temporary disk, one artifact at a time. Source objects are bounded
to 100 MiB; clients stream one-MiB frames and restore parts up to eight MiB.
Large database dumps use bounded RAM but require sufficient ephemeral disk for
one encrypted dump. Metadata digest cursors fetch at most eight rows per batch,
including worst-case JSON escaping of one-MiB text bodies. Server table ordering
may use PostgreSQL temporary disk.

Under `shared-desk-backup/v1/<environment>/<timestamp_uuid>/`:

- `metadata.enc`: full custom-format snapshot dump.
- `object-NNNNNN.enc`: actual READY bytes verified against stored size/SHA-256.
- `manifest.enc`: encrypted owner/item/key mapping, metadata/object checksums,
  deterministic row counts and SHA-256 for all Shared Desk tables, and pending
  upload count. Private names and row bodies never appear in logs.
- `started.json`: HMAC-authenticated inventory written before artifact uploads.
- `complete.json`: HMAC-authenticated commit marker written **last**, only after
  every remote artifact is downloaded, authenticated, and SHA/length verified.

A failed set is never a recovery candidate. Retention keeps the latest completed
set for each of the seven most recent UTC dates; extra same-day completed sets
are replaced. Failure never evicts a prior good daily set. Every deletion uses
an exact artifact name from an authenticated inventory in this job's namespace,
and requires individual DELETE acknowledgement plus HEAD 404. Incomplete sets
older than 48 hours are pruned only from a signed `started.json` inventory.
Unknown objects are preserved. No data-bucket listing or prefix deletion occurs.

## Observability

`status.json` at the environment namespace is HMAC authenticated and contains
only state, timestamps, counts, run ID, and allowlisted error code. The service
prints one sanitized JSON result and returns nonzero on failure. Railway's cron
execution/deployment failure remains the native failure signal. No email, Slack,
external alert delivery, or budget alert is implied without a verified route.

`/app/entrypoint.sh status` fails for absent completed backups, latest completion
older than 26 hours, or a last job failure. `python runner.py verify --run-id ID`
reauthenticates and downloads the complete set without restoring. Monitoring
must check freshness as well as process failures; inspect the cron run history
and signed status at least daily until an independent freshness monitor exists.
RPO 24 hours and RTO four hours are targets; record measured backup/restore time
and data size separately. First manual success is not proof a scheduled trigger
has fired, and a small synthetic restore is not a production-size SLA.

## Isolated restore

Run the **same pinned image and revision** with the same backup/data configuration
and key. Set these additional secrets/references:

- `RESTORE_ISOLATION_ACK=isolated-empty-database-and-bucket`
- `RESTORE_DATABASE_URL`: an empty isolated database whose name is exactly
  `shared_desk_restore_<12..32 lowercase hex characters>`, different from source.
- `RESTORE_S3_ENDPOINT`, `RESTORE_S3_REGION`, `RESTORE_S3_BUCKET`,
  `RESTORE_S3_ACCESS_KEY_ID`, `RESTORE_S3_SECRET_ACCESS_KEY`,
  `RESTORE_S3_PATH_STYLE`: a private **empty** bucket different from source and
  backup. No app may be connected to this target during restore.

Execute `/app/entrypoint.sh restore --run-id ID`. No credentials belong in the
command. The restore authenticates every artifact before any target writes,
then downloads the authenticated metadata ciphertext to a temporary encrypted
cache and decrypts that local cache into
`pg_restore --single-transaction --exit-on-error`. This prevents a live S3 GET
from expiring while database DDL/COPY applies backpressure. The cache is removed
on success or failure; no plaintext dump or encryption key is written to disk.
Keep the selected completed set protected from retention for the entire restore:
do not run a new backup concurrently, and plan around the next timed trigger or
use the platform's approved pause/resume controls. A later same-day successful
backup replaces the earlier same-day set. Resume the daily schedule after the
drill or recovery completes; do not leave it paused.
It verifies all Shared Desk table counts/digests, validated foreign keys, exact
owner/file references, and restored object byte sizes/SHA via actual target GET.
Source metadata/objects are never changed. Exact original final keys go only to
the isolated target bucket, preserving relational references without rewriting.
It never drops a database, hard-deletes source data, or switches app references.
Failure leaves the isolated target for investigation and prevents automatic
cutover. Keep it disconnected. Clean up only the individually recorded target
objects and explicitly owned restore database after saving sanitized evidence.

Pending UPLOADING/VERIFYING metadata is restored as snapshot evidence but its
unpublished bytes are not archived. Reissue those uploads before any approved
recovery cutover; never advertise them as restored READY files. A real cutover
also requires auth/extension/role configuration review, API storage references,
auth/owner/download smoke, and explicit serialized deployment ownership.

The current project databases require `supabase_vault` 0.3.1. The ordinary
PostgreSQL client image and this laptop's Windows PostgreSQL installation do
not provide that **server** extension. Use the project's compatible server in
`infra/railway-postgres17` for a full isolated database restore; do not filter
the Vault schema or ignore `pg_restore` errors. The backup/restore **client**
can remain in the pinned PostgreSQL 18.6 job image. The compatible server stores
its Vault encryption key on its private PostgreSQL volume; a logical dump does
not include that file. Count-only read-only audits found zero Vault secrets in
DEV and PROD on 2026-11-09. If Vault is used later, preserve its original private
key through the existing physical-volume recovery controls. Shared Desk does
not use Vault, and this job does not claim to recover Vault-encrypted secrets.

The 2026-11-10 KST DEV drill authenticated a 174,250,085-byte compressed full
database dump and four actual READY/trash files totaling 104,857,748 bytes,
including a 100-MiB multipart restoration. All eleven Shared Desk table hashes,
foreign keys, owner references and actual restored object GET hashes matched.
The source objects were reread unchanged, the temporary object keys were
individually deleted/HEAD-404 verified, and the owned restore database was
dropped. Total successful helper duration was 1,013 seconds over a public TLS
database connection; this is a dataset-specific measurement, not an RTO
guarantee. Earlier failed Windows-extension and streaming attempts are retained
in the evidence. A missing extension is confirmed; the exact underlying cause
of the earlier broadly labeled `CIPHER_AUTH` failure was not recorded.

The daily UTC schedule was configured and the native cron engine's manual
execution verified. A first timed daily trigger and independent external alert
delivery must be reported separately; neither is implied by this drill.

## Validation and image provenance (2026-11-09)

`python -m unittest discover -s ops/shared-desk-backup -v` runs synthetic crypto,
scope, corruption, and retention tests. Real local PostgreSQL tests require
`BACKUP_TEST_DATABASE_URL=postgresql://desk_backup_test@127.0.0.1:55491/postgres`;
the runner only creates/drops its own random fixture databases there. Configure
`PG_DUMP`/`PG_RESTORE` paths if PostgreSQL tools are not on PATH. They exercise
full snapshot dump/restore, trash file bytes, memo/reply references, and both
advisory-lock directions. `scripts/shared-desk-test.ps1` additionally runs the
Java maintenance guard against its owned loopback PostgreSQL fixture.

The Docker Hub primary registry was read on 2026-11-09: pinned
`postgres:18.6-bookworm` index digest
`sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5`;
linux/amd64 manifest `sha256:02fb3245e038f33536cf13bc6c4e59f21d07b0cea3c1fe1c07c6e8aa8f083bcc`,
configuration reports `PG_VERSION=18.6-1.pgdg12+2`. Python packages (including
transitive packages) are version pinned. Local tests use installed PostgreSQL
18.4; actual Docker build and live private-provider backup/restore must be
reported separately. No Docker executable was available on this laptop.
