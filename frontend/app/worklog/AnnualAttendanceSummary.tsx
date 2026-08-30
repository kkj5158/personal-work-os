import { ClockIcon, PeopleIcon, StarIcon } from "@primer/octicons-react";
import { ATTENDANCE_PRESENTATION } from "./attendancePresentation";
import type { MonthlyAbnormalCounts, MonthlyAttendanceCounts } from "./attendance";

type DonutKey = "근무" | "휴일" | "연차" | "병가" | "조퇴" | "반차" | "결근" | "미입력";
// 미입력 included: daysElapsed must equal the actual calendar day-of-year
// (see aggregateYearlyAttendance's own day-by-day iteration, which counts
// every past-or-today date exactly once across these 8 buckets — never
// derivable from summing only "resolved" statuses, which undercounts on any
// date with unentered days). Keeping it last in the ring/legend since it's
// a neutral "not yet entered" bucket, not a real attendance outcome.
const DONUT_ORDER: readonly DonutKey[] = ["근무", "휴일", "연차", "병가", "조퇴", "반차", "결근", "미입력"];

const SIZE = 200;
const STROKE = 24;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface AnnualAttendanceSummaryProps {
  year: number;
  counts: MonthlyAttendanceCounts;
  daysInYear: number;
  monthlyAbnormal: MonthlyAbnormalCounts[];
  onTimeRate: number | null;
  averageWorkMinutes: number | null;
  averageScore: number | null;
}

