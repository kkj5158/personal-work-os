"use client";

import { useState } from "react";
import { WorkLogModal } from "./WorkLogModal";
import { FOCUS_VISIBLE, formatHoursMinutes, formatKoreanDateWithWeekday, parseHoursMinutes } from "./format";
import type { WorkLogRecord } from "./mockData";
import type { WorkTimeEntry } from "./workTimeEntry";
import { toWorkTimeDraftEntry, validateWorkTimeDraftEntries, type WorkTimeDraftEntry, type WorkTimeRowErrors } from "./workTimeEntry";
import { WorkTimeEntryEditor } from "./WorkTimeEntryEditor";

const TITLE_ID = "worklog-time-entry-title";

interface WorkTimeEntryModalProps {
  record: WorkLogRecord;
  onSave: (entries: WorkTimeEntry[]) => void;
  /** Handles every close path (취소/Escape/overlay) for this standalone Today
   *  entry point — always returns to the bare page (spec v4: the record-edit
   *  modal now embeds its own copy of this editor directly and never opens
   *  this modal as a second step). */
  onClose: () => void;
}

// Standalone Today work-time entry modal (spec §10, preserved as its own
// entry point in the v4 unified-modal batch — see WorkLogRecordDetailModal
// for the embedded copy used by weekly/monthly record editing). Owns its
// own draft/errors state and delegates every row's rendering/validation to
// the shared WorkTimeEntryEditor/validateWorkTimeDraftEntries so the two
// entry points can never validate differently.
export function WorkTimeEntryModal({ record, onSave, onClose }: WorkTimeEntryModalProps) {
  const [draftEntries, setDraftEntries] = useState<WorkTimeDraftEntry[]>(() =>
    record.workTimeEntries.map((entry) => toWorkTimeDraftEntry(entry, (m) => formatHoursMinutes(m))),
  );
  const [errors, setErrors] = useState<Record<string, WorkTimeRowErrors>>({});

  function handleSave() {
    const { errors: nextErrors, validEntries } = validateWorkTimeDraftEntries(draftEntries, parseHoursMinutes);
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
      <WorkTimeEntryEditor entries={draftEntries} onChange={setDraftEntries} errors={errors} />
    </WorkLogModal>
  );
}
