# Calendar date annotations — 2026-10-24

The existing WORK_OS `reflection_entries` table owns one row per authenticated
user and local date. Calendar projects it in all Actual/Plan/Compare modes.
NOTE SYSTEM keeps using the same ReflectionProvider entry, content, completion
state and frozen PLAN/ACTUAL/STATE snapshot. Date annotations do not create
scheduled activities or contribute to totals.

| Existing implementation | Requested delta | Owner / API / UI | Regression risk |
| --- | --- | --- | --- |
| Unique user/date ReflectionEntry, JPA version | Add nullable daily annotations | WORK_OS, additive V93 | Preserve historical rows, snapshots and NOTE fields |
| GET/POST date, versioned content and transitions | PUT `/api/reflections/{date}/daily` | Same owner/date lookup and version | Reject stale version; owner remains auth derived |
| Calendar frozen snapshot editor | Compact seven date cells or one day panel | `DailyReflection` shared component | Separate annotation edits from snapshot/content/status |
| Existing unscheduled data included in snapshots | Root Calendar removes default lanes | Existing sources and snapshot stay intact | No historical data deletion |

Daily value: optional one-line `title` up to 100 UTF-16 code units,
optional integer `dayScore` 0–100 inclusive, optional integer `moodLevel` 1–5,
and optional multiline `memo` up to 10,000 UTF-16 code units. The database also
enforces ranges, single-line titles and text column lengths. Empty/unset fields
are null; zero is an entered score. Score and mood never derive one another.
Mood mapping: 1 😞 매우 나쁨; 2 🙁 나쁨; 3 😐 보통; 4 🙂 좋음; 5 😄 매우 좋음.

The daily PUT replaces only those four annotations using `expectedVersion`.
It does not alter NOTE content, status or frozen snapshot, including completed
entries. All mutations share the original optimistic version counter. Old
clients ignore additive response fields and retain their content API. Apply
V93 before the server release; old servers reject the new daily endpoint, and
the client retains input with an error rather than reporting a successful save.

Each browser queue is scoped to the initiating account and date. Requests are
serialized, delayed text input respects composition, score/mood writes flush
immediately, and navigation drains pending work through the host's registered
guard. Date/view unmounts retain the queue in memory and initiate flushing.
API requests verify the original account before attaching a current token.
Draft text is never written to local/session storage or telemetry. Offline
errors retain input, offer retry, and retry on reconnect. Closing/reloading
the browser with pending work invokes its unsaved-change warning. A full browser
termination can lose an unsaved memory-only draft.
Clean rows revalidate on focus/visibility changes. A delayed revalidation cannot
replace a dirty draft or a write completed after the revalidation began.

A 409 refetches the row and merges only untouched annotation fields. Concurrent
NOTE/content/status changes therefore remain intact. A conflict in the same
annotation retains both server data and the local draft until the user explicitly
selects “내 입력으로 다시 저장”. No automatic last-writer overwrite is used.

Validation: targeted reflection service/security tests, queue/DOM tests and
type/lint checks. `ReflectionDailyPostgresTest` accepts only the explicit isolated
fixture environment `QA_REFLECTION_PG_URL` / `QA_REFLECTION_PG_USERNAME`; schema
and synthetic users/rows roll back. Integration/QA owns full migration-chain,
DEV and real-browser verification. No shared or PROD database mutation is part
of this slice. Operational fallback is to hide the new UI or roll back the
application while retaining additive nullable columns; never drop historical data.
