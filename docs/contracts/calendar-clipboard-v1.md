## 2026-09-21 superseding date semantics

Asia/Seoul target dates govern the resulting state independently for each item.
Plan copies stay Plan. Actual copies and moves to tomorrow or later become Plan;
today (including future clock times) and past dates permit Actual. Relative
placement, duration, valid categories, memo and presentation defaults survive.
New copies never inherit Actual source IDs, running state or execution links.
Existing transaction, owner scope, batch validation and temporary Undo contracts
continue to apply. Source-domain prerequisites still govern retained Actuals.

## Historical: 2026-09-20 locked update

This update supersedes old collision-blocking behavior below. Object paste is one transaction and permits overlapping intervals with a non-blocking frontend count (including overlaps within the pasted batch). Invalid domain metadata still rejects the transaction; explicit exclusion is available for invalid Actual entries. `POST /api/calendar/clipboard/move` accepts aligned `refs` and shifted `items`, updates original identities in one transaction and returns an owner-scoped 30-second Undo token; `POST /api/calendar/clipboard/undo-move/{token}` restores the prior placement. Actual moves retain their existing source edit contract.

The first copied item, rather than the earliest timestamp, is the anchor. Timed objects preserve duration and exact seconds; untimed Plans carry `date` plus null times and remain untimed. Title/domain/category/phase/memo are copied from authoritative source snapshots. Paste Undo deletes all newly created refs in one transaction; bulk-delete Undo retains original Plan/source identity and restores surviving Plan↔Actual links. Running records use explicit execution cancellation instead of regular delete/Undo.

# Calendar multi-selection and clipboard V1

Ctrl/Cmd-click toggles Planning, Actual source records and Visual Groups in one selection. Normal click selects one; Esc clears. C/V/D with Ctrl/Cmd copy/paste/duplicate; Delete/Backspace deletes with Undo. Inputs, textareas, editable content and native editor controls retain their text shortcuts. State and Attendance are excluded.

The clipboard lives only in the Calendar page session. Copy snapshots saved values after editor flush. Timed grid clicks establish an explicit date/time target; date headers preserve original time-of-day. Relative offsets and durations retain five-minute precision. Duplicate uses original positions. New entities receive new IDs; Activities never gain group membership.

Authenticated, owner-scoped endpoints under `/api/calendar/clipboard`:

- `POST /snapshot`: selection references `{kind, id, sourceType?}` → identity-free item descriptors.
- `POST /paste`: `{items, excludeConflicts}` → `{committed, results:[{index, created, error}]}`. Descriptors carry `plan`, `actual` plus `sourceType`, or `group`. Default false: one invalid Actual cancels the entire mixed batch. Explicit true excludes invalid Actuals. Existing cross-domain and intra-batch overlap, category, Work Log, workday, supplemental interval and timing rules apply. Every accepted set persists in one transaction; a persistence failure rolls it all back.
- `POST /delete`: references → one `undoToken`, deleting atomically.
- `POST /undo/{token}`: restores the batch atomically using existing Actual/Group Undo tokens and recreated Planning records. Tokens expire after 30 seconds, are owner scoped and are consumed only on success.

Operations are limited to 200 items. Clipboard placement never silently clamps or snaps internal offsets. Timed rules that cannot represent a shifted range are rejected. Weekday patterns shift with their group's dates; PER_DAY dates and CONTINUOUS endpoints shift together. No schema change or Visual Group rendering redesign.
