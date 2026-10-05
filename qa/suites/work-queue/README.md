# WORK QUEUE Integration/QA

Root owns shared DEV schema/application operations. Worker delivers committed code/tests; no Worker migration apply is automatic.

`AttentionMigration.java` supports `preflight`, `migrate`, `verify` using the existing QA audit/runtime classpath. Preflight/verify enforce PostgreSQL read-only, public schema, V71 baseline/exact canonical V72 pending, applied checksum validation, no failed/missing/future entries. Migrate additionally requires root-held shared QA lock (`QA_SHARED_LOCK_HELD=true`), acquires the schema advisory lock, repeats preflight and targets V72 only. Never calls clean/repair/baseline. Do not run against PROD; ordinary deployed startup owns its reviewed forward migration.

```powershell
java -cp $qaClasspath qa/suites/work-queue/AttentionMigration.java preflight
java -cp $qaClasspath qa/suites/work-queue/AttentionMigration.java migrate
java -cp $qaClasspath qa/suites/work-queue/AttentionMigration.java verify
```

After root reconciles/applies the migration, run managed QA against the exact clean candidate containing latest dev:

```powershell
npm run qa:integration -- work-queue --worktree D:/path/to/candidate --revision <full-SHA> --handoff D:/path/to/work-queue-handoff.json
```

The adapter audits shared history first and uses one marked run-owned Attention schema for writes. Canonical public WorkTasks/Projects are read only. Pairing traces/screenshots are disabled. Cleanup stops owned processes, verifies exact fixture ownership/table inventory, drops only named owned tables/schema with RESTRICT and proves owned DB connection cleanup. Unknown dependencies preserve the fixture. Sensitive codes/tokens remain test memory and must not enter artifacts.

The DEV browser identity path does not establish deployed Supabase/native acceptance; real JWT/security-chain tests accompany the runtime, and authenticated DEV/PROD owner native smoke remains a separate release gate. Desktop Chrome/Codex/offline/SQLite/tray/resource/installer checks are outside this POS suite. Optional Waiting delivery stays disabled. No aggregate TASK DONE is created by queue acknowledgement.
