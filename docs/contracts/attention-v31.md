# WORK QUEUE V3.1 web projection

Owner-approved handoff, 2026-11-16: fixed groups ACTIVE (진행중), COMPLETED
(완료), DEFERRED (나중에 확인). COMPLETED is owner acknowledgement. Producer
RESPONSE_COMPLETED remains an event and never completes an item by itself.
No command updates WorkTask, Waiting, proposals, evidence or approvals.

## Persistence and compatibility

V111 adds attention_lanes.queue_role and nullable attention_items.active_group.
Only lane roles are initialized from the saved 나중에 확인 name; no attention
item is backfilled. Renaming/reordering a lane preserves its role. Legacy OPEN
items project from their saved lane role. New items default ACTIVE even if the
first legacy lane is deferred. Explicit old-client lane moves clear the override;
old-client Stack moves retain it. Names, stored orders and source keys survive.

The V3 group command retains lane_id, stack_order, lane_order,
attention_sequence, created_at, source/generation and memo/revision. Completion
saves the previous active group; reopening restores it or explicitly chooses an
active group. DISMISSED is excluded and recoverable through existing history.
Old snapshot, history and lifecycle commands retain their contracts.

## Unified read and commands

GET /api/workflow/attention/feed accepts q (max 100), kind, intent, incomplete,
and cursor. It returns up to 100 OPEN/COMPLETED items, nextCursor, queueRevision,
ownerScope, serverTime and accurate filtered totals for all three groups.
Ordering is created_at DESC, id DESC, independent of stored order or updates.
Search includes action, canonical project label, verified summary and memo.
TITLE_FALLBACK and a duplicate action never qualify as meaningful summaries.

Cursors bind owner, normalized filters and queue revision. A concurrent queue
mutation returns 409 FEED_CHANGED; the client refreshes the loaded prefix before
continuing. Shared queue locks hold a consistent revision/count/page read;
private ETags include the actual returned items and totals, including external
project label changes. The partial owner/time/ID index supports keyset pages.
Filtered searches scan only that owner's eligible records; no global count or
unbounded history hydration is exposed. The UI labels loaded/total counts and
loads 100 more on request. CSS content visibility batches offscreen rendering.

POST /items/{id}/group accepts operationId, expectedRevision,
expectedGeneration and group. Existing owner-scoped operation replay and the
queue transaction make lifecycle/deferral changes atomic. Unknown groups,
producers and dismissed transitions are rejected. Lost-response retries reuse
operationId; confirmed conflicts require an explicit retry against latest state.

## Information and producer boundary

Generic historic actions remain unchanged in storage and display as
원본 작업 제목 미수집 with 이름 지정. Missing/untrusted summaries display
요약 정보 없음. Manual title editing and separately revisioned memo editing are
available in the details pane and inline memo editor.

Source.title is additive/optional (max 100). A new event carrying a verified
title can replace a generic initial action; source key/generation deduplication
still prevents retries from overwriting an existing item. Absent title is omitted
from legacy request hashes. Summaries retain SOURCE_PROVIDED, LOCAL_EXTRACTIVE
or EVENT_METADATA provenance. No historical enrichment or inferred title is run.

Audited producer repository: D:/DEV_Space/work-queue at
45e4da23122847a8d81b57dde5d4a70d628057cc, extension 0.1.5.
content.js already extracts a bounded new final-response excerpt. worker.js
forwards summary through com.studiokafka.workqueue native messaging;
trigger.rs fixes action to GPT 응답 확인 and drops the available tab title.
The native automatic-source allowlist does not accept title. This task does not
modify that Windows application or widen browser permissions. Consequently the
existing installed automatic pipeline cannot yet deliver Source.title; API
readiness does not establish installed-producer enrichment. A separately scoped
browser-only adapter/auth design, or a future explicitly authorized native
adapter change, is needed. Do not claim automatic title capture is complete.

## QA and rollback

Use qa/attention-v31-runtime.mjs and its owned loopback PostgreSQL only for
20/213/500 fixtures. qa/attention-v31-audit.mjs collects read-only hosted history
and canonical row digests with credential/content output suppressed. Production
QA must not move, complete, rename or edit any historic owner items.
Prefer a compatible roll-forward. Retain V111 and all new data; no down migration.
Older code can ignore additive columns, but old clients do not display V3 group
overrides. Use the canonical dedicated TEAM KAFKA browser for all browser QA.
