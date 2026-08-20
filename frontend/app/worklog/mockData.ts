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
// Deferred `netWorkMinutes` migration (v2 Phase 1 note): the approved v2
// model will eventually derive `실근무` exclusively from a WorkTimeEntry[]
// list (see workTimeEntry.ts) rather than storing it directly. That
// migration is intentionally NOT done here — WorkLogRecord.netWorkMinutes
// remains the one authoritative value the currently-rendered detail panel
// reads and writes. Introducing a second, competing value now (e.g. a
// parallel entries array that disagrees with netWorkMinutes) would require
// inventing a conversion/synthetic-category rule this phase is explicitly
// told not to invent. The actual migration happens in the Work-time Entry
// Modal implementation phase, once real entry data and a UI exist to keep
// the two in sync.

// The five confirmed attendance statuses (docs/frontend/work-log/work-log-ui-spec.md §6).
// Do not add to this list — it is fixed by the approved spec.
import { addDays } from "@/lib/date";

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
  /** 실근무, in minutes. Spec: user-adjustable. */
  netWorkMinutes: number | null;
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
  netWorkMinutes: number | null;
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
    netWorkMinutes: 490,
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
    netWorkMinutes: 505,
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
    netWorkMinutes: 520,
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
    netWorkMinutes: null,
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
    netWorkMinutes: 470,
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
    netWorkMinutes: null,
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
    netWorkMinutes: 210,
    actualBlockMinutes: 195,
    score: 70,
    memo: "가족 일정",
  },
];

// Shared generation path for both week and month retrieval: cycles the same
// 7-day template by day-of-week (Monday=0 ... Sunday=6), so a given weekday
// always gets the same template entry regardless of which fetch produced it.
function buildRecordForDate(date: Date): WorkLogRecord {
  const mondayIndexed = (date.getDay() + 6) % 7;
  const template = WEEK_TEMPLATE[mondayIndexed];
  return {
    id: `mock-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
    date: new Date(date),
    location: DEFAULT_LOCATION,
    ...template,
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
