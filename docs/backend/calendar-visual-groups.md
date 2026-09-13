# Calendar Visual Group V1

Calendar owns Visual Groups as presentation/context metadata, independent of Planning, WORK/LIFE Actual, State, Attendance and categories. Groups can overlap any other layer and one another. They never participate in activity totals, Reflection snapshots, overlap checks or activity lane allocation.

## Persistence

`V35__calendar_visual_groups.sql` adds `calendar_visual_groups` and normalized `calendar_visual_group_days`. A group keeps one identity across weeks/months. Date range queries return whole groups whose inclusive date bounds intersect the requested range; the frontend computes visible slices.

The parent carries owner, title, date bounds, time rule, Calendar color, optional common/boundary times and a seven-bit ISO weekday mask. PER_DAY overrides have their own row identity, date, enabled flag and optional times. Missing dates are OFF. Disabled overrides store null times. Replacing overrides reuses existing date rows and removes obsolete rows; deleting a group cascades only its override rows. A composite foreign key prevents an override from belonging to another owner.

All four rules require a nonempty title (maximum 200 characters), ordered inclusive date range and `#RRGGBB` color. Time inputs use five-minute precision:

- `ALL_DAY`: no time fields.
- `SAME_TIME_EACH_DAY`: same-day start before end and at least one ISO weekday (Monday=1, Sunday=7).
- `PER_DAY`: every enabled override has a same-day start/end pair, unique date and date inside the group range. Empty override lists are valid.
- `CONTINUOUS`: combined end date/time after combined start date/time. This rule may cross midnight and does not change Actual timing policy.

Fields that do not belong to the selected rule are normalized away. Changing the time rule clears obsolete overrides. Overlap never creates membership or moves activities.

## API

Base path: `/api/calendar/visual-groups`.

| Method/path | Behavior |
|---|---|
| `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD` | Owner-scoped intersecting groups |
| `GET /{id}` | Owner-scoped detail |
| `POST` | Create, returning 201 |
| `PUT /{id}` | Replace an existing owned group's editable fields |
| `DELETE /{id}` | Delete immediately, returning `{undoToken}` |
| `POST /undo/{token}` | Restore the same group identity and all overrides |

Create/update fields: `title`, `startDate`, `endDate`, `timeRule`, `color`, nullable `startTime`/`endTime`, `weekdays: number[]`, and `days: [{date,enabled,startTime,endTime}]`. Responses add `id`, `createdAt`, `updatedAt`; arrays are returned even when empty. Color is normalized to lowercase.

Undo matches existing Calendar semantics: owner-scoped single-use token, 30 seconds, held in the serving process. It is published after deletion commits, cannot overwrite an existing ID, and remains usable after a rolled-back restoration attempt. A process restart expires pending Undo tokens. Other owners' reads/updates/deletes/restores return 404.

## Actual drag API reuse

`PUT /api/calendar/actual/{sourceType}/{id}` already changes the original source's date and timing together. A null time pair unschedules while retaining the submitted exact duration, category/title/memo and source ID. WORK moves require an existing destination Work Log, and regular WORK requires a working day; Calendar does not fabricate Attendance. Same-day five-minute timing validation and cross-domain overlap checks still run before mutation. Overlap errors identify the conflicting time range and WORK/LIFE source.
