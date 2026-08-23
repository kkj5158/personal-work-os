"use client";

import { useState, type ReactNode } from "react";
import { AttendanceSelect } from "./AttendanceSelect";
import { AppliedStartTimeField } from "./AppliedStartTimeField";
import { TimeInput } from "./TimeInput";
import { WorkLogModal } from "./WorkLogModal";
import { WorkTimeEntryEditor } from "./WorkTimeEntryEditor";
import { isWorkdayStatus } from "./attendance";
import { FOCUS_VISIBLE, formatHoursMinutes, formatKoreanDateWithWeekday, formatLatenessResult, getLatenessResultClassName, parseHoursMinutes } from "./format";
import type { AttendanceStatus, WorkLogRecord } from "./mockData";
import { computeStayMinutes, getLateness, getOnTimeOverrideEligibility, type LatenessResult } from "./selectors";
import { toWorkTimeDraftEntry, validateWorkTimeDraftEntries, type WorkTimeDraftEntry, type WorkTimeRowErrors } from "./workTimeEntry";
import { isActiveCriterionSnapshot, type AppliedStartTime, type StartTimeCriterion } from "./startTimeCriterion";

const TITLE_ID = "worklog-record-detail-title";

interface RecordDraft {
  status: AttendanceStatus;
  clockIn: string; // TimeInput-native: "" or "HH:mm"
  clockOut: string;
  appliedStartTime: AppliedStartTime | null;
  isOnTimeOverride: boolean;
  score: number | null;
  memo: string;
  workTimeEntries: WorkTimeDraftEntry[];
}

interface WorkLogRecordDetailModalProps {
  record: WorkLogRecord;
  onSave: (patch: Partial<WorkLogRecord>) => void;
  onClose: () => void;
  criteria: StartTimeCriterion[];
}

function draftFromRecord(record: WorkLogRecord): RecordDraft {
  return {
    status: record.status,
    clockIn: record.clockIn ?? "",
    clockOut: record.clockOut ?? "",
    appliedStartTime: record.appliedStartTime,
    isOnTimeOverride: record.isOnTimeOverride,
    score: record.score,
    memo: record.memo,
    workTimeEntries: record.workTimeEntries.map((entry) => toWorkTimeDraftEntry(entry, formatHoursMinutes)),
  };
}

