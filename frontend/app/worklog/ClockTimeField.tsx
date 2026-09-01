"use client";

import { useState } from "react";
import { ClockIcon } from "@primer/octicons-react";
import { autoFormatTimeText } from "./TimeTextInput";
import { FOCUS_VISIBLE } from "./format";
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

// Today Work's clock-time control (post-production iteration 1, REQ-03):
// direct 24-hour HH:mm text entry, consistent with TimeTextInput elsewhere
// in Work Log — replaces the earlier native `input[type=time]` overlay.
// Local `draft` buffers in-progress typing so digits can accumulate/auto-
// format (autoFormatTimeText) before commit; only a value that passes
// validateClockTimeEdit is actually confirmed to the parent, on blur or
// Enter. An invalid or abandoned edit reverts the draft back to `value`
// rather than committing anything, so the parent's own state is never
// touched by a rejected edit.
export function ClockTimeField({ label, value, otherValue, onConfirm, editButtonLabel, valueClassName = "" }: ClockTimeFieldProps) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [syncedValue, setSyncedValue] = useState(value);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value ?? "");
    setError(null);
  }

  const isEditable = value != null;

  function commit() {
    if (draft === value) {
      setError(null);
      return;
    }
    const validationError = validateClockTimeEdit(draft, otherValue);
    if (validationError) {
      setError(validationError);
      setDraft(value ?? "");
      return;
    }
    setError(null);
    onConfirm(draft);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      {isEditable ? (
        <div
          className={`flex h-9 w-[86px] items-center gap-1 rounded-md border border-transparent px-1.5 hover:bg-canvas-subtle focus-within:border-primary-emphasis focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus-outline ${FOCUS_VISIBLE}`}
        >
          <ClockIcon size={14} className={`shrink-0 ${valueClassName}`} aria-hidden="true" />
          <input
            type="text"
            inputMode="numeric"
            placeholder="HH:mm"
            maxLength={5}
            value={draft}
            aria-label={editButtonLabel}
            aria-invalid={!!error}
            onChange={(e) => setDraft(autoFormatTimeText(e.target.value))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className={`h-full w-full min-w-0 bg-transparent text-sm font-medium tabular-nums focus:outline-none ${valueClassName}`}
          />
        </div>
      ) : (
        <span className="flex h-9 w-[86px] items-center gap-1.5 px-1.5 text-sm font-medium tabular-nums text-fg-muted">
          <ClockIcon size={14} aria-hidden="true" />–
        </span>
      )}
      {error && <span className="text-xs text-danger-fg">{error}</span>}
    </div>
  );
}
