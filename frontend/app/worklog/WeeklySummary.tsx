import type { ReactNode } from "react";
import { ClockIcon, GraphIcon, PeopleIcon } from "@primer/octicons-react";
import { formatKoreanDateRange } from "@/lib/date";
import { ScoreRing } from "./ScoreRing";
import { countWorkdays } from "./attendance";
import { formatHoursMinutes } from "./format";
import type { WorkLogRecord } from "./mockData";
import { getAverageScore, getNetWorkMinutes } from "./selectors";

interface WeeklySummaryProps {
  weekStart: Date;
  weekEnd: Date;
  records: WorkLogRecord[];
}

function sumMinutes(records: WorkLogRecord[], key: "basicWorkMinutes" | "actualBlockMinutes"): number {
  return records.reduce((total, record) => total + (record[key] ?? 0), 0);
}

// 작업 블록 합계 is excluded from the table (spec §6) but kept here (spec §9).
// 근무일 uses the Phase 1 attendance helper (confirmed rule: 근무 + 조퇴 both
// count as workdays — spec §11.1/§17), instead of re-deriving the rule here.
// 실근무 합계 (v2 Phase 4) is the sum of each record's derived 실근무, never a
// stored per-record field.
export function WeeklySummary({ weekStart, weekEnd, records }: WeeklySummaryProps) {
  const basicWorkTotal = sumMinutes(records, "basicWorkMinutes");
  const netWorkTotal = records.reduce((total, record) => total + getNetWorkMinutes(record), 0);
  const actualBlockTotal = sumMinutes(records, "actualBlockMinutes");
  const averageScore = getAverageScore(records);
  const workdayCount = countWorkdays(records);

  return (
    <div className="border-t border-border-default bg-surface-default px-4 py-3">
      <h2 className="mb-2.5 text-sm font-semibold text-fg-default">{formatKoreanDateRange(weekStart, weekEnd)} 주간 요약</h2>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <SummaryItem icon={<ClockIcon size={16} className="text-fg-muted" aria-hidden="true" />} label="체류 시간 합계" value={formatHoursMinutes(basicWorkTotal)} />
        <SummaryItem icon={<ClockIcon size={16} className="text-success-fg" aria-hidden="true" />} label="실근무 합계" value={formatHoursMinutes(netWorkTotal)} />
        <SummaryItem icon={<ClockIcon size={16} className="text-fg-muted" aria-hidden="true" />} label="작업 블록 합계" value={formatHoursMinutes(actualBlockTotal)} />
        <SummaryItem
          icon={<GraphIcon size={16} className="text-fg-muted" aria-hidden="true" />}
          label="평균 점수"
          value={
            <span className="flex items-center gap-1.5">
              {averageScore ?? "–"}
              <ScoreRing score={averageScore} />
            </span>
          }
        />
        <SummaryItem
          icon={<PeopleIcon size={16} className="text-fg-muted" aria-hidden="true" />}
          label="근무일"
          value={`${workdayCount} / ${records.length}`}
        />
      </div>
    </div>
  );
}

function SummaryItem({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="text-sm font-semibold text-fg-default">{value}</span>
    </div>
  );
}
