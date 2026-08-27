import { formatKoreanDateRange } from "@/lib/date";
import { WorkLogTable } from "./WorkLogTable";
import type { WorkLogRecord } from "./mockData";
import { buildDayEntries, groupDayEntriesByWeek } from "./selectors";

interface MonthlyWorkLogViewProps {
  rangeStart: Date;
  rangeEnd: Date;
  records: WorkLogRecord[];
  selectedRecordId: string | null;
  onRowActivate: (id: string) => void;
}

// Monthly grouped table: presentation-only — owns no view, navigation, or
// modal state, and never edits records itself. `records` may be sparse
// (real backend data, unlike the old mock generators) — `groupDayEntriesByWeek`
// is calendar-driven, not record-driven, so a week with zero actual records
// still renders (as an all-미입력 block) rather than silently vanishing.
// Each block reuses the existing WorkLogTable unchanged. The header shows
// only the week's in-month date range — a partial edge week is trimmed to
// its actual in-month days, never leaking an adjacent month's date.
export function MonthlyWorkLogView({ rangeStart, rangeEnd, records, selectedRecordId, onRowActivate }: MonthlyWorkLogViewProps) {
  const weekGroups = groupDayEntriesByWeek(buildDayEntries(rangeStart, rangeEnd, records));

  return (
    <div className="flex flex-col gap-5">
      {weekGroups.map((group) => {
        const groupRangeStart = group.days[0].date;
        const groupRangeEnd = group.days[group.days.length - 1].date;

        return (
          <div key={group.key} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold tabular-nums text-fg-default">{formatKoreanDateRange(groupRangeStart, groupRangeEnd)}</h3>
            <WorkLogTable days={group.days} selectedRecordId={selectedRecordId} onRowActivate={onRowActivate} />
          </div>
        );
      })}
    </div>
  );
}
