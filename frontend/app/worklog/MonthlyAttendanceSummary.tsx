import { ATTENDANCE_PRESENTATION } from "./attendancePresentation";
import { AttendanceStatusIcon } from "./AttendanceStatusIcon";
import type { AttendanceStatus } from "./mockData";
import type { MonthlyAttendanceCounts } from "./attendance";

// Selected month's ACTUAL confirmed attendance counts only — never mixes in
// AttendancePlan/future counts (see docs/product/work-attendance-management-design.md).
// 반차 here is an occurrence/day COUNT (matches 근무/조퇴/etc.'s own unit),
// never the 0.5-day leave-consumption number — that accounting stays in the
// separate leave card.
const CARD_ORDER: AttendanceStatus[] = ["근무", "반차", "조퇴", "연차", "병가", "결근", "휴일"];

export function MonthlyAttendanceSummary({ counts }: { counts: MonthlyAttendanceCounts }) {
  return (
    <div className="rounded-md border border-border-default bg-surface-default p-6">
      <h2 className="mb-4 text-sm font-semibold text-fg-default">이번 달 출결 요약</h2>
      <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-4 min-[900px]:grid-cols-7">
        {CARD_ORDER.map((status) => {
          const presentation = ATTENDANCE_PRESENTATION[status];
          return (
            <div key={status} className="flex flex-col items-center gap-2 rounded-md border border-border-default px-3 py-4">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: presentation.pale, color: presentation.base }}
              >
                <AttendanceStatusIcon status={status} size={22} />
              </span>
              <span className="text-sm font-medium" style={{ color: presentation.strong }}>
                {status}
              </span>
              <div className="border-t border-border-default pt-1.5 text-center">
                <span className="text-xl font-semibold tabular-nums" style={{ color: presentation.strong }}>
                  {counts[status]}
                </span>
                <span className="ml-0.5 text-sm text-fg-muted">일</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
