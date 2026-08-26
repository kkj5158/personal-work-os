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

## Current milestone: full Work Log backend MVP

Full scope: every backend gap found by a systematic audit of the actual
Work Log frontend (components, mock data, calculations) against the
already-implemented backend, validated against the real development
PostgreSQL database with automated tests, HTTP smoke tests, and a
restart/persistence check. See `docs/product/work-log-policy.md` for the
confirmed policy this implements against.

Remaining items in this milestone (tracked here as they land):

1. Explicit cross-user ownership/IDOR test coverage across all four
   Work Log domains.
2. Error-contract consistency review (sanitized unexpected-error responses).
3. Real development-database validation: migration path, constraint/index
   verification, full automated test suite, HTTP smoke tests, restart
   persistence check.

## Deferred (frontend-only — not part of the backend MVP)

- Work Log frontend real API integration — replace `mockData.ts` /
  `activityCategory.ts`'s local mock catalog and `START_TIME_CRITERIA` seed
  with real calls to `/api/work-records`, `/api/activity-categories`, and
  `/api/start-time-criteria`.
- Loading, empty, validation, and error states for the above — the current
  frontend has none of these because everything is synchronous mock data
  today.
- Optimistic-lock conflict UI — a real user-facing flow for the `409`
  response `WorkRecord` updates can return.
- Persisted `ActivityCategory`/`StartTimeCriterion` frontend integration —
  once real API integration lands, retire the frontend's local
  default-child map (`frontend/app/worklog/activityCategory.ts`) in favor
  of the backend's `isDefault` field.
- `결근 정정` (absence correction) frontend UI — no such UI exists on the
  frontend today; the backend endpoint is in scope for this milestone.
- Deployment preparation.

## Next available Flyway migration version

Check `backend/src/main/resources/db/migration/` for the actual highest
existing `V*` file before assuming a number — this section is a pointer, not
a substitute for looking. As of this milestone, migrations exist through the
`WorkTimeEntry` slice; the next available version is one higher than
whatever that highest file is.
