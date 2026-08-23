// Local typed mock data for the Work Log screen (Phase 2).
//
// This is the explicit boundary meant to be replaced by a real API layer
// later: `getWeekRecords`/`getMonthRecords` are the only functions that know
// about mock data, and their signatures (anchor date -> WorkLogRecord[]) are
// shaped like future `listWorkLogRecords(...)` API calls would be. Nothing
// outside this file should assume the data is static.
//
// No backend request is made anywhere in the Work Log route in this phase.
//
// v2 Phase 4: `실근무` is now derived exclusively from `workTimeEntries`
// (see `getNetWorkMinutes` in selectors.ts) — WorkLogRecord no longer stores
// an independent `netWorkMinutes` field. See `buildRecordForDate` below for
// the one-time mock-data compatibility conversion from the old stored value.

// The five confirmed attendance statuses (docs/frontend/work-log/work-log-ui-spec.md §6).
// Do not add to this list — it is fixed by the approved spec.
import { addDays } from "@/lib/date";
import type { WorkTimeEntry } from "./workTimeEntry";
import type { AppliedStartTime } from "./startTimeCriterion";

export const ATTENDANCE_STATUSES = ["근무", "휴일", "연차", "병가", "조퇴"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

// Confirmed default visible location label (spec §8, v2 value — supersedes
// the v1 "다올 사무실"). Deferred: how a real location value maps to this
// label — for now every mock record uses it.
export const DEFAULT_LOCATION = "카프카 사무실";

export interface WorkLogRecord {
  id: string;
  date: Date;
  status: AttendanceStatus;
  location: string;
  clockIn: string | null; // "HH:MM"
  clockOut: string | null; // "HH:MM"
  /**
   * Frozen lateness-calculation source (start-time-criterion foundation
   * unit) — a snapshot of either a reusable StartTimeCriterion or a custom
   * time, never a live reference. `null` when no start-time basis has been
   * applied yet. Lateness itself is never stored — always derive it via
   * selectors.ts's `getLateness`.
   */
  appliedStartTime: AppliedStartTime | null;
  /** 체류 시간, in minutes. Spec: auto-calculated from clock in/out. */
  basicWorkMinutes: number | null;
  /**
   * Additive daily work-time entries (spec §10). `실근무` is always derived
   * from this list via `getNetWorkMinutes` (selectors.ts) — never read or
   * write a `netWorkMinutes` field directly.
   */
  workTimeEntries: WorkTimeEntry[];
  /** 작업 블록 합계, in minutes. Spec: read-only, never shown in the table. */
  actualBlockMinutes: number | null;
  /** 0–100. Whether lateness/early-leave affects this is an explicitly deferred rule. */
  score: number | null;
  memo: string;
  /**
   * Temporary record-level on-time override (v3 MVP unit, ahead of a future
   * request/approval system for attendance/lateness/leave — see
   * selectors.ts's getEffectiveLateness). Layers over the raw
   * clockIn/appliedStartTime-derived lateness for display only; never
   * mutates clockIn, appliedStartTime, or the raw calculation itself.
   * Deliberately no source/audit metadata — just this one boolean.
   */
  isOnTimeOverride: boolean;
}

interface MockDayTemplate {
  status: AttendanceStatus;
  clockIn: string | null;
  clockOut: string | null;
  basicWorkMinutes: number | null;
  /**
   * Pre-Phase4 실근무 total, kept only as the source figure for the mock-data
   * compatibility conversion in `buildRecordForDate` (spec §5) — converted
   * into a single `workTimeEntries` entry there, never read as `실근무`
   * directly.
   */
  legacyNetWorkMinutes: number | null;
  actualBlockMinutes: number | null;
  score: number | null;
  memo: string;
}

// Mirrors docs/frontend/work-log/work-log-ui-final.png, offset 0 = Monday.
// Illustrative content only; see the Phase 2 report for the handful of
// figures (weekly totals) that don't arithmetically reconcile with the
// reference image and why they were computed rather than force-matched.
const WEEK_TEMPLATE: MockDayTemplate[] = [
  {
    status: "근무",
    clockIn: "09:12",
    clockOut: "18:02",
    basicWorkMinutes: 530,
    legacyNetWorkMinutes: 490,
    actualBlockMinutes: 465,
    score: 82,
    memo: "프로젝트 알파 계획 및 요구사항 검토.",
  },
  {
    status: "근무",
    clockIn: "09:00",
    clockOut: "17:55",
    basicWorkMinutes: 535,
    legacyNetWorkMinutes: 505,
    actualBlockMinutes: 480,
    score: 90,
    memo: "고객 협의 및 실행",
  },
  {
    status: "근무",
    clockIn: "09:03",
    clockOut: "18:10",
    basicWorkMinutes: 547,
    legacyNetWorkMinutes: 520,
    actualBlockMinutes: 495,
    score: 85,
    memo: "집중 작업",
  },
  {
    status: "휴일",
    clockIn: null,
    clockOut: null,
    basicWorkMinutes: null,
    legacyNetWorkMinutes: null,
    actualBlockMinutes: null,
    score: null,
    memo: "개인 휴가",
  },
  {
    status: "근무",
    clockIn: "09:18",
    clockOut: "17:42",
    basicWorkMinutes: 504,
    legacyNetWorkMinutes: 470,
    actualBlockMinutes: 445,
    score: 76,
    memo: "팀 회고 및 문서화",
  },
  {
    status: "연차",
    clockIn: null,
    clockOut: null,
    basicWorkMinutes: null,
    legacyNetWorkMinutes: null,
    actualBlockMinutes: null,
    score: null,
    memo: "연차",
  },
  {
    status: "조퇴",
    clockIn: "09:02",
    clockOut: "13:00",
    basicWorkMinutes: 238,
    legacyNetWorkMinutes: 210,
    actualBlockMinutes: 195,
    score: 70,
    memo: "가족 일정",
  },
];

// Shared generation path for both week and month retrieval: cycles the same
// 7-day template by day-of-week (Monday=0 ... Sunday=6), so a given weekday
// always gets the same template entry regardless of which fetch produced it.
//
// Mock-data compatibility conversion (v2 Phase 4 spec §5): each template's
// old `legacyNetWorkMinutes` becomes exactly one initial `workTimeEntries`
// entry when positive, or an empty list when null/zero — this is mock data
// only, not a real category/database rule.
//
// v5 policy: every mock record now starts with `appliedStartTime: null`
// ("출근 기준 선택" placeholder in the UI) rather than the historical
// `custom` snapshot this used to synthesize from each template's old
// legacy-delay figure — 직접 입력 is no longer a concept anywhere in Work
// Log, so there is nothing left to convert into it. A user picks one of the
// active saved criteria (START_TIME_CRITERIA) explicitly instead.
function buildRecordForDate(date: Date): WorkLogRecord {
  const mondayIndexed = (date.getDay() + 6) % 7;
  const { legacyNetWorkMinutes, ...template } = WEEK_TEMPLATE[mondayIndexed];
  const id = `mock-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const workTimeEntries: WorkTimeEntry[] =
    legacyNetWorkMinutes && legacyNetWorkMinutes > 0
      ? [{ id: `${id}-entry-1`, item: "일반 업무", minutes: legacyNetWorkMinutes, memo: undefined }]
      : [];

  const appliedStartTime: AppliedStartTime | null = null;

  return {
    id,
    date: new Date(date),
    location: DEFAULT_LOCATION,
    ...template,
    workTimeEntries,
    appliedStartTime,
    isOnTimeOverride: false,
  };
}

export function getWeekRecords(weekStart: Date): WorkLogRecord[] {
  return Array.from({ length: 7 }, (_, i) => buildRecordForDate(addDays(weekStart, i)));
}

// Month-level mock boundary (v2 Phase 1): returns one deterministic record
// per calendar day belonging to `monthAnchor`'s month, reusing the same
// template as getWeekRecords instead of a second hand-maintained dataset.
// No custom date-range support, no backend request. The future Month view
// is expected to pass this through groupRecordsByWeek (selectors.ts).
export function getMonthRecords(monthAnchor: Date): WorkLogRecord[] {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => buildRecordForDate(new Date(year, month, i + 1)));
}

// v6 visual-polish unit: dedicated weekly totals feeding *only* the
// recent-12-week trend charts, independent of the daily WEEK_TEMPLATE that
// still drives every displayed weekly/monthly table row unchanged. The
// previous template-cycling approach produced a nearly flat week-over-week
// trend (the same 7 days repeating), which didn't visually exercise the
// chart curves. Exactly 11 entries — the 12th (current/latest) trend point
// intentionally keeps coming from the real current week's own records (via
// buildRecordForDate) for consistency with the rest of the page; it
// happens to already total 36:35 / 81점, matching the approved reference.
export const TREND_HISTORY_TARGETS: { netWorkMinutes: number; averageScore: number }[] = [
  { netWorkMinutes: 32 * 60 + 40, averageScore: 76 },
  { netWorkMinutes: 35 * 60 + 20, averageScore: 79 },
  { netWorkMinutes: 39 * 60 + 10, averageScore: 83 },
  { netWorkMinutes: 36 * 60 + 15, averageScore: 78 },
  { netWorkMinutes: 42 * 60 + 30, averageScore: 86 },
  { netWorkMinutes: 38 * 60 + 5, averageScore: 82 },
  { netWorkMinutes: 29 * 60 + 40, averageScore: 74 },
  { netWorkMinutes: 34 * 60 + 25, averageScore: 80 },
  { netWorkMinutes: 40 * 60 + 50, averageScore: 85 },
  { netWorkMinutes: 43 * 60 + 10, averageScore: 88 },
  { netWorkMinutes: 38 * 60 + 45, averageScore: 84 },
];

const TREND_WORKING_DAY_OFFSETS = WEEK_TEMPLATE.reduce<number[]>(
  (offsets, day, index) => (day.status === "근무" || day.status === "조퇴" ? [...offsets, index] : offsets),
  [],
);

// Builds one historical trend week whose aggregate exactly matches
// `target` — every working day (same weekday pattern as WEEK_TEMPLATE)
// gets an equal score and an equal split of the target minutes (remainder
// on the first working day), non-working days stay null/empty exactly like
// buildRecordForDate produces. Attendance status per weekday mirrors
// WEEK_TEMPLATE so the mix of workday/non-workday days is realistic; clock
// times/location/appliedStartTime are irrelevant to the trend calculation
// (getNetWorkMinutes only reads workTimeEntries, getAverageScore only reads
// score) and are kept minimal rather than borrowed from the template, to
// avoid implying these are real displayed records — they never appear in
// any table.
export function buildTrendHistoryWeekRecords(weekStart: Date, target: { netWorkMinutes: number; averageScore: number }): WorkLogRecord[] {
  const workingCount = TREND_WORKING_DAY_OFFSETS.length;
  const baseMinutes = Math.floor(target.netWorkMinutes / workingCount);
  const remainder = target.netWorkMinutes - baseMinutes * workingCount;

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const id = `mock-trend-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const status = WEEK_TEMPLATE[i].status;
    const workingIndex = TREND_WORKING_DAY_OFFSETS.indexOf(i);
    const isWorking = workingIndex !== -1;
    const minutes = workingIndex === 0 ? baseMinutes + remainder : baseMinutes;

    return {
      id,
      date: new Date(date),
      status,
      location: DEFAULT_LOCATION,
      clockIn: null,
      clockOut: null,
      appliedStartTime: null,
      basicWorkMinutes: null,
      workTimeEntries: isWorking ? [{ id: `${id}-entry-1`, item: "일반 업무", minutes, memo: undefined }] : [],
      actualBlockMinutes: null,
      score: isWorking ? target.averageScore : null,
      memo: "",
      isOnTimeOverride: false,
    };
  });
}
