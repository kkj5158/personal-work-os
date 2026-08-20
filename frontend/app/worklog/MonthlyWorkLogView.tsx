import { formatKoreanDateRange } from "@/lib/date";
import { WorkLogTable } from "./WorkLogTable";
import { countWorkdays } from "./attendance";
import { formatHoursMinutes } from "./format";
import type { WorkLogRecord } from "./mockData";
import { getAverageScore, getNetWorkMinutes, groupRecordsByWeek } from "./selectors";

interface MonthlyWorkLogViewProps {
  records: WorkLogRecord[];
  selectedRecordId: string | null;
  onRowActivate: (id: string) => void;
}

// Monthly grouped table (v2 Phase 5 §13): presentation-only — owns no view,
// navigation, or modal state, and never edits records itself. `records` is
// expected to already be exactly one month's worth (from getMonthRecords),
// so `groupRecordsByWeek` naturally produces first/last groups trimmed to
// in-month dates only (it never invents adjacent-month entries — it can
// only bucket what's actually present in `records`). Each block reuses the
// existing WorkLogTable unchanged (same 9 columns, same row activation),
// with its pagination footer suppressed so it doesn't repeat per block.
export function MonthlyWorkLogView({ records, selectedRecordId, onRowActivate }: MonthlyWorkLogViewProps) {
  const weekGroups = groupRecordsByWeek(records);

  return (
    <div className="flex flex-col gap-5">
      {weekGroups.map((group) => {
        // The group's own weekStart/weekEnd are the full canonical Mon–Sun
        // week and would leak an adjacent-month date into an edge block's
        // heading — the trimmed first/last actual record is what's shown.
        const rangeStart = group.records[0].date;
        const rangeEnd = group.records[group.records.length - 1].date;
        const netWorkTotal = group.records.reduce((sum, record) => sum + getNetWorkMinutes(record), 0);
        const averageScore = getAverageScore(group.records);
        const workdayCount = countWorkdays(group.records);

        return (
          <div key={group.key} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg-default">
              {formatKoreanDateRange(rangeStart, rangeEnd)} · 실근무 {formatHoursMinutes(netWorkTotal)} · 평균 점수{" "}
              {averageScore ?? "–"} · 근무일 {workdayCount}일
            </h3>
            <WorkLogTable
              records={group.records}
              selectedRecordId={selectedRecordId}
              onRowActivate={onRowActivate}
              showPagination={false}
            />
          </div>
        );
      })}
    </div>
  );
}
