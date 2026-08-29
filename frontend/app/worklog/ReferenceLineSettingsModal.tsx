"use client";

import { useState } from "react";
import { CheckIcon, TrashIcon } from "@primer/octicons-react";
import {
  createWorkChartReferenceLine,
  deleteWorkChartReferenceLine,
  updateWorkChartReferenceLine,
} from "@/lib/api/workChartReferenceLines";
import type { WorkChartReferenceLineColor, WorkChartReferenceLineDto, WorkChartReferenceLineScope } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE, formatHoursMinutes, parseHoursMinutes } from "./format";
import {
  MAX_REFERENCE_LINES_PER_SCOPE,
  REFERENCE_LINE_COLORS,
  REFERENCE_LINE_LABEL_MAX_LENGTH,
  isTimeScope,
  linesForScope,
  referenceLineColorLabel,
  referenceLineColorVar,
} from "./referenceLine";
import { WorkLogModal } from "./WorkLogModal";

const TITLE_ID = "worklog-reference-line-settings-title";
const DEFAULT_TIME_VALUE = 480; // 08:00
const DEFAULT_SCORE_VALUE = 80;

interface ReferenceLineSettingsModalProps {
  title: string;
  timeScope: WorkChartReferenceLineScope;
  scoreScope: WorkChartReferenceLineScope;
  timeSectionTitle: string;
  scoreSectionTitle: string;
  lines: WorkChartReferenceLineDto[];
  /** Re-fetches the full reference-line list after any mutation — delete
   *  re-numbers sibling positions server-side, and the dataset is tiny (at
   *  most 12 rows total), so a full reload after every action is simpler
   *  and safer than trying to reconcile positions locally. */
  onReload: () => Promise<void>;
  onClose: () => void;
}

// Generalizes the old single-goal WorkChartTargetModal into the "기준선
// 설정" reference-line system (post-production iteration 1, batch 2) — one
// shell manages a chart section's time scope and score scope together
// (Daily Work: DAILY_TIME/DAILY_SCORE; Work Trend: WEEKLY_TIME/WEEKLY_SCORE).
// Every action persists immediately (create/rename/recolor/delete), matching
// CategoryManagementModal's established pattern for this route rather than a
// deferred draft-then-save step, since each line is independently valid and
// simple to persist one call at a time.
export function ReferenceLineSettingsModal({
  title,
  timeScope,
  scoreScope,
  timeSectionTitle,
  scoreSectionTitle,
  lines,
  onReload,
  onClose,
}: ReferenceLineSettingsModalProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title={title}
      onClose={onClose}
      size="default"
      footer={
        <div className="ml-auto">
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            닫기
          </button>
        </div>
      }
    >
      {error && <p className="mb-4 text-sm text-danger-fg">{error}</p>}
      <div className="flex flex-col gap-6">
        <ReferenceLineScopeSection
          scope={timeScope}
          sectionTitle={timeSectionTitle}
          lines={linesForScope(lines, timeScope)}
          onReload={onReload}
          onError={setError}
        />
        <div className="border-t border-border-default" />
        <ReferenceLineScopeSection
          scope={scoreScope}
          sectionTitle={scoreSectionTitle}
          lines={linesForScope(lines, scoreScope)}
          onReload={onReload}
          onError={setError}
        />
      </div>
    </WorkLogModal>
  );
}

interface ReferenceLineScopeSectionProps {
  scope: WorkChartReferenceLineScope;
  sectionTitle: string;
  lines: WorkChartReferenceLineDto[];
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}

