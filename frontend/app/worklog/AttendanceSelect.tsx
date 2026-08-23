"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon } from "@primer/octicons-react";
import { FOCUS_VISIBLE } from "./format";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "./mockData";
import { ATTENDANCE_PRESENTATION } from "./attendancePresentation";

interface AttendanceSelectProps {
  value: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
  ariaLabel: string;
}

// Work Log-local attendance combobox. Uses roving DOM focus across real
// <button role="option"> elements (not aria-activedescendant) so each
// option's own :focus-visible ring "just works". v7: color comes from the
// strong status-colored text alone (no dot, matching AttendanceBadge) plus
// a neutral chevron — the trigger no longer looks like a filled input box,
// and the menu's selected state uses a neutral pale-blue highlight (never a
// per-status colored row) so color always comes from the text, not the row
// background.
export function AttendanceSelect({ value, onChange, ariaLabel }: AttendanceSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Partial<Record<AttendanceStatus, HTMLButtonElement>>>({});

  const current = ATTENDANCE_PRESENTATION[value];

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[value]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function closeAndFocusTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectOption(status: AttendanceStatus) {
    onChange(status);
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
        const next = ATTENDANCE_STATUSES[Math.min(index + 1, ATTENDANCE_STATUSES.length - 1)];
        optionRefs.current[next]?.focus();
        return;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = ATTENDANCE_STATUSES[Math.max(index - 1, 0)];
        optionRefs.current[prev]?.focus();
        return;
      }
      case "Home":
        e.preventDefault();
        optionRefs.current[ATTENDANCE_STATUSES[0]]?.focus();
        return;
      case "End":
        e.preventDefault();
        optionRefs.current[ATTENDANCE_STATUSES[ATTENDANCE_STATUSES.length - 1]]?.focus();
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        selectOption(ATTENDANCE_STATUSES[index]);
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 text-sm font-medium hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        <span style={{ color: current.strong }}>{value}</span>
        <ChevronDownIcon size={14} className="shrink-0 text-fg-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-md border border-border-default bg-surface-default py-1 shadow-sm"
        >
          {ATTENDANCE_STATUSES.map((status, index) => {
            const presentation = ATTENDANCE_PRESENTATION[status];
            const isSelected = status === value;
            return (
              <button
                key={status}
                ref={(el) => {
                  if (el) optionRefs.current[status] = el;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => selectOption(status)}
                onKeyDown={(e) => handleOptionKeyDown(e, index)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium outline-none hover:bg-canvas-subtle focus-visible:bg-canvas-subtle ${
                  isSelected ? "bg-primary-subtle" : ""
                }`}
              >
                <span className="flex-1" style={{ color: presentation.strong }}>
                  {status}
                </span>
                <CheckIcon size={14} className={`shrink-0 text-primary-fg ${isSelected ? "" : "invisible"}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
