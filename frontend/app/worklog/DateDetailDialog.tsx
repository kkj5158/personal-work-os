"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@primer/octicons-react";
import type { ActivityCategory, AttendancePlanDto, PlannableAttendanceStatus, PlannedTimeBlock } from "@/lib/api/types";
import { ActualRecordSummarySection } from "./ActualRecordSummarySection";
import { AttendancePlanSection, requiresCriterion, STATUS_LABELS } from "./AttendancePlanSection";
import { PlannedWorkBlockEditor } from "./PlannedWorkBlockEditor";
import { formatHoursMinutes, formatKoreanDateWithWeekday, FOCUS_VISIBLE } from "./format";
import { WorkLogModal } from "./WorkLogModal";
import type { WorkLogRecord } from "./mockData";
import type { StartTimeCriterion } from "./startTimeCriterion";
import { parseLocalDateTime } from "@/lib/date";

function blockMinutesSum(blocks: PlannedTimeBlock[]): number {
  return blocks.reduce((sum, b) => sum + Math.round((parseLocalDateTime(b.endAt).getTime() - parseLocalDateTime(b.startAt).getTime()) / 60000), 0);
}

interface DateDetailDialogProps {
  date: Date;
  referenceDate: Date;
  record: WorkLogRecord | null;
  existingPlan: AttendancePlanDto | null;
  criteria: StartTimeCriterion[];
  categories: ActivityCategory[];
  /** Already scoped to this dialog's own date by the caller. */
  plannedBlocks: PlannedTimeBlock[];
  onClose: () => void;
  onPlanSaved: (plan: AttendancePlanDto) => void;
  onPlanDeleted: (date: Date) => void;
  onBlockUpserted: (block: PlannedTimeBlock) => void;
  onBlockDeleted: (id: string) => void;
  /** "근무 기록 상세 보기" — hands off to the existing WorkLogRecordDetailModal.
   *  Closes this dialog first (§10: no nested modal chains). */
  onOpenWorkRecordDetail: (date: Date) => void;
}

