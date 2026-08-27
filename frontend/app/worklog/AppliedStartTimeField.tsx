"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon, ClockIcon } from "@primer/octicons-react";
import { FOCUS_VISIBLE } from "./format";
import { isActiveCriterionSnapshot, type AppliedStartTime, type StartTimeCriterion } from "./startTimeCriterion";

interface AppliedStartTimeFieldProps {
  value: AppliedStartTime | null;
  onChange: (next: AppliedStartTime | null) => void;
  criteria: StartTimeCriterion[];
  showLabel?: boolean;
}

// Record-level 출근 기준 selector shared by TodayWorkPanel and the unified
// record-edit modal. v6 visual-polish unit: rebuilt as a lightweight
// text-style listbox (same roving-focus pattern as AttendanceSelect)
// instead of a native <select> with a filled gray input appearance — the
// underlying policy is untouched: active saved criteria only, no 미설정, no
// 직접 입력, no historical option, no auto-assignment. `출근 기준 선택`/
// `등록된 출근 기준 없음` are non-selectable trigger placeholders, not menu
// options.
export function AppliedStartTimeField({ value, onChange, criteria, showLabel = false }: AppliedStartTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement>>({});

  const activeCriteria = criteria.filter((c) => c.active);
  const hasCurrentCriterion = isActiveCriterionSnapshot(value, criteria);
  const currentCriterionId = value?.criterionId ?? null;
  const current = hasCurrentCriterion ? (activeCriteria.find((c) => c.id === currentCriterionId) ?? null) : null;
  const placeholderLabel = activeCriteria.length === 0 ? "등록된 출근 기준 없음" : "출근 기준 선택";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const targetId = current?.id ?? activeCriteria[0]?.id;
    if (targetId) optionRefs.current[targetId]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function closeAndFocusTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectCriterion(criterion: StartTimeCriterion) {
    onChange({ criterionId: criterion.id, criterionName: criterion.name, startTime: criterion.startTime });
    closeAndFocusTrigger();
  }

  function handleOptionKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeAndFocusTrigger();
        return;
      case "ArrowDown": {
        e.preventDefault();
        const next = activeCriteria[Math.min(index + 1, activeCriteria.length - 1)];
        optionRefs.current[next.id]?.focus();
        return;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = activeCriteria[Math.max(index - 1, 0)];
        optionRefs.current[prev.id]?.focus();
        return;
      }
      case "Home":
        e.preventDefault();
        optionRefs.current[activeCriteria[0]?.id]?.focus();
        return;
      case "End":
        e.preventDefault();
        optionRefs.current[activeCriteria[activeCriteria.length - 1]?.id]?.focus();
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        selectCriterion(activeCriteria[index]);
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {showLabel && <span className="text-xs text-fg-muted">출근 기준</span>}
      <div ref={containerRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="출근 기준"
          disabled={activeCriteria.length === 0}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={`flex h-8 min-w-[168px] items-center gap-1.5 whitespace-nowrap rounded-md border border-border-default px-2 text-sm hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${FOCUS_VISIBLE}`}
        >
          <ClockIcon size={14} className="shrink-0 text-fg-muted" aria-hidden="true" />
          {current ? (
            <span className="flex flex-1 items-center gap-1 font-medium text-fg-default">
              <span className="truncate">{current.name}</span>
              <span className="text-fg-muted" aria-hidden="true">
                ·
              </span>
              <span className="tabular-nums text-fg-muted">{current.startTime}</span>
            </span>
          ) : (
            <span className="flex-1 text-left text-fg-muted">{placeholderLabel}</span>
          )}
          <ChevronDownIcon size={14} className="shrink-0 text-fg-muted" aria-hidden="true" />
        </button>

        {open && activeCriteria.length > 0 && (
          <div
            role="listbox"
            aria-label="출근 기준"
            className="absolute left-0 top-full z-10 mt-1 max-h-60 w-full min-w-[168px] overflow-y-auto rounded-md border border-border-default bg-surface-default py-1 shadow-sm"
          >
            {activeCriteria.map((criterion, index) => {
              const isSelected = criterion.id === current?.id;
              return (
                <button
                  key={criterion.id}
                  ref={(el) => {
                    if (el) optionRefs.current[criterion.id] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => selectCriterion(criterion)}
                  onKeyDown={(e) => handleOptionKeyDown(e, index)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none hover:bg-canvas-subtle focus-visible:bg-canvas-subtle ${
                    isSelected ? "bg-primary-subtle" : ""
                  }`}
                >
                  <CheckIcon size={14} className={`shrink-0 text-primary-fg ${isSelected ? "" : "invisible"}`} aria-hidden="true" />
                  <span className="flex-1 truncate text-fg-default">{criterion.name}</span>
                  <span className="tabular-nums text-xs text-fg-muted">{criterion.startTime}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
