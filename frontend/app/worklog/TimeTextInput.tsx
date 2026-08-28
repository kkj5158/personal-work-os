"use client";

import { useState } from "react";
import { ClockIcon } from "@primer/octicons-react";
import { FOCUS_VISIBLE, parseTimeOfDayMinutes } from "./format";

interface TimeTextInputProps {
  /** "" or a well-formed "HH:mm" — same contract as the old native-picker TimeInput. */
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  autoFocus?: boolean;
}

// Strips everything but digits, keeps at most 4, and auto-inserts the colon
// once 2+ digits are present — "1457" types as "1" -> "14" -> "14:5" ->
// "14:57" without the user ever typing a colon themselves. Backspacing
// re-derives the same way from whatever digits remain, so deleting the "7"
// in "14:57" cleanly yields "14:5" -> "14:".
export function autoFormatTimeText(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// Reusable direct 24-hour HH:mm text input (post-production iteration 1,
// REQ-03) — replaces the native `input[type=time]`-based TimeInput as the
// primary way to edit check-in/check-out and other Work Log time fields.
// Generalizes the free-text pattern StartTimeCriteriaModal already used for
// its own start-time column. Validation is strict (parseTimeOfDayMinutes,
// format.ts) and only surfaced on blur — the field stays permissive while
// the user is mid-keystroke, matching the ergonomic-normalization
// requirement without being a fussy, over-clever masked input.
export function TimeTextInput({
  value,
  onChange,
  "aria-label": ariaLabel,
  id,
  invalid = false,
  describedBy,
  className = "",
  autoFocus = false,
}: TimeTextInputProps) {
  const [blurInvalid, setBlurInvalid] = useState(false);

  function handleChange(next: string) {
    const formatted = autoFormatTimeText(next);
    setBlurInvalid(false);
    onChange(formatted);
  }

  function handleBlur() {
    if (value !== "" && parseTimeOfDayMinutes(value) === null) {
      setBlurInvalid(true);
    }
  }

  const showInvalid = invalid || blurInvalid;

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex h-9 items-center gap-1.5 rounded-md border bg-control-bg px-2.5 focus-within:border-primary-emphasis focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus-outline ${
          showInvalid ? "border-danger-fg" : "border-control-border"
        } ${className}`}
      >
        <ClockIcon size={14} className="shrink-0 text-fg-muted" aria-hidden="true" />
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="HH:mm"
          maxLength={5}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          aria-label={ariaLabel}
          aria-invalid={showInvalid}
          aria-describedby={describedBy}
          autoFocus={autoFocus}
          className={`h-full w-full min-w-0 bg-transparent text-sm tabular-nums text-fg-default focus:outline-none ${FOCUS_VISIBLE}`}
        />
      </div>
      {blurInvalid && <span className="text-xs text-danger-fg">시간 형식이 올바르지 않습니다 (예: 09:30).</span>}
    </div>
  );
}
