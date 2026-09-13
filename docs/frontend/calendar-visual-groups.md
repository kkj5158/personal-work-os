# Calendar Visual Groups V1

Visual Groups are Calendar-owned presentation context, separate from all
Planning, Actual, State, Attendance and Reflection activity data. The frontend
loads full intersecting entities from `/api/calendar/visual-groups`; no group
data enters Activity lane layout, overlap validation, duration or score totals.

`visualGroups.ts` validates four rules: ALL_DAY, SAME_TIME_EACH_DAY (ISO weekdays
1–7), PER_DAY (omitted dates are OFF), and CONTINUOUS (may cross midnight).
Enabled times use five-minute precision. A group is a single date-range entity
even across month/week boundaries. Slicing iterates only visible dates. Group
decoration lanes are calculated independently, so two overlapping groups remain
readable without changing Activity width/position.

The explicit Group creation mode belongs to TimeGrid. The shared pointer engine
calls `moveVisualGroup`/`resizeVisualGroup`; these functions accept only group
metadata. Moves snap their delta to 15 minutes while preserving an existing
five-minute offset. ALL_DAY changes dates; SAME_TIME_EACH_DAY shifts the common
range; PER_DAY moves all enabled overrides by a safe common offset, while slice
resize changes just that date; CONTINUOUS moves/resizes real start/end endpoints.

`VisualGroupLayer` is an absolute background layer. Its pointer targets are
compact headers and edges, with a sticky title below the date header. Full body
decoration does not intercept empty-grid Activity creation. Deeper overlaps
share narrower decoration columns; unlimited nested grouping is outside V1.

`VisualGroupEditor` exposes title, range, rule, per-rule controls, a Calendar-owned
color and immediate Delete. PER_DAY controls page seven dates at a time. The
existing palette is reused with a group-specific default-color label; semantic
WORK/LIFE category colors are never inherited.

`useVisualGroups` serializes valid autosaves and holds invalid intermediate
drafts locally. `leave` flushes healthy edits before invoking navigation and
guards failed/unfinished meaningful drafts. The page composes this with the
Activity editor's leave operation; the hook does not replace the shell guard.
Pointer commits use `commitMutation(id, transform)` to flush edits and apply the
transform to the latest saved entity. Failed gestures restore the prior group.
Deletion returns a server Undo token and restoration retains the same group ID.

Planning/Execution show groups by default; Compare defaults off. The Calendar
page and existing appearance preferences own persisted per-mode visibility.
