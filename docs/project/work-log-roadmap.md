# Work Log — Roadmap

Status snapshot for continuing this work in a future session without needing
the full history re-explained. See `docs/product/work-log-policy.md` and
`docs/contracts/work-log-contract.md` for the policy/contract this roadmap
implements against.

## Completed

- `ActivityCategory` generalized from `TimeBlockCategory`; shared model
  confirmed across Planning and Work Log.
- `StartTimeCriterion` backend vertical slice (catalog CRUD, no delete,
  user-scoped sort order).
- Work Log frontend: two-level `ActivityCategory` selector (대분류/중분류),
  independent table columns, default-child auto-selection (frontend
  mock-backed).
- `StartTimeCriteriaModal` UI polish (plain `HH:mm` text input, text-only
  status styling).
- `ActivityCategory` default-child backend contract (`is_default`,
  first-child-becomes-default, `PUT /api/activity-categories/{id}/default`).
- `WorkRecord` backend core (see commit history on `feature/worklog-backend-core`).
- Categorized `WorkTimeEntry` persistence.
- `WorkRecord.isOnTimeOverride` ("정시 출근 처리" MVP flag) — identified by a
  full Work Log frontend requirements audit (see
  `docs/backend/work-record.md` §8) as a real frontend concept with no
  backend field yet.
- Dedicated server-timestamped clock-in/clock-out/clock-times-clear action
  endpoints — replacing trust-the-client timestamps (`docs/backend/work-record.md` §9).
- `ABSENT` backfill scheduler, integrated with the existing Planning
  `workschedule`/`worksettings` domain so only planned work days without a
  record become an absence (`docs/backend/work-record.md` §10).
- Absence correction (`결근 정정`) backend endpoint — eligible only on a
  currently-`ABSENT` record, audit-stamped, idempotent
  (`docs/backend/work-record.md` §11).
- Explicit cross-user ownership/IDOR test coverage across all four Work Log
  domains, plus the first controller-layer (`@WebMvcTest`) test in this
  codebase for `WorkRecordController`.
- Sanitized error contract: `DataIntegrityViolationException` → `409` and a
  catch-all unexpected-exception → `500`, neither ever echoing the
  underlying exception's own message/class/cause (`ApiExceptionHandler`).
- **Critical fix found only by real-database HTTP smoke testing**: `WorkRecord`
  creation was silently broken against real PostgreSQL (`StaleObjectStateException`
  / `Detached entity passed to persist` on every first save) due to a
  client-assigned id + `@Version` combination confusing Spring Data JPA's
  new-vs-existing detection — invisible to the mock-based unit test suite.
  Fixed via `Persistable<UUID>` + a null (not seeded) constructor version.
  See `docs/backend/work-record.md` §7a for the full explanation.
- Real development-database validation completed: existing dev DB migrated
  V1→V11 cleanly (no data loss), Hibernate schema validation passed, full
  automated test suite green (including `contextLoads`, now that DEV_DB_*
  env vars are available), and a full HTTP smoke test covering the
  WorkRecord lifecycle (create/read/update/read/`409` version-conflict),
  WorkTimeEntry lifecycle (save/reload/modify/reload, identity preserved),
  absence lifecycle (create ABSENT → correct → read → re-correction
  rejected), clock-in/out/clear actions, and a full app restart with data
  confirmed to survive it. Smoke-test fixtures were deleted afterward by
  explicit id. Separately, the clean-migration path (V1→V11 against a
  brand-new, empty, isolated Postgres schema on the same instance —
  `auth.users` shared, `public` and all real data never touched) was also
  verified to succeed, then torn down.
