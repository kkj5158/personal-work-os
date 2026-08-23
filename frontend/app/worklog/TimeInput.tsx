"use client";

import { useRef } from "react";
import { ClockIcon } from "@primer/octicons-react";

interface TimeInputProps {
  value: string; // "HH:mm", 24-hour, or "" for empty
  onChange: (value: string) => void;
  "aria-label": string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  autoFocus?: boolean;
}

// Reusable Work Log time control (v3 UI polish batch §3): a native
// `input[type=time]` is the foundation — 1-minute precision (`step=60`),
// `HH:mm`, keyboard entry, and the browser's own time picker all come for
// free from the platform, no calendar/picker package needed. Only the
// surrounding chrome (clock icon, height, focus ring, label wiring) is
// custom. `showPicker()` is invoked on click where the browser supports it
// (progressive enhancement) — clicking anywhere still focuses the native
// input and lets keyboard/typing work even where `showPicker` is absent
// (e.g. it's optional per the HTML spec).
export function TimeInput({
  value,
  onChange,
  "aria-label": ariaLabel,
  id,
  invalid = false,
  describedBy,
  className = "",
  autoFocus = false,
}: TimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleContainerClick() {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // showPicker() is not implemented by every browser (Safari desktop, at
    // this writing) — the try/catch keeps this purely additive, never
    // blocking normal typed entry when it's unavailable or throws.
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch {
        // Ignored — the input is already focused, which is enough.
      }
    }
  }

  return (
    <div
      onClick={handleContainerClick}
      className={`flex h-9 items-center gap-1.5 rounded-md border bg-control-bg px-2.5 focus-within:border-primary-emphasis focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus-outline ${
        invalid ? "border-danger-fg" : "border-control-border"
      } ${className}`}
    >
      <ClockIcon size={14} className="shrink-0 text-fg-muted" aria-hidden="true" />
      <input
        ref={inputRef}
        id={id}
        type="time"
        step={60}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        className="h-full w-full min-w-0 bg-transparent text-sm tabular-nums text-fg-default focus:outline-none [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
    </div>
  );
}
