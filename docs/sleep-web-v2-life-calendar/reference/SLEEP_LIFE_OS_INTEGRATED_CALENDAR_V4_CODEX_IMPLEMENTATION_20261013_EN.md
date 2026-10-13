# [CODEX IMPLEMENTATION] POS Sleep Web V2 + LIFE OS Integrated Calendar V1

## Mission and authority

Implement the owner-approved desktop-first UX represented by the attached **SLEEP_WEB_V2_LIFE_CALENDAR_SYS_COMPACT_V4_20261013.html**, including (1) the Sleep Web V2 usability redesign and (2) a distinct LIFE OS integrated calendar that combines existing Sleep, Nap, Exercise, and Calendar SYS data. This is an **implementation and verification task**, not another planning/mockup exercise.

Use the attached `SLEEP_WEB_V2_CALENDAR_BOUNDARY_20261013_KO.md` as the calendar ownership/integration handoff. First inspect the real repo, deployed routes, latest approved policies, existing Android/Sleep contracts, WORK FLOW/Calendar SYS records and Exercise service. Where a mock interaction disagrees with real domain contracts, preserve the real contract and document the deviation; do not assume demo records, their identifiers, or browser localStorage are the production data source. Do not silently fill functional gaps with invented records.

### Approved product structure

- **LIFE OS → SLEEP** has exactly three top-level submenus: **Sleep**, **Statistics**, **Settings**. Combine the old Sleep Overview and Sleep Records menus into one **Sleep** workspace. The default Sleep view is the **weekly sleep time-distribution/editing timeline**.
- Inside Sleep, retain the three subviews **Daily / Weekly (default) / Monthly**. Daily: date-specific details and main-sleep/nap create, inspect, correct, delete and applicable recommendation review. Weekly: main editing work surface. Monthly: overnight-sleep/nap duration summary and detailed time-of-day distribution.
- **LIFE OS → Integrated Calendar** is a separate LIFE OS page, not a fourth SLEEP submenu. Provide **day/week/month** modes; week is the prototype default until a contrary approved policy is found.
- **Statistics** emphasizes per-recorded-night mean main sleep and per-nap mean duration (not seven-day totals as the primary metric); missing/unrecorded values are not zero. Preserve existing server metrics/coverage and domain definitions.
- **Settings** preserve the existing shared bedtime/wake reminders and Android device assignment policy. A browser does not become a native alarm/phone-usage collector.

### Visual source and interaction priorities

Match the HTML's **desktop-first POS visual language**: existing POS shell/global navigation, restrained toolbar, compact KPI rows, high-density timeline/table, right-side context inspector, polished typography and horizontal information usage. Do not simply stretch the Android/mobile design to desktop. Responsive use must remain workable on laptops and touch/mobile, but desktop is the primary review target.

Keep the Sleep calendar especially readable: accurate time labels and grid, midnight separation, start/end time and duration on sleep and nap intervals, explicit visual distinction, day summaries, detailed monthly time-of-day distribution. Overnight sleep is visually segmented between dates when needed but remains **one original record**.

In **Integrated Calendar**, follow these category-specific emphasis rules:

1. **Main sleep/nap**: primary records; show accurate real interval positions and sleep/napping identity. Nap remains a separate type within the Sleep-owned domain.
2. **Exercise**: primary records; visually emphasize short sessions (often 30–60 minutes) with the approved enlarged blue **workout card**, minimum readable visual card height approximately **96 CSS px**, showing **workout name, start/end, total duration, and planned/completed state**. Keep the actual time anchor, interval and drag/resize arithmetic exact; enlarged height is *presentation only*. Where a larger card extends beyond its physical interval, add a clear time-occupancy cue/anchor, manage collisions/layering and maintain access to other events rather than visually implying extra occupied time. Do not distort the single shared clock grid. Test dense/overlapping events, short sessions and screen boundaries.
3. **Calendar SYS**: **secondary contextual blocks** from actual existing persisted Calendar SYS/workflow calendar data. Render in a subdued color, compact small label/card (about 24–35 CSS px in the approved mock), with a thin visible indication of the **true occupied interval** and click-to-inspect details. Do not turn these into dominant full-height cards or displace sleep/exercise. Filter visibility. Read-only viewing in this scope; for editing navigate to the established Calendar SYS source interface if available. Do not create fake events to fill empty gaps. Their presence and times must come from canonical persisted data.

Both categories of calendars should support source visibility filters, details and appropriate empty/loading/error states. Keep the current approved layout and all unrelated styles/operations unchanged where possible.