- **Work Log MVP frontend integration** (`feature/worklog-mvp-integration`)
  — the Work Log route now runs entirely on the real backend; every
  operational mock (`getWeekRecords`/`getMonthRecords`/
  `buildTrendHistoryWeekRecords`, `MOCK_ACTIVITY_CATEGORIES`,
  `START_TIME_CRITERIA`) is removed. New `lib/api/workRecords.ts`,
  `lib/api/startTimeCriteria.ts`, and `app/worklog/mapping.ts` (backend DTO
  ↔ frontend shape mapping). `결근` (ABSENT) added as a real 6th
  `AttendanceStatus`, kept strictly distinct from `미입력` throughout
  (status enum, both donut implementations, the weekly/monthly tables).
  `WorkLogRecordDetailModal` now surfaces a `결근 정정` note and routes the
  save through the absence-correction endpoint whenever the record's
  current status is `ABSENT`. `WorkLogTable`/`MonthlyWorkLogView` now
  render genuinely sparse real data via `selectors.ts`'s new
  `buildDayEntries`/`groupDayEntriesByWeek` (a missing date renders a
  minimal non-interactive `미입력` row — including an entire empty week,
  which the old record-driven grouping would have silently dropped from
  the monthly view). `409` conflicts are handled explicitly (a dedicated
  modal, never a silent overwrite/auto-retry, with a "reload latest"
  recovery path); other request failures surface via a dismissible error
  banner. `StartTimeCriteriaModal` and the `ActivityCategory` default-child
  selector now use the real backend instead of frontend-local state.
  Verified end-to-end in a real browser against the real backend and
  PostgreSQL — see the integration branch's commit history for the full
  list of flows exercised (including a genuine `409` conflict + recovery
  and a real absence-creation-then-correction lifecycle), each confirmed to
  survive an actual page refresh. One backend defect
  (`WorkRecordService`'s on-time-override invalidation check) and one
  frontend defect (new records not being inserted into datasets that
  didn't already contain that date) were found and fixed during this
  integration — see the branch's commit messages for the full explanation
  of each.

- **Work Log MVP polish batch** (`feature/worklog-mvp-polish`):
  - Responsive layout stability across ~1440/1280/1024/800px — fixed the
    monthly attendance donut's legend labels (근무/휴일/연차/...) wrapping
    one Hangul character per line once the page's fixed 38%/1fr grid
    column got too narrow (now stacks below 1400px instead of compressing);
    added `whitespace-nowrap` to table/editor header cells that lacked it
    while their body cells already had it (`WorkLogTable`,
    `WorkTimeEntryEditor`, `StartTimeCriteriaModal`).
  - `ActivityCategory` management UI (`CategoryManagementModal`, opened via
    a new "카테고리 관리" toolbar button) — create parent/child, rename,
    activate/deactivate, set default child, all persisting immediately
    against the real backend. Backend gained the rename
    (`PUT /api/activity-categories/{id}`) and activate/deactivate
    (`PUT /api/activity-categories/{id}/active`) endpoints this UI needed —
    see `docs/backend/activity-categories.md` §5a/§5b.
  - Attendance working/non-working status-transition policy — a
    destructive-change confirmation before a working status
    (WORK/EARLY_LEAVE) with real clock-in/criterion/entries/score data
    transitions to a non-working one, atomic field-clearing on confirm, a
    clean (non-resurrecting) start on the reverse direction, and Korean
    translation for every backend validation message the frontend can
    still surface (`errorMessages.ts`) — see
    `docs/product/work-log-policy.md`'s "Status transitions" section.
  - Work Log (`근무 기록`) is now the default `/` route instead of Planning,
    matching its MVP-stage status as the primary feature.

## Current milestone: Work Log MVP is complete

Both the backend (`feature/worklog-backend-core`) and the frontend
integration (`feature/worklog-mvp-integration`) milestones are done — see
Completed above. The Work Log route is a real, PostgreSQL-backed daily
application rather than a frontend prototype. No known Work Log MVP gap
remains merely as a future roadmap item.

## Deferred (genuinely out of MVP scope)

- Deployment preparation.
- Any future product decisions not already covered by
  `docs/product/work-log-policy.md` (e.g. a document-submission/approval
  workflow for `결근 정정`, explicitly noted there as a later idea, not
  committed).

## Next available Flyway migration version

Check `backend/src/main/resources/db/migration/` for the actual highest
existing `V*` file before assuming a number — this section is a pointer, not
a substitute for looking. As of this milestone, migrations exist through the
`WorkTimeEntry` slice; the next available version is one higher than
whatever that highest file is.
