import type { AttendanceStatus } from "./mockData";

// Restrained GitHub-Label-style badge per spec §6. The existing semantic
// token set (primary/success/warning/danger + neutral) has one fewer hue
// than the five statuses need, so two statuses share a hue family here —
// see the Phase 2 report for the exact mapping rationale.
const STATUS_CLASSES: Record<AttendanceStatus, string> = {
  근무: "bg-success-subtle text-success-fg border-success-fg",
  휴일: "bg-canvas-subtle text-fg-muted border-border-default",
  연차: "bg-primary-subtle text-primary-fg border-primary-fg",
  병가: "bg-warning-subtle text-warning-fg border-warning-fg",
  조퇴: "bg-danger-subtle text-danger-fg border-danger-fg",
};

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-4 ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}
