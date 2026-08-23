import { formatKoreanDateRange } from "@/lib/date";
import { WorkLogTable } from "./WorkLogTable";
import type { WorkLogRecord } from "./mockData";
import { groupRecordsByWeek } from "./selectors";

interface MonthlyWorkLogViewProps {
  records: WorkLogRecord[];
  selectedRecordId: string | null;
  onRowActivate: (id: string) => void;
}

// Monthly grouped table (v2 Phase 5 §13, header simplified in v3 §13):
// presentation-only — owns no view, navigation, or modal state, and never
// edits records itself. `records` is expected to already be exactly one
// month's worth (from getMonthRecords), so `groupRecordsByWeek` naturally
// produces first/last groups trimmed to in-month dates only (it never
// invents adjacent-month entries — it can only bucket what's actually
// present in `records`). Each block reuses the existing WorkLogTable
// unchanged (same 9 columns, same row activation). The header now shows
// only the week's date range — the previous inline 실근무/평균 점수/근무일
// summary was removed (spec v3 §13); that data/its selectors are untouched
// and still power WeeklySummary elsewhere.
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

        return (
          <div key={group.key} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold tabular-nums text-fg-default">{formatKoreanDateRange(rangeStart, rangeEnd)}</h3>
            <WorkLogTable records={group.records} selectedRecordId={selectedRecordId} onRowActivate={onRowActivate} />
          </div>
        );
      })}
    </div>
  );
}