// Annual summary (REQ: attendance management batch) — full-width section:
// LEFT an actual-attendance-composition donut for the selected year, RIGHT
// one monthly stacked 지각/조퇴/결근 bar chart (never three separate row
// charts — a confirmed requirement), plus a restrained secondary KPI row
// beneath both. Reuses the exact PROD attendance palette
// (attendancePresentation.ts) for every status color — never a new palette
// invented from the visual reference images.
export function AnnualAttendanceSummary({
  year,
  counts,
  daysInYear,
  monthlyAbnormal,
  onTimeRate,
  averageWorkMinutes,
  averageScore,
}: AnnualAttendanceSummaryProps) {
  const daysElapsed = DONUT_ORDER.reduce((sum, key) => sum + counts[key], 0);
  const lengths = DONUT_ORDER.map((key) => (daysElapsed > 0 ? (counts[key] / daysElapsed) * CIRCUMFERENCE : 0));
  const segments = DONUT_ORDER.map((key, index) => ({
    key,
    value: counts[key],
    length: lengths[index],
    offset: lengths.slice(0, index).reduce((sum, len) => sum + len, 0),
  }));

  const insight = computeInsight(monthlyAbnormal);

  return (
    <section className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border-default bg-surface-default p-6">
          <h2 className="mb-1 text-sm font-semibold text-fg-default">{year}년 연간 요약</h2>
          <p className="mb-4 text-xs text-fg-muted">
            {year}.01.01 ~ {year}.12.31 ({daysInYear}일)
          </p>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
              <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${year}년 연간 출결 요약`}>
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
                      stroke={ATTENDANCE_PRESENTATION[s.key].base}
                      strokeWidth={STROKE}
                      strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
                      strokeDashoffset={-s.offset}
                      transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                    />
                  ))}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-semibold text-fg-default">{daysElapsed}일</span>
                <span className="text-xs text-fg-muted">경과</span>
                <span className="mt-1 text-[11px] text-fg-muted">/ {daysInYear}일</span>
              </div>
            </div>

            <ul className="flex flex-1 flex-col gap-1.5">
              {DONUT_ORDER.map((key) => (
                <li key={key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-fg-default">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: ATTENDANCE_PRESENTATION[key].base }}
                      aria-hidden="true"
                    />
                    {key}
                  </span>
                  <span className="whitespace-nowrap text-fg-muted">
                    <span className="font-medium text-fg-default">{counts[key]}일</span>{" "}
                    ({daysElapsed > 0 ? ((counts[key] / daysElapsed) * 100).toFixed(1) : "0.0"}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-md border border-border-default bg-surface-default p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg-default">월별 출결 흐름</h2>
            <Legend />
          </div>
          <p className="mb-4 text-xs text-fg-muted">지각 · 조퇴 · 결근 월별 발생 추이</p>
          <MonthlyAbnormalBarChart data={monthlyAbnormal} />
          {insight && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-border-default bg-canvas-subtle px-3 py-2.5 text-xs text-fg-default">
              <span aria-hidden="true">💡</span>
              <span>{insight}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-md border border-border-default bg-surface-default p-6 min-[700px]:grid-cols-3">
        <Kpi icon={<ClockIcon size={20} aria-hidden="true" />} label="정시 출근율 (평균)" value={onTimeRate == null ? "–" : `${Math.round(onTimeRate * 100)}%`} />
        <Kpi
          icon={<PeopleIcon size={20} aria-hidden="true" />}
          label="평균 근무 시간 (일)"
          value={averageWorkMinutes == null ? "–" : formatMinutes(averageWorkMinutes)}
          sub="실근무 기준"
        />
        <Kpi icon={<StarIcon size={20} aria-hidden="true" />} label="근무 점수 (평균)" value={averageScore == null ? "–" : `${averageScore}점`} sub="전체 평균 점수" />
      </div>
    </section>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["지각", "#E8A33D"],
    ["조퇴", ATTENDANCE_PRESENTATION.조퇴.base],
    ["결근", ATTENDANCE_PRESENTATION.결근.base],
  ];
  return (
    <div className="flex items-center gap-3 text-xs text-fg-muted">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas-subtle text-fg-muted">{icon}</span>
      <div className="flex flex-col">
        <span className="text-xs text-fg-muted">{label}</span>
        <span className="text-xl font-semibold text-fg-default">{value}</span>
        {sub && <span className="text-[11px] text-fg-muted">{sub}</span>}
      </div>
    </div>
  );
}

const LATE_COLOR = "#E8A33D";

function MonthlyAbnormalBarChart({ data }: { data: MonthlyAbnormalCounts[] }) {
  const width = 560;
  const height = 220;
  const paddingLeft = 32;
  const paddingBottom = 24;
  const paddingTop = 20;
  const chartHeight = height - paddingTop - paddingBottom;
  const chartWidth = width - paddingLeft - 8;

  const totals = data.map((m) => m.late + m.earlyLeave + m.absent);
  const maxTotal = Math.max(1, ...totals);
  const yMax = Math.ceil(maxTotal / 5) * 5 || 5;
  const barWidth = (chartWidth / 12) * 0.6;
  const groupWidth = chartWidth / 12;

  function y(value: number): number {
    return paddingTop + chartHeight - (value / yMax) * chartHeight;
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="월별 지각/조퇴/결근 발생 추이">
      {gridLines.map((value) => (
        <g key={value}>
          <line x1={paddingLeft} x2={width} y1={y(value)} y2={y(value)} stroke="var(--border-muted)" strokeDasharray="3 3" />
          <text x={paddingLeft - 6} y={y(value) + 3} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
            {value}회
          </text>
        </g>
      ))}

      {data.map((m, index) => {
        const x = paddingLeft + index * groupWidth + (groupWidth - barWidth) / 2;
        const total = m.late + m.earlyLeave + m.absent;
        const lateHeight = chartHeight * (m.late / yMax);
        const earlyHeight = chartHeight * (m.earlyLeave / yMax);
        const absentHeight = chartHeight * (m.absent / yMax);
        const baseY = paddingTop + chartHeight;
        return (
          <g key={m.month}>
            {m.late > 0 && <rect x={x} y={baseY - lateHeight} width={barWidth} height={lateHeight} fill={LATE_COLOR} />}
            {m.earlyLeave > 0 && (
              <rect x={x} y={baseY - lateHeight - earlyHeight} width={barWidth} height={earlyHeight} fill={ATTENDANCE_PRESENTATION.조퇴.base} />
            )}
            {m.absent > 0 && (
              <rect
                x={x}
                y={baseY - lateHeight - earlyHeight - absentHeight}
                width={barWidth}
                height={absentHeight}
                fill={ATTENDANCE_PRESENTATION.결근.base}
              />
            )}
            {total > 0 && (
              <text x={x + barWidth / 2} y={baseY - lateHeight - earlyHeight - absentHeight - 4} textAnchor="middle" fontSize={10} fill="var(--fg-default)">
                {total}
              </text>
            )}
            <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--fg-muted)">
              {m.month + 1}월
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function computeInsight(data: MonthlyAbnormalCounts[]): string | null {
  const totals = data.map((m) => m.late);
  const max = Math.max(...totals);
  if (max <= 0) return null;
  const monthIndex = totals.indexOf(max);
  return `${monthIndex + 1}월에 지각이 가장 많았어요.`;
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
}