// Unified record-edit modal (v4 policy correction): opens directly as an
// editable form for a weekly/monthly table row — there is no more read-only
// "view" step and no more separate 업무시간 기록 보기 transition to a second
// modal. Attendance, clock-in/out, applied start time, the on-time override,
// work score, work-time entries, and memo are all one draft, committed
// together by 저장 or discarded together by 취소/Escape/overlay-click
// (WorkLogModal's onClose already covers all three paths uniformly). The
// standalone Today Summary work-time flow is untouched — see
// WorkTimeEntryModal.tsx, which still opens on its own for today's record.
export function WorkLogRecordDetailModal({ record, onSave, onClose, criteria }: WorkLogRecordDetailModalProps) {
  const [draft, setDraft] = useState<RecordDraft>(() => draftFromRecord(record));
  const [clockError, setClockError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [criterionError, setCriterionError] = useState<string | null>(null);
  const [workTimeErrors, setWorkTimeErrors] = useState<Record<string, WorkTimeRowErrors>>({});
  // Historical clock-record correction (v7 §5–9): a single internal phase
  // rather than a second modal — only one role="dialog" ever exists. The
  // editor's own draft is untouched while a confirm/blocked phase is shown,
  // so 돌아가기/확인/Escape/overlay all just return to "edit" with the draft
  // exactly as it was.
  const [clockActionPhase, setClockActionPhase] = useState<"edit" | "confirm" | "blocked">("edit");

  // Reset the whole draft whenever a different record is opened (render-time
  // "adjust state when a key changes" pattern) — this modal is always
  // remounted fresh per row click in practice (page.tsx's single
  // discriminated modal state), but this keeps the component correct even
  // if that ever changes.
  const [syncedId, setSyncedId] = useState(record.id);
  if (record.id !== syncedId) {
    setSyncedId(record.id);
    setDraft(draftFromRecord(record));
    setClockError(null);
    setStatusError(null);
    setCriterionError(null);
    setWorkTimeErrors({});
    setClockActionPhase("edit");
  }

  // Any edit that could change *why* lateness was late — clock-in, the
  // applied criterion, or leaving working status entirely — silently clears
  // an active on-time override (spec v3 §4 invalidation rule), so a stale
  // override can never survive a fact that no longer supports it. Score,
  // memo, clock-out, and work-time-entry edits never touch it.
  function updateDraft(patch: Partial<RecordDraft>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      const invalidates =
        ("clockIn" in patch && patch.clockIn !== prev.clockIn) ||
        ("appliedStartTime" in patch && JSON.stringify(patch.appliedStartTime) !== JSON.stringify(prev.appliedStartTime)) ||
        ("status" in patch && isWorkdayStatus(prev.status) && !isWorkdayStatus(patch.status as AttendanceStatus));
      if (invalidates && prev.isOnTimeOverride) next.isOnTimeOverride = false;
      return next;
    });
  }

  // Live preview (spec §10/v3 §4): reflects the in-progress draft, not the
  // saved record, built by overriding only the fields getLateness actually
  // reads on a full WorkLogRecord so the existing shared selector can be
  // reused unchanged, with no duplicated arithmetic here.
  const previewRaw: LatenessResult = getLateness({
    ...record,
    status: draft.status,
    clockIn: draft.clockIn || null,
    appliedStartTime: draft.appliedStartTime,
  });
  const previewEffective: LatenessResult = draft.isOnTimeOverride ? { status: "on-time" } : previewRaw;
  const overrideEligibility = getOnTimeOverrideEligibility({
    status: draft.status,
    clockIn: draft.clockIn || null,
    appliedStartTime: draft.appliedStartTime,
    isOnTimeOverride: draft.isOnTimeOverride,
  });
  const previewStayMinutes = computeStayMinutes(draft.clockIn || null, draft.clockOut || null);
  const previewNetWorkMinutes = draft.workTimeEntries.reduce((sum, entry) => sum + (parseHoursMinutes(entry.timeText) ?? 0), 0);

  // "cancel" = in-progress (clock-in only, mirrors Today's 출근 취소);
  // "delete" = a completed pair (출퇴근 기록 삭제). A clock-out-only draft
  // is never valid/persisted, so it never reaches this — no third label.
  const clockActionType: "cancel" | "delete" | "none" = !draft.clockIn ? "none" : !draft.clockOut ? "cancel" : "delete";

  function handleClockActionRequest() {
    if (draft.workTimeEntries.length > 0) {
      setClockActionPhase("blocked");
      return;
    }
    setClockActionPhase("confirm");
  }

  function handleClockActionConfirm() {
    updateDraft({ clockIn: "", clockOut: "", isOnTimeOverride: false });
    setClockActionPhase("edit");
  }

  function handleSave() {
    let hasError = false;
    const nextClockIn = draft.clockIn.trim() === "" ? null : draft.clockIn;
    const nextClockOut = draft.clockOut.trim() === "" ? null : draft.clockOut;

    if (nextClockIn && nextClockOut && nextClockIn === nextClockOut) {
      setClockError("출근/퇴근 시간이 같을 수 없습니다.");
      hasError = true;
    } else {
      setClockError(null);
    }

    const { errors: nextWorkTimeErrors, validEntries } = validateWorkTimeDraftEntries(draft.workTimeEntries, parseHoursMinutes);
    setWorkTimeErrors(nextWorkTimeErrors);
    if (Object.keys(nextWorkTimeErrors).length > 0) hasError = true;

    // Attendance/work-time consistency rule: changing to a non-working
    // status while entries still exist would orphan them (기록 자체는
    // 근무/조퇴에서만 허용) — block the save entirely.
    if (!isWorkdayStatus(draft.status) && validEntries.length > 0) {
      setStatusError("업무시간 기록을 먼저 삭제한 후 출결을 변경하세요.");
      hasError = true;
    } else {
      setStatusError(null);
    }

    // v5 §7: a working-attendance record must have a saved active criterion
    // selected before it can be saved — 미설정/직접 입력 no longer exist as
    // valid end states.
    if (isWorkdayStatus(draft.status) && !isActiveCriterionSnapshot(draft.appliedStartTime, criteria)) {
      setCriterionError("출근 기준을 선택해주세요.");
      hasError = true;
    } else {
      setCriterionError(null);
    }

    if (hasError) return;
    if (clockActionPhase !== "edit") return;

    onSave({
      status: draft.status,
      clockIn: nextClockIn,
      clockOut: nextClockOut,
      appliedStartTime: draft.appliedStartTime,
      isOnTimeOverride: draft.isOnTimeOverride,
      score: draft.score,
      memo: draft.memo,
      workTimeEntries: validEntries,
      basicWorkMinutes: computeStayMinutes(nextClockIn, nextClockOut),
    });
    onClose();
  }

  if (clockActionPhase === "confirm") {
    return (
      <WorkLogModal
        titleId={TITLE_ID}
        title={clockActionType === "cancel" ? "출근을 취소할까요?" : "출퇴근 기록을 삭제할까요?"}
        onClose={() => setClockActionPhase("edit")}
        size="compact"
        footer={
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setClockActionPhase("edit")}
              data-autofocus
              className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
            >
              돌아가기
            </button>
            <button
              type="button"
              onClick={handleClockActionConfirm}
              className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 ${FOCUS_VISIBLE}`}
            >
              {clockActionType === "cancel" ? "출근 취소" : "기록 삭제"}
            </button>
          </div>
        }
      />
    );
  }

  if (clockActionPhase === "blocked") {
    return (
      <WorkLogModal
        titleId={TITLE_ID}
        title="업무시간 기록을 먼저 삭제해주세요."
        onClose={() => setClockActionPhase("edit")}
        size="compact"
        footer={
          <button
            type="button"
            onClick={() => setClockActionPhase("edit")}
            data-autofocus
            className={`ml-auto h-9 rounded-md bg-primary-emphasis px-3 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
          >
            확인
          </button>
        }
      />
    );
  }

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title="근무 기록 수정"
      onClose={onClose}
      size="wide"
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
            className={`rounded-md bg-primary-emphasis h-9 px-4 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
          >
            저장
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <p className="text-base font-medium text-fg-default">{formatKoreanDateWithWeekday(record.date)}</p>

        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field label="출결">
              <AttendanceSelect value={draft.status} onChange={(status) => updateDraft({ status })} ariaLabel="출결" />
              {statusError && <span className="text-xs text-danger-fg">{statusError}</span>}
            </Field>

            <Field label="근무 장소">
              <span className="text-sm text-fg-default">{record.location}</span>
            </Field>

            <Field label="출근 시간">
              <TimeInput
                value={draft.clockIn}
                onChange={(clockIn) => updateDraft({ clockIn })}
                aria-label="출근 시간"
                invalid={!!clockError}
              />
            </Field>

            <Field label="퇴근 시간">
              <TimeInput
                value={draft.clockOut}
                onChange={(clockOut) => updateDraft({ clockOut })}
                aria-label="퇴근 시간"
                invalid={!!clockError}
                describedBy={clockError ? "clock-time-error" : undefined}
              />
              {clockError && (
                <span id="clock-time-error" className="text-xs text-danger-fg">
                  {clockError}
                </span>
              )}
            </Field>

            {clockActionType !== "none" && (
              <button
                type="button"
                onClick={handleClockActionRequest}
                className={`h-7 w-fit rounded-md border border-danger-fg bg-surface-default px-2.5 text-xs font-medium text-danger-fg hover:bg-danger-subtle ${FOCUS_VISIBLE}`}
              >
                {clockActionType === "cancel" ? "출근 취소" : "출퇴근 기록 삭제"}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Field label="출근 기준">
              <AppliedStartTimeField
                value={draft.appliedStartTime}
                onChange={(appliedStartTime) => updateDraft({ appliedStartTime })}
                criteria={criteria}
              />
              {criterionError && <span className="text-xs text-danger-fg">{criterionError}</span>}
            </Field>

            <Field label="근무 점수">
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
                className={`h-9 w-20 rounded-md border border-control-border bg-control-bg px-2 text-center text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              />
            </Field>
          </div>
        </div>

        {/* Derived summary strip (spec v3 §6): 체류 시간/실근무/지각 read
            large and bold — 근무 점수 stays the one editable field above,
            not duplicated here. 작업 블록 합계 is never shown. */}
        <div className="flex flex-wrap items-center gap-y-2 divide-x divide-border-default rounded-md border border-border-default bg-canvas-subtle px-5 py-3">
          <SummaryStat label="체류 시간" value={formatHoursMinutes(previewStayMinutes)} valueClassName="text-primary-fg" />
          <SummaryStat
            label="실근무"
            value={isWorkdayStatus(draft.status) ? formatHoursMinutes(previewNetWorkMinutes) : "–"}
            valueClassName="text-success-fg"
          />
          <div className="flex items-center gap-2 whitespace-nowrap px-5 first:pl-0">
            <span className="whitespace-nowrap text-xs text-fg-muted">지각</span>
            <span className={`whitespace-nowrap text-lg font-semibold tabular-nums ${getLatenessResultClassName(previewEffective)}`}>
              {formatLatenessResult(previewEffective)}
            </span>
            {overrideEligibility === "apply" && (
              <button
                type="button"
                onClick={() => updateDraft({ isOnTimeOverride: true })}
                aria-label="정시 출근으로 처리"
                className={`h-6 whitespace-nowrap rounded border border-control-border bg-surface-default px-2 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-fg-default ${FOCUS_VISIBLE}`}
              >
                정시 출근 처리
              </button>
            )}
            {overrideEligibility === "cancel" && (
              <button
                type="button"
                onClick={() => updateDraft({ isOnTimeOverride: false })}
                aria-label="정시 출근 처리 취소"
                className={`h-6 whitespace-nowrap rounded border border-control-border bg-surface-default px-2 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-fg-default ${FOCUS_VISIBLE}`}
              >
                처리 취소
              </button>
            )}
            {draft.isOnTimeOverride && previewRaw.status === "late" && (
              <span className="whitespace-nowrap text-xs text-fg-muted">(원본 {previewRaw.minutes}분 지각)</span>
            )}
          </div>
        </div>

        <div className="border-t border-border-default pt-5">
          <h3 className="mb-3 text-[15px] font-semibold text-fg-default">업무시간 기록</h3>
          <WorkTimeEntryEditor
            entries={draft.workTimeEntries}
            onChange={(workTimeEntries) => setDraft((prev) => ({ ...prev, workTimeEntries }))}
            errors={workTimeErrors}
          />
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border-default pt-5">
          <span className="text-xs text-fg-muted">메모</span>
          <textarea
            aria-label="메모"
            rows={4}
            maxLength={500}
            value={draft.memo}
            onChange={(e) => updateDraft({ memo: e.target.value })}
            className={`w-full resize-none rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </div>
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

function SummaryStat({ label, value, valueClassName }: { label: string; value: ReactNode; valueClassName: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap px-5 first:pl-0">
      <span className="whitespace-nowrap text-xs text-fg-muted">{label}</span>
      <span className={`whitespace-nowrap text-lg font-semibold tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}
