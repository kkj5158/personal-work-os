# Workflow Calendar V1 — Confirmed Product Policy

Personal OS's independent top-level time surface, spanning WORK and LIFE.
Calendar uses a dedicated three-pane shell, with a compact WORK OS / NOTE SYS /
Calendar system switcher. Planning, Execution and Compare are Calendar modes;
Reflection is a shared action/modal, not a separate navigation destination.

This document is the confirmed product policy for Workflow Calendar V1 —
where it disagrees with implementation code or historical docs, this
document wins (see `CLAUDE.md`'s precedence order).

## 1. Domain model

```
                    Planning
                       |
                 PlanningBlock
                  WORK / LIFE
                       |
                    Calendar
                 unified projection
             /                         \
        WORK Actual                  LIFE Actual
```

- **PlanningBlock** (`PlannedTimeBlock`, `backend/.../plannedtimeblock`):
  either WORK or LIFE. A WORK block may reference an `ActivityCategory`; a
  LIFE block may reference a `LifeCategory`; either may optionally reference
  a `Phase`. Project is always derived via Phase, never duplicated.
- **WORK Actual**: `WorkTimeEntry` and `SupplementalWorkEntry` remain the
  authoritative sources — no duplicate execution table was created.
- **LIFE Actual**: `LifeTimeEntry` — a new, LIFE-owned table, structurally
  parallel to `WorkTimeEntry`/`SupplementalWorkEntry`.
- **State** (`LifeStateEntry`): independent LIFE-owned time-state data —
  never an Activity/Planning attribute.
- **Calendar**: a read-only projection (`com.kafka.backend.calendar`) that
  aggregates every domain source into one unified view. Editing a projected
  item always goes through its owning domain record.

## 2. Planning overlap — ALLOWED

Planning blocks may overlap. No database or application-level check blocks
it. The frontend splits overlapping blocks into side-by-side lanes only for
the actually-overlapping interval; non-overlapping blocks keep full width.

## 3. Actual overlap — FORBIDDEN across domains

A saved, scheduled Actual interval (`WorkTimeEntry`, `SupplementalWorkEntry`,
`LifeTimeEntry`) must never double-book real time against another one, for
the same user and date. Enforced by `calendar.ActualOverlapChecker` at save
time. State is excluded from this rule — it may freely overlap Plan and
Actual, but must not overlap another State entry for the same owner.

## 4. Unscheduled Actual

An Actual record may have a duration with no start/end ("Unscheduled
Actual"). Scheduling it (assigning start/end) or unscheduling it (clearing
start/end) always mutates the same existing record — never creates or
destroys one. `WorkTimeEntry` gained optional `startAt`/`endAt` specifically
for this (previously duration-only, so it was permanently unscheduled).

## 5. Save semantics

- **Planning**: direct calendar manipulation (drag/resize/move) saves
  immediately. Click creates a local 30-minute draft; drag creates a snapped
  range (15-minute snap/minimum). The first non-whitespace title persists it;
  subsequent fields autosave with debounce and flush on blur/Enter/selection
  change. Escape cancels an uncommitted draft, never deletes a committed plan.
- **Actual**: creating a *new* Actual record is a draft until explicit
  confirmation (저장 / 전체 저장) — Actual immediately affects real
  time/work/life statistics. Editing an *existing* Actual record's time via
  drag/resize saves immediately with optimistic UI; editing other fields
  uses an explicit Save.
- **Editor**: persistent across Day/Week and all modes. Unsaved Actual changes
  use an editor-local discard/continue guard. Delete removes immediately and
  offers a temporary Undo snackbar; normal creation/editing/deletion has no
  confirmation modal.

## 6. Plan-to-Actual ("실행으로 가져오기")

A convenience/prefill workflow — never a persistent link. No FK from Actual
back to the originating PlanningBlock; the PlanningBlock is never modified
(no "executed" flag). Supports single block, multi-select same-date, and
whole-day import via the Batch Actual Editor
(`calendar.BatchActualService`), which validates every row before persisting
anything — a batch either fully commits or fully reports validation errors
with nothing written.

## 7. State visualization

State is secondary context, never a competing event lane: a thin State Rail
(Day) or compact per-column strip (Week), plus optional subtle background
tint. Fixed V1 vocabulary: `LOW` (red), `HIGH` (amber), `MIXED` (purple),
`UNCLEAR` (gray), `STABLE` (green) — independent of the Project/Activity
color-mode switch. State duration is never added to WORK/LIFE Actual totals.

## 8. Color modes

Calendar owns category appearance, separately from domain category semantics.
Parent colors are required (a stable default exists); child overrides are
optional and otherwise inherit the current parent color without storing a
derived value. Quick rail chips and the color/display settings surface edit
the same browser-local Calendar preference data. Blocks use a parent-color
strip and child-color body: Plan is light/outlined, Actual is stronger.

Visibility follows SYS / parent / child with indeterminate ancestors. Last
choices persist across navigation, mode, refresh and re-entry. Inactive
categories are hidden by default. These preferences never change domain totals,
statistics or Reflection snapshot inputs. LIFE remains flat until its source
domain supplies hierarchy. Project color mode and Phase UI are deferred to
the separate Project stream; existing schema, migrations and hooks remain.

## 9. Project/Phase — a minimal bridge, not full PM

`Project`/`Phase` (`backend/.../project`) exist only to give Calendar a
lightweight, date-first context: which Phase period is the selected date in,
and an optional Phase reference on PlanningBlock/WorkTimeEntry/
SupplementalWorkEntry. No task hierarchy, no progress tracking, no status
workflow — that is a separate, future Project Management stream.

## 10. Reflection

One `ReflectionEntry` per (owner, date) — the single WORK_OS-owned
implementation of `notesystem.integration.ReflectionProvider`. Note System
never owns or duplicates Reflection data; it only renders through this
provider via `ReflectionEmbed`. Lifecycle: `EDITING` (content autosaves) →
회고 완료 (generates and freezes a structured snapshot, flips to
`COMPLETED`) → 수정 (returns to `EDITING`; re-completion regenerates the
snapshot wholesale — no partial patch, no V1 revision history).

Snapshot layout: PLAN / ACTUAL / STATE on one shared time axis, plus
planned/actual/delta minutes and a WORK/LIFE breakdown. State duration is
excluded from the actual-minutes total (§7).

## 11. Out of scope for V1

Full Project/Phase/Task management, persistent Plan↔Actual matching, Month
Workflow View, recurring planning, AI scheduling, advanced state analytics,
cross-midnight Actual records.

## See also

- `docs/backend/workflow-calendar.md` — domain/persistence/API reference.
- `docs/backend/work-time-entry.md`, `docs/backend/supplemental-work.md` —
  the WORK Actual sources this feature reuses.
- `docs/contracts/note-system-v1.md` — the Note System side of the
  Reflection integration contract.