function ReferenceLineScopeSection({ scope, sectionTitle, lines, onReload, onError }: ReferenceLineScopeSectionProps) {
  const [pending, setPending] = useState(false);
  const timeMode = isTimeScope(scope);
  const atMax = lines.length >= MAX_REFERENCE_LINES_PER_SCOPE;

  async function handleAdd() {
    onError(null);
    setPending(true);
    try {
      await createWorkChartReferenceLine({
        scope,
        label: "새 기준선",
        value: timeMode ? DEFAULT_TIME_VALUE : DEFAULT_SCORE_VALUE,
        color: "GRAY",
      });
      await onReload();
    } catch (e) {
      onError(describeApiError(e, "기준선을 추가하지 못했습니다."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg-default">
          {sectionTitle} <span className="font-normal text-fg-muted">({lines.length}/{MAX_REFERENCE_LINES_PER_SCOPE})</span>
        </h3>
      </div>

      {lines.length === 0 && <p className="text-sm text-fg-muted">설정된 기준선이 없습니다.</p>}

      <div className="flex flex-col gap-2">
        {lines.map((line, index) => (
          <ReferenceLineCard
            key={line.id}
            index={index}
            line={line}
            timeMode={timeMode}
            onReload={onReload}
            onError={onError}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={pending || atMax}
        title={atMax ? `기준선은 최대 ${MAX_REFERENCE_LINES_PER_SCOPE}개까지 추가할 수 있습니다.` : undefined}
        className={`flex h-9 w-fit items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_VISIBLE}`}
      >
        + 기준선 추가
      </button>
    </div>
  );
}

interface ReferenceLineCardProps {
  index: number;
  line: WorkChartReferenceLineDto;
  timeMode: boolean;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}

function ReferenceLineCard({ index, line, timeMode, onReload, onError }: ReferenceLineCardProps) {
  const [labelDraft, setLabelDraft] = useState(line.label);
  const [valueDraft, setValueDraft] = useState(timeMode ? formatHoursMinutes(line.value) : String(line.value));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDirty = labelDraft !== line.label || valueDraft !== (timeMode ? formatHoursMinutes(line.value) : String(line.value));

  async function commit(color?: WorkChartReferenceLineColor) {
    const trimmedLabel = labelDraft.trim();
    if (trimmedLabel === "") {
      onError("라벨을 입력해 주세요.");
      return;
    }
    if (trimmedLabel.length > REFERENCE_LINE_LABEL_MAX_LENGTH) {
      onError(`라벨은 ${REFERENCE_LINE_LABEL_MAX_LENGTH}자 이내로 입력해 주세요.`);
      return;
    }
    const parsedValue = timeMode ? parseHoursMinutes(valueDraft) : Number(valueDraft);
    if (parsedValue == null || Number.isNaN(parsedValue)) {
      onError(timeMode ? "값을 HH:MM 형식으로 입력해 주세요 (예: 08:00)." : "값을 숫자로 입력해 주세요.");
      return;
    }

    onError(null);
    setSaving(true);
    try {
      await updateWorkChartReferenceLine(line.id, {
        label: trimmedLabel,
        value: parsedValue,
        color: color ?? line.color,
      });
      await onReload();
    } catch (e) {
      onError(describeApiError(e, "기준선을 저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    onError(null);
    setDeleting(true);
    try {
      await deleteWorkChartReferenceLine(line.id);
      await onReload();
    } catch (e) {
      onError(describeApiError(e, "기준선을 삭제하지 못했습니다."));
    } finally {
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-default p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">기준선 {index + 1}</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          aria-label={`${line.label} 기준선 삭제`}
          className={`rounded p-1 text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_VISIBLE}`}
        >
          <TrashIcon size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-[48px_1fr] items-center gap-x-3 gap-y-2">
        <label className="text-xs text-fg-muted">라벨</label>
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => isDirty && commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          maxLength={REFERENCE_LINE_LABEL_MAX_LENGTH}
          disabled={busy}
          className={`h-8 rounded-md border border-control-border bg-control-bg px-2 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
        />

        <label className="text-xs text-fg-muted">값</label>
        <input
          type="text"
          inputMode={timeMode ? "numeric" : "decimal"}
          value={valueDraft}
          onChange={(e) => setValueDraft(e.target.value)}
          onBlur={() => isDirty && commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          placeholder={timeMode ? "08:00" : "80"}
          disabled={busy}
          className={`h-8 w-28 rounded-md border border-control-border bg-control-bg px-2 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
        />

        <label className="text-xs text-fg-muted">색상</label>
        <div className="flex items-center gap-1.5">
          {REFERENCE_LINE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => commit(color)}
              disabled={busy}
              aria-label={referenceLineColorLabel(color)}
              aria-pressed={line.color === color}
              title={referenceLineColorLabel(color)}
              className={`h-5 w-5 rounded-full disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_VISIBLE} ${
                line.color === color ? "ring-2 ring-offset-1 ring-primary-emphasis" : ""
              }`}
              style={{ backgroundColor: referenceLineColorVar(color) }}
            >
              {line.color === color && <CheckIcon size={12} className="mx-auto text-white" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
