"use client";

import { useState } from "react";
import { PlusIcon, TrashIcon } from "@primer/octicons-react";
import { WorkLogModal } from "./WorkLogModal";
import { FOCUS_VISIBLE, formatHoursMinutes, formatKoreanDateWithWeekday, parseHoursMinutes } from "./format";
import type { WorkLogRecord } from "./mockData";
import type { WorkTimeEntry } from "./workTimeEntry";

const TITLE_ID = "worklog-time-entry-title";

interface DraftEntry {
  id: string;
  item: string;
  timeText: string;
  memo: string;
}

interface RowErrors {
  item?: string;
  time?: string;
}

interface WorkTimeEntryModalProps {
  record: WorkLogRecord;
  onSave: (entries: WorkTimeEntry[]) => void;
  /**
   * Handles every close path (닫기/취소/Escape/overlay). The caller decides
   * what "close" means — return to the record-detail modal in view mode, or
   * return to the bare page — depending on which entry point opened this
   * modal (spec §8); this component doesn't need to know which.
   */
  onClose: () => void;
}

function toDraftEntry(entry: WorkTimeEntry): DraftEntry {
  return { id: entry.id, item: entry.item, timeText: formatHoursMinutes(entry.minutes), memo: entry.memo ?? "" };
}

function isBlankRow(entry: DraftEntry): boolean {
  return entry.item.trim() === "" && entry.timeText.trim() === "" && entry.memo.trim() === "";
}

// Additive work-time entry model (spec §10): every entry's minutes sum to
// the day's 실근무 — this is never an allocation/target/remaining model.
// 항목 is a plain free-text field (spec §3 of this phase): no fixed
// enum/select yet, and entries are never deduplicated by item text.
export function WorkTimeEntryModal({ record, onSave, onClose }: WorkTimeEntryModalProps) {
  const [draftEntries, setDraftEntries] = useState<DraftEntry[]>(() => record.workTimeEntries.map(toDraftEntry));
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});

  const draftTotalMinutes = draftEntries.reduce((sum, entry) => sum + (parseHoursMinutes(entry.timeText) ?? 0), 0);

  function updateEntry(id: string, patch: Partial<DraftEntry>) {
    setDraftEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    setDraftEntries((prev) => prev.filter((e) => e.id !== id));
    setErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addEntry() {
    setDraftEntries((prev) => [...prev, { id: crypto.randomUUID(), item: "", timeText: "", memo: "" }]);
  }

  function handleSave() {
    const nextErrors: Record<string, RowErrors> = {};
    const validEntries: WorkTimeEntry[] = [];

    for (const entry of draftEntries) {
      // An entirely blank row (never touched, or added and left empty) is
      // silently dropped rather than blocking save or being required to be
      // explicitly deleted — the simplest behavior for an accidental
      // "기록 추가" click (spec §7 — chosen behavior, reported explicitly).
      if (isBlankRow(entry)) continue;

      const rowErrors: RowErrors = {};
      if (entry.item.trim() === "") rowErrors.item = "항목을 입력하세요";
      const minutes = parseHoursMinutes(entry.timeText);
      if (minutes == null) rowErrors.time = "HH:MM 형식으로 입력하세요 (예: 01:30)";
      else if (minutes <= 0) rowErrors.time = "00:00은 저장할 수 없습니다";

      if (rowErrors.item || rowErrors.time) {
        nextErrors[entry.id] = rowErrors;
        continue;
      }

      validEntries.push({ id: entry.id, item: entry.item.trim(), minutes: minutes as number, memo: entry.memo.trim() || undefined });
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    onSave(validEntries);
  }

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title="업무시간 기록"
      onClose={onClose}
      footer={
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            className={`rounded-md border border-control-border bg-surface-default h-9 px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`rounded-md bg-success-emphasis h-9 px-3 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
          >
            저장
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm font-medium text-fg-default">{formatKoreanDateWithWeekday(record.date)}</p>

      <div className="mb-4 rounded-lg border border-border-default bg-canvas-subtle px-6 py-4">
        <span className="text-xs text-fg-muted">실근무</span>
        <div className="text-2xl font-semibold text-primary-fg">{formatHoursMinutes(draftTotalMinutes)}</div>
      </div>

      <div className="overflow-x-auto rounded-md border-l border-t border-border-default">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["항목", "시간", "메모", "관리"].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="border-b border-r border-border-default bg-canvas-subtle px-3 py-2.5 text-left text-xs font-medium text-fg-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draftEntries.length === 0 && (
              <tr>
                <td colSpan={4} className="border-b border-r border-border-default px-3 py-3 text-center text-sm text-fg-muted">
                  기록된 업무시간이 없습니다.
                </td>
              </tr>
            )}
            {draftEntries.map((entry) => {
              const rowErrors = errors[entry.id];
              return (
                <tr key={entry.id}>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <input
                      type="text"
                      aria-label="항목"
                      value={entry.item}
                      onChange={(e) => updateEntry(entry.id, { item: e.target.value })}
                      className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.item && <span className="mt-1 block text-xs text-danger-fg">{rowErrors.item}</span>}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <input
                      type="text"
                      aria-label="시간"
                      placeholder="예: 01:30"
                      value={entry.timeText}
                      onChange={(e) => updateEntry(entry.id, { timeText: e.target.value })}
                      className={`h-9 w-28 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.time && <span className="mt-1 block text-xs text-danger-fg">{rowErrors.time}</span>}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <input
                      type="text"
                      aria-label="메모"
                      value={entry.memo}
                      onChange={(e) => updateEntry(entry.id, { memo: e.target.value })}
                      className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      aria-label="기록 삭제"
                      className={`rounded-md p-2 text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg ${FOCUS_VISIBLE}`}
                    >
                      <TrashIcon size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addEntry}
        className={`mt-3 flex items-center gap-1.5 rounded-md border border-control-border bg-surface-default h-9 px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        <PlusIcon size={16} aria-hidden="true" />
        기록 추가
      </button>
    </WorkLogModal>
  );
}
