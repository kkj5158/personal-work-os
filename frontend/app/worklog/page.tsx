"use client";

import { useState } from "react";
import { addDays, startOfWeek } from "@/lib/date";
import { WorkLogToolbar } from "./WorkLogToolbar";
import { WorkLogTable } from "./WorkLogTable";
import { WorkLogDetailPanel } from "./WorkLogDetailPanel";
import { WeeklySummary } from "./WeeklySummary";
import { getWeekRecords, type WorkLogRecord } from "./mockData";

// Default anchor matches the approved reference image's week
// (docs/frontend/work-log/work-log-ui-final.png, 2026.08.10–2026.08.16) so
// this page can be visually compared against it directly. "오늘" still
// navigates to the real current week.
const MOCK_ANCHOR_DATE = new Date(2026, 7, 10);

export default function WorkLogPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(MOCK_ANCHOR_DATE));
  const [records, setRecords] = useState<WorkLogRecord[]>(() => getWeekRecords(startOfWeek(MOCK_ANCHOR_DATE)));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const weekEnd = addDays(weekStart, 6);
  const selectedRecord = records.find((r) => r.id === selectedId) ?? records[0] ?? null;

  function goToWeek(nextWeekStart: Date) {
    setWeekStart(nextWeekStart);
    setRecords(getWeekRecords(nextWeekStart));
    setSelectedId(null);
  }

  function handleSaveRecord(updated: WorkLogRecord) {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  return (
    <div className="flex h-full min-h-screen flex-col bg-canvas-default">
      <header className="flex items-center justify-between border-b border-border-default bg-surface-default px-4 py-3">
        <h1 className="text-lg font-semibold text-fg-default">근무 기록</h1>
      </header>

      <WorkLogToolbar
        weekStart={weekStart}
        weekEnd={weekEnd}
        onPrevWeek={() => goToWeek(addDays(weekStart, -7))}
        onNextWeek={() => goToWeek(addDays(weekStart, 7))}
        onToday={() => goToWeek(startOfWeek(new Date()))}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <WorkLogTable records={records} selectedId={selectedRecord?.id ?? null} onSelectRow={setSelectedId} />
        </div>

        <WorkLogDetailPanel record={selectedRecord} onSave={handleSaveRecord} />
      </div>

      <WeeklySummary weekStart={weekStart} weekEnd={weekEnd} records={records} />
    </div>
  );
}
