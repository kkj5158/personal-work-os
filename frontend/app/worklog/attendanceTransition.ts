// Shared attendance-status transition policy (Work Log MVP polish batch).
// Working statuses are 근무/조퇴 (attendance.ts's isWorkdayStatus) — every
// other status (휴일/연차/병가/결근) is non-working. A transition FROM a
// working status TO a non-working one destroys clock times, the applied
// start-time criterion, the on-time override, work score, and every
// work-time entry — this module only decides *whether* that destruction is
// about to happen (so the caller can gate it behind a confirmation) and
// what the cleared field values are; each caller (WorkLogRecordDetailModal's
// draft, page.tsx's Today panel) applies those values to its own state
// shape and renders its own confirmation UI.

export const NON_WORKING_TRANSITION_WARNING =
  "이 날짜를 비근무 출결 상태로 변경하면 출퇴근 시간, 출근 기준, 업무시간 기록, 근무 점수 등 기존 근무 관련 데이터가 삭제됩니다. 계속할까요?";

interface WorkDataShape {
  clockIn: string | null;
  clockOut: string | null;
  appliedStartTime: unknown | null;
  isOnTimeOverride: boolean;
  score: number | null;
  hasWorkTimeEntries: boolean;
}

// True when applying the transition would actually destroy something — an
// already-empty working-status draft (e.g. 근무 selected but never clocked
// in) needs no confirmation, since there is nothing to lose.
export function hasDestructibleWorkData(input: WorkDataShape): boolean {
  return (
    !!input.clockIn ||
    !!input.clockOut ||
    input.appliedStartTime != null ||
    input.isOnTimeOverride ||
    input.score != null ||
    input.hasWorkTimeEntries
  );
}

// The end state for every field this policy clears — used both when a
// working→non-working transition is confirmed and when a non-working→
// working transition starts a clean working state (spec: never resurrect
// previously-cleared data). Callers merge this into their own draft/patch
// shape; `clockIn`/`clockOut` are given as `null` here since every real
// caller shape accepts that (the modal's TimeInput-native `""` is applied by
// the caller itself where needed).
export const CLEARED_WORK_FIELDS: {
  clockIn: null;
  clockOut: null;
  appliedStartTime: null;
  isOnTimeOverride: false;
  score: null;
  workTimeEntries: never[];
} = {
  clockIn: null,
  clockOut: null,
  appliedStartTime: null,
  isOnTimeOverride: false,
  score: null,
  workTimeEntries: [],
};
