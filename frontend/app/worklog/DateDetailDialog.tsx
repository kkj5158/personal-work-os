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

// Date Detail Dialog (§10-14/§19 attendance follow-up) — replaces the old
// narrow anchored Quick Plan Popover now that planned-work-block editing
// lives here too. Three domain sections: 실제 기록 (WorkRecord, always
// read-only from Attendance), 출결 계획 (AttendancePlan), 계획 업무
// (PlannedTimeBlock) — the latter two grouped under one collapsible "계획"
// section. Built from reusable, self-contained sub-components
// (ActualRecordSummarySection/AttendancePlanSection/PlannedWorkBlockEditor)
// with no Attendance-specific coupling baked into them, so a future Planning
// Calendar can compose the same pieces against the same canonical
// AttendancePlan/PlannedTimeBlock records — never a second, synchronized
// copy of either domain.
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
  // Tracks the live draft status from AttendancePlanSection so the block
  // editor's visibility and the collapsed summary line stay in sync without
  // waiting for a save.
  const [draftStatus, setDraftStatus] = useState<PlannableAttendanceStatus>(existingPlan?.plannedStatus ?? "WORK");

  const showActualSection = record != null || !isFuture;
  // For an editable (today/future) date with no saved plan yet, fall back to
  // the live draft status (defaults to WORK) so the block editor is visible
  // from the start, matching the old popover's behavior. For a past date
  // with no historical plan, never fabricate a status — only show the block
  // section if real historical PlannedTimeBlock rows actually exist.
  const effectiveStatus = existingPlan?.plannedStatus ?? (editable ? draftStatus : null);
  const showBlockEditor = (effectiveStatus != null && requiresCriterion(effectiveStatus)) || plannedBlocks.length > 0;

  const totalBlockMinutes = blockMinutesSum(plannedBlocks);
  const summaryStatusLabel = existingPlan ? STATUS_LABELS[existingPlan.plannedStatus] : "계획 없음";
  const summaryLine =
    existingPlan && requiresCriterion(existingPlan.plannedStatus) && plannedBlocks.length > 0
      ? `계획 · ${summaryStatusLabel} · 총 ${formatHoursMinutes(totalBlockMinutes)}`
      : `계획 · ${summaryStatusLabel}`;

  return (
    <WorkLogModal titleId="date-detail-dialog-title" title={formatKoreanDateWithWeekday(date)} onClose={onClose} size="medium">
      <div className="flex flex-col gap-5">
        {showActualSection && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg-default">실제 기록</h3>
            <ActualRecordSummarySection record={record} isFuture={isFuture} onOpenDetail={() => onOpenWorkRecordDetail(date)} />
          </section>
        )}

        <section className="flex flex-col gap-2 border-t border-border-default pt-4">
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
                  onSaved={onPlanSaved}
                  onDeleted={onPlanDeleted}
                  onStatusChange={setDraftStatus}
                />
              </div>

              {showBlockEditor && (
                <div className="flex flex-col gap-2 border-t border-border-default pt-3">
                  <h4 className="text-xs font-semibold text-fg-muted">계획 업무</h4>
                  <PlannedWorkBlockEditor
                    date={date}
                    categories={categories}
                    blocks={plannedBlocks}
                    editable={editable}
                    onBlockUpserted={onBlockUpserted}
                    onBlockDeleted={onBlockDeleted}
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