## Domain ownership and synchronization: hard requirements

- Sleep/night main records and naps are owned by the **existing Sleep domain**. Exercise sessions are owned by **existing POS Exercise**. Calendar SYS entries are owned by the **existing Calendar SYS/workflow calendar** source. Integrated Calendar is an **aggregation/read-and-command view**, not a duplicate store.
- Build normalized **display view models/adapters only** (source type, original ID, exact start/end instants, display zone, source attribution day, mutable/readonly, revision/concurrency info, source-specific deep link). Never introduce a second authoritative sleep, nap, or exercise table, and never migrate existing facts into copies.
- Audit actual repository and API contracts rather than inventing endpoint names. Implement a read adapter/service only where actually needed, reusing owner authorization and source APIs. Aggregation may occur server-side or in the client depending on actual contracts and performance.
- Range reads must include **intervals intersecting the visible period**, not only items whose start belongs to the period. Fetch sufficient previous/next boundary data if existing APIs only return by attribution date; avoid missing overnight records on the first column of a week/month.
- Sleep canonical attribution remains the existing backend's logical wake/expected date behavior, and nap attribution remains its original local-start-date policy where applicable. Visual display is **Asia/Seoul** for this view; preserve canonical UTC instants, endpoint timezones/offsets, DST ambiguity semantics and source revisions. Do not rewrite existing stored instants based on local mock timestamps.
- Overnight 2026-10-12 23:15 → 2026-10-13 07:30 is one source record displayed on both relevant dates; never split it into two writes, assign a new ID, or double-count its full duration.
- **All sleep and nap edits**, whether by drag, resize, direct entry, Sleep page or Integrated Calendar, must go through the existing Sleep action envelope/revision/idempotency/conflict rules. Do not silently overwrite a newer Android or Web record. Preserve previously persisted source/certainty/endpoints if only one end is edited. An unconfirmed or unsuccessful write leaves the original record untouched, preserves the local proposed change, and offers recovery/refresh/compare options. On confirmed success, re-fetch/invalidate Sleep views, aggregated calendar, and relevant metrics.
- **Exercise edits** must use existing Exercise session update contracts and concurrency rules, preserving sets, exercises, history, state and non-time fields. Check whether planned and performed sessions have different policies and honor them.
- **Calendar SYS** is read-only in Integrated Calendar V1; preserve its original identity, status, recurrence occurrence semantics and security. Never alter event IDs, copy records into Sleep, or claim integration success unless backed by real source reads.
- Keep existing Android outbox/sync behavior, pending operation preservation, current main-sleep recommendation workflow, conflict handling, deletion semantics and authenticated owner isolation. The Web displays server-confirmed records, not Android-only untransmitted records.

## Core interactions

- Sleep default weekly timeline: navigate weeks and return to recent seven days; select record to inspect, move block vertically/horizontally where supported, resize both ends where complete; present original/proposed date, start, end, duration and a **single explicit Save**. Cancel must reset only unsaved preview. Include adjacent days and midnight edges.
- Daily: main sleep and nap in the same view; retrospective nap recording by direct start and end **date/time** (no duration preset, countdown, nap alarm or separate nap top-level tab). Multiple naps per date; create/edit/delete with current safe server behavior.
- Monthly: duration and time-of-day distribution for main sleep and naps, choose a date to see daily details; support accurate partial-day visualization without reassigning or duplicating source records.
- Integrated Calendar: navigate day/week/month; filters for Sleep, Nap, Workout and Calendar SYS; click any block for a source-aware detail inspector. For Sleep/Nap/Workout, dragging or resizing creates a **preview**, not an automatic backend write. Verify revision and source-specific contract on Save. Calendar SYS blocks open read-only details and source navigation.
- Keyboard access and focus states for all actions; do not make pointer drag the only way to modify a time. Date/time forms and screenreader-friendly labels must offer equivalent editing.
- Preserve existing reminder setting save UX, and continue to expose existing phone-usage-based sleep suggestions only to the extent actual backend data supports it. Do not fabricate Android candidate detection on Web.

## Implementation process

**Phase 0 — Baseline / release safety:** Inspect current dev/prod commits, branches, existing Sleep V1, Exercise, Calendar SYS, global POS shell/navigation and implementation docs. Read `/AGENTS.md`, `/agent/README.md`, operating/Git/validation/production policies and any applicable current canonical specs. Check concurrent worktrees and ongoing deployments. Identify canonical Calendar SYS source and Exercise API. Verify baseline behavior; preserve changes owned by other agents. Report exact gaps before writing, but **continue automatically** with non-destructive implementation.

