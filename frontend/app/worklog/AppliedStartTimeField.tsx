"use client";

import { useId, useState } from "react";
import { FOCUS_VISIBLE, parseTimeOfDayMinutes } from "./format";
import type { AppliedStartTime, StartTimeCriterion } from "./startTimeCriterion";

interface AppliedStartTimeFieldProps {
  value: AppliedStartTime | null;
  onChange: (next: AppliedStartTime | null) => void;
  /** Full reusable-criteria list (active and inactive) — needed to detect
   *  whether a stored criterion snapshot still matches its live criterion,
   *  not just to list new-selection choices. */
  criteria: StartTimeCriterion[];
  /** Reports whether the current selection would produce a persistable
   *  value — false only while 직접 입력 is selected and its time is
   *  missing/invalid. Callers with an explicit save step (the record-detail
   *  modal) use this to block 저장; TodayWorkPanel's immediate-update model
   *  has no save step and can ignore it. */
  onValidityChange?: (valid: boolean) => void;
  /** Renders a small visible text label before the select, matching
   *  TodayWorkPanel's inline-labeled controls. Off by default for the
   *  record-detail modal, whose surrounding Field wrapper already renders a
   *  visible label — this field's aria-label still provides the real
   *  accessible name there, matching that modal's existing double-labeling
   *  convention for every other edit-mode control. */
  showLabel?: boolean;
}

const UNSET_VALUE = "unset";
const CUSTOM_VALUE = "custom";
const CRITERION_PREFIX = "criterion:";
const PRESERVED_PREFIX = "preserved:";

function isCustomSnapshot(value: AppliedStartTime | null): boolean {
  return value?.source === "custom";
}

// True when a criterion-sourced snapshot still exactly matches its live
// reusable criterion (active, same name, same time) — selecting that same
// criterion again from the active list would reproduce an identical
// snapshot. False for a now-inactive or since-edited criterion, in which
// case the stored snapshot must be shown as a distinct preserved/historical
// option instead of silently following the current criterion (spec §4).
function isSnapshotCurrent(
  value: Extract<AppliedStartTime, { source: "criterion" }>,
  criteria: StartTimeCriterion[],
): boolean {
  const match = criteria.find((c) => c.id === value.criterionId);
  return !!match && match.active && match.name === value.criterionName && match.startTime === value.startTime;
}

