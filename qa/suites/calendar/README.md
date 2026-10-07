# Calendar quality release regressions

The 12 declared browser cases cover operation identity (not content dedupe),
server commit followed by response loss/retry, local draft/autosave, category
recovery, date-owned review, real five-minute Day/Week move and resize, 23:59,
rapid navigation, preference mode, Seoul Today, inactive Week editor, and nearby
State/Plan conversion/adjacency. Only DEV receives injected network failures.

Run with the managed integration runner after applying the reviewed migration:
`node qa/runtime/cli.mjs calendar --mode integration --revision <full SHA> --timeout 1800000`.
Frontend and backend use the same committed checkout; Flyway validation is read-only
and startup migrations remain disabled. Normal DEV authentication uses the
configured owner provider, while actual Supabase authentication needs separate
authenticated PROD verification.

Fixtures use the past date 2001-01-08, unique QA titles, and immediate exact-ID
cleanup registration. Source deletes use normal APIs. Operation receipt cleanup
requires registered UUID + configured owner + QA content/date + absent source,
and rolls back on any ownership mismatch. No broad date/user deletes occur.
The optional CalendarMigration Java tool performs only the explicitly reviewed
forward V73→V74 DEV transition under the caller-owned shared QA lock; it never
repairs, cleans, rewrites history, or modifies user records.
