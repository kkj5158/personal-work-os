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
   * Minutes late. Display-only mock value — the calculation source and
   * threshold are an explicitly deferred business rule (spec §13). Never
   * derive this from clockIn/clockOut here.
   */
  lateMinutes: number | null;
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
}

interface MockDayTemplate {
  status: AttendanceStatus;
  clockIn: string | null;
  clockOut: string | null;
  lateMinutes: number | null;
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
    lateMinutes: 12,
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
    lateMinutes: 0,
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
    lateMinutes: 3,
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
    lateMinutes: null,
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
    lateMinutes: 18,
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
    lateMinutes: null,
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
    lateMinutes: 0,
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
function buildRecordForDate(date: Date): WorkLogRecord {
  const mondayIndexed = (date.getDay() + 6) % 7;
  const { legacyNetWorkMinutes, ...template } = WEEK_TEMPLATE[mondayIndexed];
  const id = `mock-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const workTimeEntries: WorkTimeEntry[] =
    legacyNetWorkMinutes && legacyNetWorkMinutes > 0
      ? [{ id: `${id}-entry-1`, item: "일반 업무", minutes: legacyNetWorkMinutes, memo: undefined }]
      : [];

  return {
    id,
    date: new Date(date),
    location: DEFAULT_LOCATION,
    ...template,
    workTimeEntries,
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
