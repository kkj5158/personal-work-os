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
- `WorkRecord` backend core (this milestone — see commit history on
  `feature/worklog-backend-core`).
- Categorized `WorkTimeEntry` persistence (this milestone).

## Current milestone (in progress / just completed on this branch)

1. `ActivityCategory` default-child backend contract
2. `WorkRecord` backend core
3. Categorized `WorkTimeEntry` persistence
4. Supporting documentation and tests for all of the above

## Next milestones, in order

1. **Work Log frontend real API integration** — replace `mockData.ts` /
   `activityCategory.ts`'s local mock catalog and `START_TIME_CRITERIA` seed
   with real calls to `/api/work-records`, `/api/activity-categories`, and
   `/api/start-time-criteria`.
2. **Loading, empty, validation, and error states** for the above — the
   current frontend has none of these because everything is synchronous mock
   data today.
3. **Optimistic-lock conflict UI** — a real user-facing flow for the `409`
   response `WorkRecord` updates can now return.
4. **Persisted `ActivityCategory` and `StartTimeCriterion` integration** —
   once (1) lands, retire the frontend's local default-child map
   (`frontend/app/worklog/activityCategory.ts`) in favor of the backend's
   `isDefault` field.
5. **`ABSENT` scheduler** — a scheduled job that writes explicit `ABSENT`
   rows for past dates that were never recorded.
6. **`결근 정정` (absence correction) frontend/backend flow.**
7. **Database-backed summaries and trend charts** — Work Log's trend charts
   currently run on hardcoded/mock aggregates; replace with real queries.
8. **End-to-end persistence verification** against a real datasource.
9. **Deployment preparation.**

None of milestones 1–9 above are implemented as part of the current
milestone — they are the defined next steps for a future session.

## Next available Flyway migration version

Check `backend/src/main/resources/db/migration/` for the actual highest
existing `V*` file before assuming a number — this section is a pointer, not
a substitute for looking. As of this milestone, migrations exist through the
`WorkTimeEntry` slice; the next available version is one higher than
whatever that highest file is.
