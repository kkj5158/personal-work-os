# Workflow Calendar simple Plan / Actual release

## Scope and persistence

The latest Drive policy supersedes Execute / Running / End and paired Compare
as everyday Calendar concepts. The editor now exposes an autosaved Plan / Actual
selector before the title; Review sums actual source durations without requiring
pairs. Quick Block applies recent or saved defaults immediately and retains the
existing `calendar.presets.v1` browser storage.

Conversion is transactional and owner-scoped. Calendar retains a hidden Plan
provenance record while the visible Actual remains owned by WORK, supplemental
WORK, or LIFE. Inverse conversion reuses the Plan and removes the explicitly
converted Actual. Legacy execution links remain readable without visible
duplicates. No historical data rewrite is performed.

Asia/Seoul dates govern mutations: past/today Actuals are valid, including later
clock times today; tomorrow onward is Plan-only. Clipboard and moves apply this
rule independently to each target date. WORK requires an existing WorkRecord;
failure stays in Calendar with an actionable message. Calendar WORK edits advance
the WorkRecord version to prevent stale Work Log saves overwriting them.

## DEV evidence

- Backend implementation validation: 143 focused tests passed across state,
  clipboard, editor, legacy execution, Plan, Visual Group, LIFE and WorkRecord.
- Final integrated backend rerun: 119 relevant tests and bootJar passed.
- Final frontend: 48 focused tests passed; TypeScript, focused ESLint and webpack
  production build passed. The build includes the previously released R3 and
  Authoring application state from DEV `9cee343`.
- V48 adds nullable conversion/source/duration metadata and an owner-scoped
  uniqueness constraint. DEV Flyway migrated V47 to V48 and subsequently validated.
- The reusable DEV-only API smoke script passes eight scenario groups: statistics
  exclusion/inclusion exactly once, inverse conversion, past/today/future date
  boundaries, WORK version/statistics, per-item clipboard dates, move/Undo,
  unscheduled supplemental duration, and legacy link compatibility.
- Authenticated DEV browser smoke passed: future Plan and disabled Actual; today
  later-clock conversion and Review totals; inverse removal from totals; reload
  persistence; immediate Quick Block save/apply and retained saved defaults;
  Actual copy and drag to future Plan; resize; multi-select delete/Undo; Day/Week;
  top selector, Review controls, category colors, State/Visual Group display;
  missing WORK prerequisites remain in context.
- A blur/autosave/navigation race found during browser QA was fixed and covered
  by gated hook regressions. Rapid title edit → Actual → Review now completes,
  reports the correct total, and reloads as Actual without stale reselection.
- Disposable API and browser fixtures are removed through normal DEV APIs.

## Existing boundaries

Quick Blocks remain browser-local. Completed retrospective snapshots remain
frozen and explicitly labeled; re-completing refreshes the snapshot. WORK still
requires source attendance data. Cross-midnight policy is unchanged.

Production SHAs, Railway deployment identities, migration confirmation and minimal
authenticated smoke are recorded in the three Drive closeouts after deployment.
