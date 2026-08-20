"use client";

import { useState, type ReactNode } from "react";
import { AttendanceBadge } from "./AttendanceBadge";
import { ScoreRing } from "./ScoreRing";
import { WorkLogModal } from "./WorkLogModal";
import {
  FOCUS_VISIBLE,
  formatClockTime12Hour,
  formatHoursMinutes,
  formatKoreanDateWithWeekday,
  formatLateness,
  parseClockTime12Hour,
} from "./format";
import { ATTENDANCE_STATUSES, type AttendanceStatus, type WorkLogRecord } from "./mockData";

const MEMO_MAX_LENGTH = 500;
const TITLE_ID = "worklog-record-detail-title";

type RecordDetailMode = "view" | "edit";

interface RecordEditPatch {
  status: AttendanceStatus;
  clockIn: string | null;
  clockOut: string | null;
  score: number | null;
  memo: string;
}

interface WorkLogRecordDetailModalProps {
  record: WorkLogRecord;
  mode: RecordDetailMode;
  onModeChange: (mode: RecordDetailMode) => void;
  onSave: (patch: Partial<WorkLogRecord>) => void;
  onClose: () => void;
}

function toClockInputText(value: string | null): string {
  return value ? formatClockTime12Hour(value) : "";
}

// View/edit record-detail modal (spec §9/§5). Only 출결/출근 시간/퇴근
// 시간/근무 점수/메모 are editable — 날짜/근무 장소/체류 시간/실근무/작업
// 블록 합계/지각 stay read-only even in edit mode (location management and
// the 실근무-from-work-time-entries derivation are both deferred; 작업 블록
// 합계/지각 are derived/read-only concepts). Draft state is entirely local
// to this component and is discarded whenever it unmounts (modal close) —
// no localStorage, no backend request.
export function WorkLogRecordDetailModal({ record, mode, onModeChange, onSave, onClose }: WorkLogRecordDetailModalProps) {
  const [draft, setDraft] = useState<RecordEditPatch>(() => ({
    status: record.status,
    clockIn: record.clockIn,
    clockOut: record.clockOut,
    score: record.score,
    memo: record.memo,
  }));
  const [clockInText, setClockInText] = useState(() => toClockInputText(record.clockIn));
  const [clockOutText, setClockOutText] = useState(() => toClockInputText(record.clockOut));
  const [clockInError, setClockInError] = useState<string | null>(null);
  const [clockOutError, setClockOutError] = useState<string | null>(null);

  // Reset the edit draft whenever we (re-)enter edit mode for this record —
  // the render-time "adjust state when a key changes" pattern (React's
  // documented alternative to resetting state in an effect), matching the
  // idiom the pre-v2 detail panel already used in this route.
  const [syncedKey, setSyncedKey] = useState(`${record.id}:${mode}`);
  const currentKey = `${record.id}:${mode}`;
  if (currentKey !== syncedKey) {
    setSyncedKey(currentKey);
    setDraft({ status: record.status, clockIn: record.clockIn, clockOut: record.clockOut, score: record.score, memo: record.memo });
    setClockInText(toClockInputText(record.clockIn));
    setClockOutText(toClockInputText(record.clockOut));
    setClockInError(null);
    setClockOutError(null);
  }

  function handleEdit() {
    onModeChange("edit");
  }

  function handleCancel() {
    onModeChange("view");
  }

  function handleSave() {
    let nextClockIn = draft.clockIn;
    let nextClockOut = draft.clockOut;
    let hasError = false;

    if (clockInText.trim() === "") {
      nextClockIn = null;
      setClockInError(null);
    } else {
      const parsed = parseClockTime12Hour(clockInText);
      if (parsed == null) {
        setClockInError("hh:mm AM/PM 형식으로 입력하세요 (예: 09:12 AM)");
        hasError = true;
      } else {
        nextClockIn = parsed;
        setClockInError(null);
      }
    }

    if (clockOutText.trim() === "") {
      nextClockOut = null;
      setClockOutError(null);
    } else {
      const parsed = parseClockTime12Hour(clockOutText);
      if (parsed == null) {
        setClockOutError("hh:mm AM/PM 형식으로 입력하세요 (예: 06:02 PM)");
        hasError = true;
      } else {
        nextClockOut = parsed;
        setClockOutError(null);
      }
    }

    if (hasError) return;

    onSave({ status: draft.status, clockIn: nextClockIn, clockOut: nextClockOut, score: draft.score, memo: draft.memo });
    onModeChange("view");
  }

  const isEdit = mode === "edit";

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title="근무 기록 상세"
      onClose={onClose}
      footer={
        isEdit ? (
          <div className="ml-auto flex items-center gap-2">
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
              저장
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled
              title="업무시간 기록 모달은 다음 단계에서 제공됩니다"
              className={`rounded-md border border-control-border bg-surface-default px-3 py-1.5 text-sm font-medium text-fg-default disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-default ${FOCUS_VISIBLE}`}
            >
              업무시간 기록 보기
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                data-autofocus
                className={`rounded-md border border-control-border bg-surface-default px-3 py-1.5 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className={`rounded-md bg-primary-emphasis px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
              >
                수정
              </button>
            </div>
          </>
        )
      }
    >
      <p className="mb-4 text-sm font-medium text-fg-default">{formatKoreanDateWithWeekday(record.date)}</p>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <div className="flex flex-col gap-4">
          <Field label="출결">
            {isEdit ? (
              <select
                aria-label="출결"
                value={draft.status}
                onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as AttendanceStatus }))}
                className={`w-full rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              >
                {ATTENDANCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            ) : (
              <AttendanceBadge status={record.status} />
            )}
          </Field>

          <Field label="근무 장소">
            <span className="text-sm text-fg-default">{record.location}</span>
          </Field>

          <Field label="출근 시간">
            {isEdit ? (
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  aria-label="출근 시간"
                  placeholder="예: 09:12 AM"
                  value={clockInText}
                  onChange={(e) => setClockInText(e.target.value)}
                  className={`w-full rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                />
                {clockInError && <span className="text-xs text-danger-fg">{clockInError}</span>}
              </div>
            ) : (
              <span className="text-sm text-fg-default">{formatClockTime12Hour(record.clockIn)}</span>
            )}
          </Field>

          <Field label="퇴근 시간">
            {isEdit ? (
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  aria-label="퇴근 시간"
                  placeholder="예: 06:02 PM"
                  value={clockOutText}
                  onChange={(e) => setClockOutText(e.target.value)}
                  className={`w-full rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                />
                {clockOutError && <span className="text-xs text-danger-fg">{clockOutError}</span>}
              </div>
            ) : (
              <span className="text-sm text-fg-default">{formatClockTime12Hour(record.clockOut)}</span>
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="체류 시간">
            <span className="text-sm font-medium text-primary-fg">{formatHoursMinutes(record.basicWorkMinutes)}</span>
          </Field>

          <Field label="실근무">
            <span className="text-sm font-medium text-success-fg">{formatHoursMinutes(record.netWorkMinutes)}</span>
          </Field>

          <Field label="작업 블록 합계">
            <span className="text-sm text-fg-default">{formatHoursMinutes(record.actualBlockMinutes)}</span>
          </Field>

          <Field label="지각">
            <span className={record.lateMinutes ? "text-sm font-medium text-danger-fg" : "text-sm text-fg-muted"}>
              {formatLateness(record.lateMinutes)}
            </span>
          </Field>

          <Field label="근무 점수">
            {isEdit ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  aria-label="근무 점수"
                  value={draft.score ?? ""}
                  onChange={(e) => {
                    const value = e.target.value === "" ? null : Number(e.target.value);
                    setDraft((prev) => ({ ...prev, score: value == null ? null : Math.max(0, Math.min(100, value)) }));
                  }}
                  className={`w-16 rounded-md border border-control-border bg-control-bg px-2 py-1 text-right text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                />
                <ScoreRing score={draft.score} size={22} />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-fg-default">{record.score ?? "–"}</span>
                <ScoreRing score={record.score} size={22} />
              </div>
            )}
          </Field>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">메모</span>
        {isEdit ? (
          <textarea
            aria-label="메모"
            rows={3}
            maxLength={MEMO_MAX_LENGTH}
            value={draft.memo}
            onChange={(e) => setDraft((prev) => ({ ...prev, memo: e.target.value }))}
            className={`w-full resize-none rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-fg-default">{record.memo || "–"}</p>
        )}
      </div>
    </WorkLogModal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </div>
  );
}