// Date Detail Dialog (§10-14/§19 attendance follow-up, enlarged + refined in
// QA round 2 §3-11) — replaces the old narrow anchored Quick Plan Popover.
// Three domain sections: 실제 기록 (WorkRecord, always read-only from
// Attendance — see ActualRecordSummarySection, which contains no form
// fields or save action at all), 출결 계획 (AttendancePlan), 계획 업무
// (PlannedTimeBlock) — the latter two grouped under one collapsible "계획"
// section. Built from reusable, self-contained sub-components with no
// Attendance-specific coupling baked into them, so a future Planning
// Calendar can compose the same pieces against the same canonical
// AttendancePlan/PlannedTimeBlock records — never a second, synchronized
// copy of either domain.
//
// QA round 2: widened to "wide" (820px) — a real planning workspace, not a
// scaled-up popover (§4). The dormant/effective visibility rule for both
// the criterion field, the new plannedNetWorkMinutes field, and the block
// editor is driven by ONE status value: for an editable date, the *live
// draft* status (never the stale saved one — see effectiveStatus below,
// fixing a precedence bug where a not-yet-saved status change didn't
// actually hide the block editor); for a past date, the saved status only,
// since there is no draft to speak of.
export function DateDetailDialog({
  date,
  referenceDate,
  record,
  existingPlan,
  criteria,
  categories,
  plannedBlocks,
  onClose,
  onPlanSaved,
  onPlanDeleted,
  onBlockUpserted,
  onBlockDeleted,
  onOpenWorkRecordDetail,
}: DateDetailDialogProps) {
  const startOfReference = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isToday = startOfDate.getTime() === startOfReference.getTime();
  const isFuture = startOfDate.getTime() > startOfReference.getTime();
  const isPast = !isToday && !isFuture;
  // Editable window matches AttendancePlan/PlannedTimeBlock product policy:
  // a plan may only be created/edited/deleted today-or-future — past plans
  // are historical data (§13). Never derived independently per section.
  const editable = isToday || isFuture;

  const [collapsed, setCollapsed] = useState(isPast);
  // Tracks the live draft status from AttendancePlanSection so sibling
  // sections stay in sync without waiting for a save. Initialized to match
  // AttendancePlanSection's own initial draft so the very first render
  // (before any click) already agrees with it.
  const [draftStatus, setDraftStatus] = useState<PlannableAttendanceStatus>(existingPlan?.plannedStatus ?? "WORK");
  // P1-B fix: whether PlannedWorkBlockEditor's add-block form currently
  // holds meaningful unsaved input. A successful plan save must not close
  // this dialog (and so discard that draft) while this is true.
  const [hasUnsavedBlockDraft, setHasUnsavedBlockDraft] = useState(false);
  const [planSavedWhileDraftPending, setPlanSavedWhileDraftPending] = useState(false);

  const showActualSection = record != null || !isFuture;

  // §10 fix: for an editable date the *draft* status is always the source
  // of truth for "does work planning currently apply" — never the stale
  // saved status, which previously took precedence and left the block
  // editor visible even after the user switched the status buttons to a
  // non-work status without saving yet. For a past (non-editable) date
  // there is no draft, so fall back to whatever was actually saved.
  const currentStatus = editable ? draftStatus : (existingPlan?.plannedStatus ?? null);
  const allowsWorkPlanning = currentStatus != null && requiresCriterion(currentStatus);
  // Dormant PlannedTimeBlocks (stored under a since-changed non-work status)
  // are never shown as an *effective* section while editable — switching to
  // 연차/휴일 hides them immediately, even though they still exist in
  // storage untouched. The one exception is a legacy edge case: a past date
  // with no AttendancePlan at all but orphaned blocks somehow exist — shown
  // read-only rather than silently hidden.
  const showBlockSection = allowsWorkPlanning || (!editable && existingPlan == null && plannedBlocks.length > 0);

  // Collapsed one-line summary always reflects the *saved* plan (never an
  // unsaved draft) — plannedNetWorkMinutes is the headline number when the
  // saved status is work-producing and a target was actually configured;
  // otherwise fall back to the block total, still gated on the saved status
  // — a dormant total is never surfaced here either.
  const savedAllowsWorkPlanning = existingPlan != null && requiresCriterion(existingPlan.plannedStatus);
  const totalBlockMinutes = blockMinutesSum(plannedBlocks);
  const summaryStatusLabel = existingPlan ? STATUS_LABELS[existingPlan.plannedStatus] : "계획 없음";
  const summaryLine = (() => {
    if (!savedAllowsWorkPlanning) return `계획 · ${summaryStatusLabel}`;
    if (existingPlan?.plannedNetWorkMinutes != null) {
      return `계획 · ${summaryStatusLabel} · 총 ${formatHoursMinutes(existingPlan.plannedNetWorkMinutes)}`;
    }
    if (plannedBlocks.length > 0) {
      return `계획 · ${summaryStatusLabel} · 총 ${formatHoursMinutes(totalBlockMinutes)}`;
    }
    return `계획 · ${summaryStatusLabel}`;
  })();

  // §3 fix: a divider must appear only BETWEEN visible sections, never above
  // the first one — tracked positionally instead of hard-coding "the actual
  // section is always first", so this stays correct even if a future
  // section is inserted ahead of it.
  const actualIsFirst = showActualSection;

  // P1-B fix: a successful 계획 저장 only closes the dialog when there is no
  // meaningful unsaved block draft to lose — AttendancePlanSection only
  // calls onSaved after its own upsert has already resolved, so the plan
  // itself is always saved successfully either way; this only decides
  // whether the DIALOG closes on top of that.
  function handlePlanSaved(plan: AttendancePlanDto) {
    onPlanSaved(plan);
    if (hasUnsavedBlockDraft) {
      setPlanSavedWhileDraftPending(true);
    } else {
      onClose();
    }
  }

  return (
    <WorkLogModal titleId="date-detail-dialog-title" title={formatKoreanDateWithWeekday(date)} onClose={onClose} size="wide">
      <div className="flex flex-col gap-5">
        {showActualSection && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg-default">실제 기록</h3>
            <ActualRecordSummarySection record={record} isFuture={isFuture} onOpenDetail={() => onOpenWorkRecordDetail(date)} />
          </section>
        )}

        <section className={`flex flex-col gap-2 ${actualIsFirst ? "border-t border-border-default pt-4" : ""}`}>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-expanded={!collapsed}
            className={`flex w-full items-center gap-1.5 text-left ${FOCUS_VISIBLE}`}
          >
            {collapsed ? <ChevronRightIcon size={14} aria-hidden="true" /> : <ChevronDownIcon size={14} aria-hidden="true" />}
            {collapsed ? (
              <span className="text-sm text-fg-muted">{summaryLine}</span>
            ) : (
              <h3 className="text-sm font-semibold text-fg-default">계획</h3>
            )}
          </button>

          {!collapsed && (
            <div className="flex flex-col gap-4 pl-[22px]">
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold text-fg-muted">출결 계획</h4>
                <AttendancePlanSection
                  date={date}
                  existingPlan={existingPlan}
                  criteria={criteria}
                  editable={editable}
                  onSaved={handlePlanSaved}
                  onDeleted={onPlanDeleted}
                  onStatusChange={setDraftStatus}
                />
                {planSavedWhileDraftPending && (
                  <p className="text-xs text-fg-muted">계획이 저장되었습니다. 작성 중인 업무 블록이 있어 창을 닫지 않았습니다.</p>
                )}
              </div>

              {showBlockSection && (
                <div className="flex flex-col gap-2 border-t border-border-default pt-3">
                  <h4 className="text-xs font-semibold text-fg-muted">계획 업무</h4>
                  <PlannedWorkBlockEditor
                    date={date}
                    categories={categories}
                    blocks={plannedBlocks}
                    editable={editable && allowsWorkPlanning}
                    onBlockUpserted={onBlockUpserted}
                    onBlockDeleted={onBlockDeleted}
                    onDraftStateChange={setHasUnsavedBlockDraft}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </WorkLogModal>
  );
}
