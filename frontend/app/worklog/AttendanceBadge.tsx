import type { AttendanceStatus } from "./mockData";
import { ATTENDANCE_PRESENTATION } from "./attendancePresentation";

// Lightweight status-colored text label (v7: dot removed — color now comes
// from the text alone, never a dot/pill/background/border). Shared by every
// read-only attendance surface (tables, Today Summary) and reused as the
// visual base for the editable AttendanceSelect's closed trigger.
export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const presentation = ATTENDANCE_PRESENTATION[status];
  return (
    <span className="inline-flex items-center whitespace-nowrap text-sm font-medium leading-none" style={{ color: presentation.strong }}>
      {status}
    </span>
  );
}