// Record-level 출근 기준 selector shared by TodayWorkPanel and
// WorkLogRecordDetailModal's edit mode (spec: avoid duplicating snapshot
// creation, active-criteria listing, and historical/inactive preservation
// logic between the two). Fully controlled by `value`/`onChange` — the
// stored AppliedStartTime snapshot is always the source of truth for what's
// "currently applied"; this component never derives lateness itself and
// never looks up a live criterion to decide what's selected, only to decide
// whether the *display* should distinguish a preserved snapshot from a
// current one, and to build a brand-new snapshot on an explicit reselect.
export function AppliedStartTimeField({ value, onChange, criteria, onValidityChange, showLabel = false }: AppliedStartTimeFieldProps) {
  const selectId = useId();
  const customInputId = useId();

  const [customEntryActive, setCustomEntryActive] = useState(() => isCustomSnapshot(value));
  const [customText, setCustomText] = useState(() => (value?.source === "custom" ? value.startTime : ""));

  // Distinguishes an external value change (e.g. the same date's record was
  // edited elsewhere — Today vs. the detail modal — and this instance must
  // pick it up) from this field's own onChange, which updates `value` one
  // render later through the caller. Without this guard, the resync check
  // below would immediately stomp a just-made local selection (e.g.
  // switching to 직접 입력, which emits `null` before any digit is typed).
  // State (not a ref) so the comparison/update stays inside React's
  // supported "adjust state during render" pattern — refs may not be read
  // or written during render.
  const [lastEmittedKey, setLastEmittedKey] = useState(() => JSON.stringify(value));
  const currentValueKey = JSON.stringify(value);
  if (currentValueKey !== lastEmittedKey) {
    setLastEmittedKey(currentValueKey);
    setCustomEntryActive(isCustomSnapshot(value));
    setCustomText(value?.source === "custom" ? value.startTime : "");
  }

  const activeCriteria = criteria.filter((c) => c.active);

  let preserved: { criterionId: string; criterionName: string; startTime: string; suffix: string } | null = null;
  if (value?.source === "criterion" && !isSnapshotCurrent(value, criteria)) {
    const match = criteria.find((c) => c.id === value.criterionId);
    preserved = {
      criterionId: value.criterionId,
      criterionName: value.criterionName,
      startTime: value.startTime,
      suffix: match?.active ? "기록 당시" : "사용 안 함",
    };
  }

  const selectValue = customEntryActive
    ? CUSTOM_VALUE
    : value == null
      ? UNSET_VALUE
      : value.source === "custom"
        ? CUSTOM_VALUE
        : preserved
          ? `${PRESERVED_PREFIX}${value.criterionId}`
          : `${CRITERION_PREFIX}${value.criterionId}`;

  const customMinutes = parseTimeOfDayMinutes(customText);
  const customError = customEntryActive && customMinutes == null ? "시간을 HH:MM 형식으로 입력해 주세요." : null;

  function emit(next: AppliedStartTime | null, valid: boolean) {
    setLastEmittedKey(JSON.stringify(next));
    onChange(next);
    onValidityChange?.(valid);
  }

  function handleSelectChange(next: string) {
    if (next === UNSET_VALUE) {
      setCustomEntryActive(false);
      emit(null, true);
      return;
    }
    if (next === CUSTOM_VALUE) {
      setCustomEntryActive(true);
      setCustomText("");
      // Switching into 직접 입력 must stop showing the previous criterion
      // as applied (spec §7) — the record temporarily has no applied start
      // time until a valid custom value is typed.
      emit(null, false);
      return;
    }
    if (next.startsWith(CRITERION_PREFIX)) {
      const id = next.slice(CRITERION_PREFIX.length);
      const criterion = activeCriteria.find((c) => c.id === id);
      if (!criterion) return;
      setCustomEntryActive(false);
      emit({ source: "criterion", criterionId: criterion.id, criterionName: criterion.name, startTime: criterion.startTime }, true);
      return;
    }
    // "preserved:*" is already the current selection — a native <select>
    // never fires onChange for reselecting its own current value, so this
    // is unreachable in practice; no-op defensively rather than guessing.
  }

  function handleCustomTextChange(text: string) {
    setCustomText(text);
    const minutes = parseTimeOfDayMinutes(text);
    if (minutes == null) {
      emit(null, false);
      return;
    }
    emit({ source: "custom", criterionId: null, criterionName: null, startTime: text }, true);
  }

  return (
    <div className="flex flex-col gap-1">
      {showLabel && (
        <label htmlFor={selectId} className="text-xs text-fg-muted">
          출근 기준
        </label>
      )}
      <select
        id={selectId}
        aria-label="출근 기준"
        value={selectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
        className={`rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
      >
        <option value={UNSET_VALUE}>미설정</option>
        {preserved && (
          <option value={`${PRESERVED_PREFIX}${preserved.criterionId}`}>
            {preserved.criterionName} · {preserved.startTime} ({preserved.suffix})
          </option>
        )}
        {activeCriteria.map((c) => (
          <option key={c.id} value={`${CRITERION_PREFIX}${c.id}`}>
            {c.name} · {c.startTime}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>직접 입력</option>
      </select>

      {customEntryActive && (
        <div className="flex flex-col gap-1">
          <input
            type="text"
            aria-label="직접 입력 시간"
            placeholder="예: 09:00"
            value={customText}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            aria-invalid={!!customError}
            aria-describedby={customError ? `${customInputId}-error` : undefined}
            className={`w-28 rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
          {customError && (
            <span id={`${customInputId}-error`} className="text-xs text-danger-fg">
              {customError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
