"use client";

import { useState } from "react";
import { ClockIcon } from "@primer/octicons-react";
import { formatClockTime24Hour } from "./format";
import { validateClockTimeEdit } from "./selectors";

interface ClockTimeFieldProps {
  label: string;
  value: string | null;
  /** The *other* clock field's current value — used only for the "equal
   *  times are invalid" check (overnight, clockOut < clockIn, is fine). */
  otherValue: string | null;
  onConfirm: (next: string) => void;
  /** Accessible name for the underlying time control, e.g. "출근 시간 수정". */
  editButtonLabel: string;
  valueClassName?: string;
}

// Today Work's clock-time control (spec v4: direct-click editing, no
// pencil/inline-edit-row). The visible icon+"HH:mm" text is purely
// decorative and always shows our own locale-independent 24-hour format; a
// real `input[type=time]` sits invisibly on top of it (absolute, opacity-0)
// so a click lands on the native control and opens the picker immediately,
// keyboard focus/Enter/Space work natively, and the row's box never changes
// size — there is no second layout to switch into. The input is
// uncontrolled (`defaultValue`, not `value`) so React never fights the
// native widget mid-interaction; its `key` combines the last *committed*
// value with a reset counter so both a successful change (new value) and a
// rejected one (resetToken bump, value unchanged) force a remount back to
// the correct displayed time — otherwise a rejected edit would keep
// visually showing the user's invalid in-picker selection forever.
export function ClockTimeField({ label, value, otherValue, onConfirm, editButtonLabel, valueClassName = "" }: ClockTimeFieldProps) {
  const [error, setError] = useState<string | null>(null);
  // Bumped on a rejected edit to force the native input to remount (see the
  // `key` below) — `value` alone wouldn't change in that case (the parent
  // never applied the rejected edit), and an *uncontrolled* input has no
  // other way to be told "discard what you're showing and go back to
  // `defaultValue`."
  const [resetToken, setResetToken] = useState(0);

  function handleChange(next: string) {
    if (!next) return; // the browser cleared the field — ignore, keep the previous value
    const validationError = validateClockTimeEdit(next, otherValue);
    if (validationError) {
      setError(validationError);
      setResetToken((t) => t + 1);
      return;
    }
    setError(null);
    onConfirm(next);
  }

  function openPicker(target: HTMLInputElement) {
    if (typeof target.showPicker === "function") {
      try {
        target.showPicker();
      } catch {
        // Ignored — the input is already focused, which is enough to allow
        // keyboard/typed entry even where showPicker() is unsupported.
      }
    }
  }

  const isEditable = value != null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      <div
        className={`relative flex h-9 w-[86px] items-center gap-1.5 rounded-md px-1.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus-outline ${
          isEditable ? "hover:bg-canvas-subtle" : ""
        }`}
      >
        <span className={`pointer-events-none flex items-center gap-1 text-sm font-medium tabular-nums ${valueClassName}`}>
          <ClockIcon size={14} aria-hidden="true" />
          {formatClockTime24Hour(value)}
        </span>
        {isEditable && (
          <input
            key={`${value ?? "unset"}-${resetToken}`}
            type="time"
            step={60}
            defaultValue={value}
            aria-label={editButtonLabel}
            onChange={(e) => handleChange(e.target.value)}
            onClick={(e) => openPicker(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker(e.currentTarget);
              }
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        )}
      </div>
      {error && <span className="text-xs text-danger-fg">{error}</span>}
    </div>
  );
}
