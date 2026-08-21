// Work Log-specific reusable start-time criteria (lateness foundation
// unit). Route-local domain model — mirrors workTimeEntry.ts's role as a
// small, mock-only type/data module: not yet wired to any React state,
// selection UI, or backend. See selectors.ts's getLateness for how
// AppliedStartTime is consumed; this file only defines the shapes and the
// two seed criteria.

export interface StartTimeCriterion {
  id: string;
  name: string;
  /** "HH:MM", 24-hour, zero-padded — validated by parseTimeOfDayMinutes. */
  startTime: string;
  active: boolean;
}

// A record's frozen lateness-calculation source. Deliberately a snapshot,
// not a live reference to a StartTimeCriterion: editing or deactivating a
// criterion later must never retroactively change a record that already
// applied it — the record carries its own copy of the name and time.
export type AppliedStartTime =
  | {
      source: "criterion";
      criterionId: string;
      criterionName: string;
      startTime: string;
    }
  | {
      source: "custom";
      criterionId: null;
      criterionName: null;
      startTime: string;
    };

// Exactly two reusable seed criteria (confirmed scope) — no 09:00 entry, no
// workplace/weekday linkage, no grace period, no default flag. Not yet
// referenced by any component or record; a later stable unit wires
// selection UI to this list. IDs are hardcoded, stable, and domain-neutral
// (no personal/employer naming), matching the deterministic-id convention
// already used for the workTimeEntries mock-compatibility entry in
// mockData.ts.
export const START_TIME_CRITERIA: StartTimeCriterion[] = [
  { id: "start-time-criterion-afternoon", name: "오후 출근", startTime: "15:00", active: true },
  { id: "start-time-criterion-evening", name: "저녁 출근", startTime: "19:00", active: true },
];
