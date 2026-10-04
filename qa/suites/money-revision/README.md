# Controlled V71 DEV migration

Central Integration/QA runs this source explicitly; the ordinary QA harness still never migrates a database. Run from the approved application checkout's `backend` directory with the existing QA audit/runtime classpath and `DEV_DB_URL`, `DEV_DB_USERNAME`, `DEV_DB_PASSWORD`. `QA_MIGRATIONS` may name that checkout's canonical migration directory; otherwise it defaults to `src/main/resources/db/migration`.

```powershell
java -cp $qaClasspath D:/path/to/checkout/qa/suites/money-revision/MoneyRevisionMigration.java preflight
java -cp $qaClasspath D:/path/to/checkout/qa/suites/money-revision/MoneyRevisionMigration.java migrate
java -cp $qaClasspath D:/path/to/checkout/qa/suites/money-revision/MoneyRevisionMigration.java verify
```

`preflight` and `verify` enforce PostgreSQL read-only connections. `migrate` repeats preflight under its own session advisory lock, then targets V71 only. All modes pin Flyway to schema `public`, reject embedded URL credentials and non-public `currentSchema`, validate applied checksums, and report history versions/scripts/checksums without credentials. Preflight requires an applied V70 baseline with exactly the canonical V71 pending. Verify requires successful V71 and no pending, failed, missing or future migrations. The utility never calls repair, clean, baseline or fixture creation.

Root Integration/QA owns authorization, shared-runtime serialization, migration execution and evidence. A failed outcome must be inspected with `verify` and the existing redacted diagnostics before retrying. Do not execute this utility against production or from a run-owned fixture environment.
