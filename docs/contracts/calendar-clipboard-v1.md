# Calendar multi-selection and clipboard V1

Ctrl/Cmd-click toggles Planning, Actual source records and Visual Groups in one selection. Normal click selects one; Esc clears. C/V/D with Ctrl/Cmd copy/paste/duplicate; Delete/Backspace deletes with Undo. Inputs, textareas, editable content and native editor controls retain their text shortcuts. State and Attendance are excluded.

The clipboard lives only in the Calendar page session. Copy snapshots saved values after editor flush. Timed grid clicks establish an explicit date/time target; date headers preserve original time-of-day. Relative offsets and durations retain five-minute precision. Duplicate uses original positions. New entities receive new IDs; Activities never gain group membership.

Authenticated, owner-scoped endpoints under `/api/calendar/clipboard`:

- `POST /snapshot`: selection references `{kind, id, sourceType?}` → identity-free item descriptors.
- `POST /paste`: `{items, excludeConflicts}` → `{committed, results:[{index, created, error}]}`. Descriptors carry `plan`, `actual` plus `sourceType`, or `group`. Default false: one invalid Actual cancels the entire mixed batch. Explicit true excludes invalid Actuals. Existing cross-domain and intra-batch overlap, category, Work Log, workday, supplemental interval and timing rules apply. Every accepted set persists in one transaction; a persistence failure rolls it all back.
- `POST /delete`: references → one `undoToken`, deleting atomically.
- `POST /undo/{token}`: restores the batch atomically using existing Actual/Group Undo tokens and recreated Planning records. Tokens expire after 30 seconds, are owner scoped and are consumed only on success.

Operations are limited to 200 items. Clipboard placement never silently clamps or snaps internal offsets. Timed rules that cannot represent a shifted range are rejected. Weekday patterns shift with their group's dates; PER_DAY dates and CONTINUOUS endpoints shift together. No schema change or Visual Group rendering redesign.
