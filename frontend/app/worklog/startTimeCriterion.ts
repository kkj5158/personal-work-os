// Work Log-specific reusable start-time criteria (lateness foundation
// unit). Route-local domain model. Real data comes from
// GET /api/start-time-criteria (lib/api/startTimeCriteria.ts), fetched once
// in page.tsx. See selectors.ts's getLateness for how AppliedStartTime is
// consumed; this file only defines the shapes and the shared eligibility rule.

export interface StartTimeCriterion {
  id: string;
  name: string;
  /** "HH:MM", 24-hour, zero-padded — validated by parseTimeOfDayMinutes. */
  startTime: string;
  active: boolean;
  /** Minutes of lateness grace on top of startTime — 0 means no grace. */
  graceMinutes: number;
}

// A record's frozen lateness-calculation source. Deliberately a snapshot,
// not a live reference to a StartTimeCriterion: editing or deactivating a
// criterion later must never retroactively change a record that already
// applied it — the record carries its own copy of the name, time, and grace.
// Always criterion-sourced — the backend has no "custom time" concept (a
// WorkRecord's appliedCriterionId always refers to a real, owned
// StartTimeCriterion).
export interface AppliedStartTime {
  criterionId: string;
  criterionName: string;
  startTime: string;
  graceMinutes: number;
}

// v5 policy: "선택된 저장 기준"이 있는지 판정하는 단일 공유 규칙 — a record
// counts as having one only when its snapshot both (a) came from a saved
// criterion (never "custom" — see AppliedStartTimeField) and (b) still
// exactly matches that criterion's *current* active/name/time. A drifted
// (edited or deactivated) criterion snapshot no longer counts, even though
// its frozen `startTime` remains perfectly usable for the raw lateness
// calculation elsewhere (selectors.ts's getLateness reads the snapshot
// directly and doesn't call this — this is purely a "is there something
// selectable to show/require" check for the UI: the applied-criterion
// trigger's placeholder, new-clock-in gating, and record-save validation).
export function isActiveCriterionSnapshot(value: AppliedStartTime | null, criteria: StartTimeCriterion[]): boolean {
  if (!value) return false;
  const match = criteria.find((c) => c.id === value.criterionId);
  return (
    !!match &&
    match.active &&
    match.name === value.criterionName &&
    match.startTime === value.startTime &&
    match.graceMinutes === value.graceMinutes
  );
}
