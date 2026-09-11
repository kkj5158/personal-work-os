# Workflow Calendar V1 — Reference Image Map

Use these exact filenames when referencing UI images in implementation prompts.

> **Path note:** these images were originally staged flat at
> `docs/assets/calendar/0N_*.png` but were never committed to any branch —
> `git log --all -- docs/assets/calendar` is empty repo-wide. They have
> since been reorganized on disk into `legacy/` (first-pass references,
> renamed `LEGACY-0N-*.png`) and a new `target/` set (second-pass
> references, `TARGET-0N-*.png`). This map reflects that current structure;
> the filenames below are not the ones the Workflow Calendar V1 first pass
> was actually implemented against (see `docs/backend/workflow-calendar.md`
> and `docs/frontend/workflow-calendar-ui.md` for what that pass covered).

## Legacy references (first pass)

| # | Filename | Prompt reference name | Purpose |
|---|---|---|---|
| 01 | `legacy/LEGACY-01-day-planning.png` | `REF-01 DAY PLANNING` | Day view / Planning mode. Centered day timeline, WORK+LIFE planning blocks, Project/Phase date-first timeline. |
| 02 | `legacy/LEGACY-02-day-execution.png` | `REF-02 DAY EXECUTION` | Day view / Actual execution mode. Activity is primary; State is left-side rail/context. Actual blocks must not overlap. |
| 03 | `legacy/LEGACY-03-day-compare.png` | `REF-03 DAY COMPARE` | Day Plan vs Actual side-by-side comparison on aligned time scales, with Reflection entry point. |
| 04 | `legacy/LEGACY-04-week-planning.png` | `REF-04 WEEK PLANNING` | Week planning overview using a Notion Calendar-like weekly time grid. |
| 05 | `legacy/LEGACY-05-week-execution.png` | `REF-05 WEEK EXECUTION` | Week actual/execution view, date-column state rail/tint, WORK+LIFE actual records and unscheduled actual context. |
| 06 | `legacy/LEGACY-06-week-compare.png` | `REF-06 WEEK COMPARE` | Week Plan above / Actual below comparison, shared weekly structure and divider concept. |
| 07 | `legacy/LEGACY-07-batch-actual-editor.png` | `REF-07 BATCH ACTUAL EDITOR` | "Bring plan to execution" batch editor. Explicit save, WORK/LIFE mixed rows, exclusion and overlap validation. |
| 08 | `legacy/LEGACY-08-reflection-modal-state-context.png` | `REF-08 REFLECTION` | Reflection modal. Plan / Actual / State are aligned on one shared timeline; summary and reflection editing/completion context. |

## Target references (second pass — in progress)

Present on disk as of this normalization; not yet analyzed or mapped to
specific prompt/policy language, and not a complete set (no target
equivalent yet exists for REF-06/07/08 above). Listed here only so the
asset inventory is accurate — do not treat this list as a second-pass
implementation plan.

| Filename |
|---|
| `target/TARGET-01-day-planning-shell.png` |
| `target/TARGET-02-day-planning-direct-create.png` |
| `target/TARGET-03-day-execution-state-editor.png` |
| `target/TARGET-04-day-compare.png` |
| `target/TARGET-05-week-planning-shell.png` |
| `target/TARGET-06-week-execution-shell.png` |

## Common visual contract

- Notion Calendar is the primary interaction/layout reference for day/week time grids.
- Day view should be visually centered and narrower than the full content width.
- Non-overlapping events use one consistent alignment/width system.
- Planning overlap is allowed and may split into lanes only for the overlapping range.
- Actual overlap is forbidden; conflicts appear only as pre-save validation errors.
- Activity is the primary calendar layer.
- State is independent contextual time data, normally rendered as a thin left State Rail plus optional subtle background tint.
- State-only mode may promote states to full blocks, but ordinary calendar views should not.
- Project/Phase timeline prioritizes explicit start/end dates and selected-date positioning; secondary metadata stays compact.
- WORK and LIFE coexist in the same calendar surface but retain separate backend/domain ownership for Actual data.
