import { aggregateMonthlyAttendance } from "./attendance";
import type { WorkLogRecord } from "./mockData";

const SIZE = 240;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Mirrors AttendanceBadge's hue choices (see that file for the mapping
// rationale), expressed as CSS custom-property references instead of
// Tailwind classes because SVG `stroke` can't consume a Tailwind class.
const SEGMENT_COLORS: Record<"근무" | "조퇴" | "휴일" | "연차" | "병가" | "미입력", string> = {
  근무: "var(--success-emphasis)",
  조퇴: "var(--danger-emphasis)",
  휴일: "var(--fg-muted)",
  연차: "var(--primary-emphasis)",
  병가: "var(--warning-emphasis)",
  미입력: "var(--border-muted)",
};

const LEGEND_ORDER = ["근무", "조퇴", "휴일", "연차", "병가", "미입력"] as const;

interface MonthlyAttendanceDonutProps {
  records: WorkLogRecord[];
  monthAnchor: Date;
  referenceDate: Date;
}

// Presentation only — all counting rules live in attendance.ts
// (aggregateMonthlyAttendance). This component never re-derives them.
export function MonthlyAttendanceDonut({ records, monthAnchor, referenceDate }: MonthlyAttendanceDonutProps) {
  const counts = aggregateMonthlyAttendance(records, monthAnchor, referenceDate);
  const daysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const daysElapsed = LEGEND_ORDER.reduce((sum, key) => sum + counts[key], 0);
  const monthLabel = `${monthAnchor.getMonth() + 1}월`;

  const ariaSummary = `${monthLabel} 출결 현황: ${LEGEND_ORDER.map((key) => `${key} ${counts[key]}일`).join(", ")}. 근무일 합계 ${counts.workdayTotal}일, ${daysElapsed}일 경과 / ${daysInMonth}일.`;

  const lengths = LEGEND_ORDER.map((key) => (daysElapsed > 0 ? (counts[key] / daysElapsed) * CIRCUMFERENCE : 0));
  const segments = LEGEND_ORDER.map((key, index) => ({
    key,
    value: counts[key],
    length: lengths[index],
    offset: lengths.slice(0, index).reduce((sum, len) => sum + len, 0),
  }));

  return (
    <div className="flex h-full flex-col rounded-md border border-border-default bg-surface-default p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg-default">{monthLabel} 출결 현황</h2>

      <div className="flex flex-1 items-center gap-6">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={ariaSummary}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border-muted)" strokeWidth={STROKE} />
            {segments
              .filter((s) => s.length > 0)
              .map((s) => (
                <circle
                  key={s.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={SEGMENT_COLORS[s.key]}
                  strokeWidth={STROKE}
                  strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
                  strokeDashoffset={-s.offset}
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                />
              ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-semibold text-fg-default">{counts.workdayTotal}일</span>
            <span className="text-xs text-fg-muted">근무일</span>
            <span className="mt-1 text-[11px] text-fg-muted">
              {daysElapsed}일 경과 / {daysInMonth}일
            </span>
          </div>
        </div>

        <ul className="flex flex-1 flex-col gap-2">
          {LEGEND_ORDER.map((key) => (
            <li key={key} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-fg-default">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: SEGMENT_COLORS[key] }}
                  aria-hidden="true"
                />
                {key}
              </span>
              <span className="font-medium text-fg-default">{counts[key]}일</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
