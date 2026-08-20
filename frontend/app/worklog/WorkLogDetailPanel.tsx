"use client";

import { useState, type ReactNode } from "react";
import { InfoIcon, KebabHorizontalIcon, LocationIcon } from "@primer/octicons-react";
import { ScoreRing } from "./ScoreRing";
import { FOCUS_VISIBLE, formatHoursMinutes, formatKoreanDateWithWeekday, parseHoursMinutes } from "./format";
import { ATTENDANCE_STATUSES, type AttendanceStatus, type WorkLogRecord } from "./mockData";

const MEMO_MAX_LENGTH = 500;

interface WorkLogDetailPanelProps {
  record: WorkLogRecord | null;
  onSave: (updated: WorkLogRecord) => void;
}

// Editing here is entirely local draft state (spec §8 + Phase 2 scope §5):
// - Cancel discards the draft and restores the currently-selected record's
//   committed (in-memory mock) values.
// - Save writes the draft back into the in-memory mock record only. No
//   network request is made — see mockData.ts for the API boundary.
export function WorkLogDetailPanel({ record, onSave }: WorkLogDetailPanelProps) {
  const [draft, setDraft] = useState<WorkLogRecord | null>(record);
  // Adjust local draft state during render when the selected record's
  // identity changes, per React's guidance for resetting state on prop
  // changes — avoids the cascading-render issue of doing this in an effect.
  const [syncedId, setSyncedId] = useState<string | null>(record?.id ?? null);
  if ((record?.id ?? null) !== syncedId) {
    setSyncedId(record?.id ?? null);
    setDraft(record);
  }

  if (!draft) {
    return (
      <aside className="w-[340px] shrink-0 border-l border-border-default bg-surface-default p-4 text-sm text-fg-muted">
        표시할 기록이 없습니다.
      </aside>
    );
  }

  function updateDraft(patch: Partial<WorkLogRecord>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function handleCancel() {
    setDraft(record);
  }

  function handleSave() {
    if (draft) {
      onSave(draft);
    }
  }

  const memoLength = draft.memo.length;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border-default bg-surface-default">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <h2 className="text-sm font-semibold text-fg-default">{formatKoreanDateWithWeekday(draft.date)}</h2>
        <button
          type="button"
          aria-label="추가 옵션"
          className={`rounded p-1 text-fg-muted hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          <KebabHorizontalIcon size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-3 border-b border-border-default px-4 py-3">
        <Field label="출결" htmlFor="worklog-status">
          <select
            id="worklog-status"
            value={draft.status}
            onChange={(e) => updateDraft({ status: e.target.value as AttendanceStatus })}
            className={`w-full rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          >
            {ATTENDANCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>

        <Field label="근무 장소" htmlFor="worklog-location">
          <div className="flex items-center gap-1.5 rounded-md border border-control-border bg-control-bg px-2.5 py-1.5">
            <LocationIcon size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
            <input
              id="worklog-location"
              type="text"
              value={draft.location}
              onChange={(e) => updateDraft({ location: e.target.value })}
              className={`w-full bg-transparent text-sm text-fg-default focus:outline-none ${FOCUS_VISIBLE}`}
            />
          </div>
        </Field>

        <Field label="출근 시간" htmlFor="worklog-clock-in">
          <input
            id="worklog-clock-in"
            type="time"
            value={draft.clockIn ?? ""}
            onChange={(e) => updateDraft({ clockIn: e.target.value || null })}
            className={`w-full rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </Field>

        <Field label="퇴근 시간" htmlFor="worklog-clock-out">
          <input
            id="worklog-clock-out"
            type="time"
            value={draft.clockOut ?? ""}
            onChange={(e) => updateDraft({ clockOut: e.target.value || null })}
            className={`w-full rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2.5 border-b border-border-default px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">근무 시간</h3>

        <ReadOnlyRow label="체류 시간" hint="자동 계산">
          <span className="font-medium text-primary-fg">{formatHoursMinutes(draft.basicWorkMinutes)}</span>
        </ReadOnlyRow>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-sm text-fg-muted">
            실근무
            <InfoIcon size={14} aria-hidden="true" />
          </span>
          <div className="flex flex-col items-end gap-0.5">
            <input
              type="text"
              inputMode="numeric"
              aria-label="실근무 시간 (직접 조정)"
              value={formatHoursMinutes(draft.netWorkMinutes)}
              onChange={(e) => {
                const parsed = parseHoursMinutes(e.target.value);
                if (parsed != null) updateDraft({ netWorkMinutes: parsed });
              }}
              className={`w-20 rounded-md border border-control-border bg-control-bg px-2 py-1 text-right text-sm font-medium text-success-fg focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
            <span className="text-xs text-fg-muted">직접 조정</span>
          </div>
        </div>

        <ReadOnlyRow label="작업 블록 합계" hint="읽기 전용 합계">
          {formatHoursMinutes(draft.actualBlockMinutes)}
        </ReadOnlyRow>
      </div>

      <div className="flex flex-col gap-2.5 border-b border-border-default px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-fg-muted">지각</span>
          <span className={draft.lateMinutes ? "text-sm font-medium text-danger-fg" : "text-sm text-fg-muted"}>
            {draft.lateMinutes ? `+00:${draft.lateMinutes.toString().padStart(2, "0")}` : "–"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-sm text-fg-muted">
            근무 점수
            <InfoIcon size={14} aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              aria-label="근무 점수"
              value={draft.score ?? ""}
              onChange={(e) => {
                const value = e.target.value === "" ? null : Number(e.target.value);
                updateDraft({ score: value == null ? null : Math.max(0, Math.min(100, value)) });
              }}
              className={`w-14 rounded-md border border-control-border bg-control-bg px-2 py-1 text-right text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
            <ScoreRing score={draft.score} size={24} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
        <label htmlFor="worklog-memo" className="text-sm text-fg-muted">
          메모
        </label>
        <textarea
          id="worklog-memo"
          rows={4}
          maxLength={MEMO_MAX_LENGTH}
          value={draft.memo}
          onChange={(e) => updateDraft({ memo: e.target.value })}
          className={`w-full resize-none rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
        />
        <span className="self-end text-xs text-fg-muted">
          {memoLength} / {MEMO_MAX_LENGTH}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border-default px-4 py-3">
        <button
          type="button"
          onClick={handleCancel}
          className={`rounded-md border border-control-border bg-surface-default px-3 py-1.5 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          className={`rounded-md bg-success-emphasis px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
        >
          변경사항 저장
        </button>
      </div>
    </aside>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm text-fg-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReadOnlyRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-sm text-fg-muted">
        {label}
        <InfoIcon size={14} aria-hidden="true" />
      </span>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm">{children}</span>
        <span className="text-xs text-fg-muted">{hint}</span>
      </div>
    </div>
  );
}
