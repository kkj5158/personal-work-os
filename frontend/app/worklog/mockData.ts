// Local typed mock data for the Work Log screen (Phase 2).
//
// This is the explicit boundary meant to be replaced by a real API layer
// later: `getWeekRecords` is the only function that knows about mock data,
// and its signature (weekStart -> WorkLogRecord[]) is shaped like a future
// `listWorkLogRecords(weekStart)` API call would be. Nothing outside this
// file should assume the data is static.
//
// No backend request is made anywhere in the Work Log route in this phase.

// The five confirmed attendance statuses (docs/frontend/work-log/work-log-ui-spec.md §6).
// Do not add to this list — it is fixed by the approved spec.
export const ATTENDANCE_STATUSES = ["근무", "휴일", "연차", "병가", "조퇴"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

// Confirmed default visible location label (spec §7). Deferred: how a real
// location value maps to this label — for now every mock record uses it.
export const DEFAULT_LOCATION = "다올 사무실";

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
    lateMinutes: null,
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
    lateMinutes: null,
    basicWorkMinutes: 238,
    netWorkMinutes: 210,
    actualBlockMinutes: 195,
    score: 70,
    memo: "가족 일정",
  },
];

export function getWeekRecords(weekStart: Date): WorkLogRecord[] {
  return WEEK_TEMPLATE.map((template, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return {
      id: `mock-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      date,
      location: DEFAULT_LOCATION,
      ...template,
    };
  });
}