**Phase 1 — Sleep Web V2:** Implement merged Sleep workspace and 3-menu structure, detailed Daily/Weekly/Monthly, Sleep-specific calendar polish, and mean-based statistics, reusing Sleep backend/API. Avoid redundant migration if V78 nap storage and the required contracts already exist.

**Phase 2 — LIFE OS Integrated Calendar:** Create the distinct page in established LIFE OS navigation; implement source adapters and full day/week/month views, drag/resize previews for mutable sources, Sleep/Exercise original-entity write-through, Calendar SYS compact read-only overlay, and cross-page cache/query invalidation.

**Phase 3 — Visual and functional QA:** Compare real browser captures against the HTML V4 at desktop widths **1366px and 1600px**, laptop **1024px**, and mobile **390px**; verify light/dark and accessibility. Screenshot weekly layout, workout enlarged cards, overlapping compact Calendar SYS overlays, midnight sleep segments, monthly summaries, edit inspector, save preview/conflict. Use real test fixtures or explicitly isolated synthetic DEV records. Do not claim tests passed without executing them.

**Phase 4 — DEV→PROD:** Run frontend lint/typecheck/build and backend/API regression tests relevant to actual changes, including signed-in ownership and rejection of cross-owner records. Perform DEV deployment and authenticated UI/API smoke. Promote to PROD **only after all required existing release gates pass**, then verify production read paths and safe authenticated smoke without polluting or deleting personal data. If a critical credential, concurrency, approval, schema, auth or source-API blocker remains, stop that affected release step and report it explicitly; do not fake completion.

For browser-based QA, use the designated TEAM KAFKA Chrome profile, not the owner's personal Chrome profile. Do not create Chrome tab groups, move existing tabs into groups, or mix QA tabs with the user's personal browsing.

## Minimum acceptance matrix

1. SLEEP sidebar has only Sleep / Statistics / Settings; Integrated Calendar lives separately under LIFE OS.
2. Sleep opens its weekly editing timeline by default, with Daily/Weekly/Monthly working and direct nap entry.
3. Main sleep and naps share the same canonical IDs/versions in Sleep and Integrated Calendar; no duplicate source rows or writes.
4. 23:15–07:30 overnight record renders on both calendar days, retains one ID and one canonical duration; boundary-range reads do not drop it.
5. Dragging an existing main sleep or nap through Integrated Calendar produces the same confirmed backend source change visible in Sleep Web (and to Android after Android synchronization); cancellation/error preserves original.
6. Updating Exercise time preserves its workout exercises/sets/other fields, and source changes appear on Integrated Calendar.
7. A 30-minute workout renders with a readable expanded card, 96px minimum where applicable, without altering its actual 30-minute duration or hiding other selectable events. Check 30, 45, 60, 75 minute samples and dense collisions.
8. Calendar SYS real source events appear as muted compact readable cards with true interval line, filters and read-only detail, while not obscuring primary blocks. Empty time is not filled with invented content.
9. Records modified concurrently in a second browser/Android cannot be silently overwritten; compare/retry path is visible and preserves the local draft.
10. Mean statistics exclude missing values, preserve Sleep aggregation semantics, and update only after confirmed source writes.
11. Authenticated owner isolation, existing Sleep pending/outbox-compatible envelopes, long-duration confirmation, timezone/DST, delete/Undo, error and offline states regressions pass.
12. No localStorage demo data, hardcoded seed, mock server responses or sample dates are shipped into real production integrations.

## Deliverables and report

Implement and commit changes on an isolated, policy-compliant branch/worktree. Provide a final **Korean** execution report with:

- repo path, branch, commit hashes; UI routes and concrete changed files;
- current vs implemented Sleep/Integrated Calendar/Exercise/Calendar SYS features;
- actual source endpoints/models, ownership and revision behavior, migrations (or explicit none);
- test counts with failures/retries, visual captures, DEV/PROD deployment receipts and URLs;
- known gaps, blockers and any deviations from the approved V4 mockup;
- proof of original Sleep/Workout record preservation and the Calendar SYS read-only boundary.

**Scope boundary:** This task explicitly includes the LIFE OS Integrated Calendar **product implementation** as well as Sleep Web V2; do not stop after only making its HTML mockup or refactoring Sleep. It does NOT ask you to rebuild Calendar SYS itself, redesign the entire Exercise application, alter native Android, or deploy unrelated products. Proceed through implementation and verification now.
