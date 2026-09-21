"use client";

import { Check, X, Minus } from "lucide-react";
import type { ChecklistResult } from "@/lib/api/types";
import { nextChecklistResult } from "./checklistLogic";
import { FOCUS_VISIBLE } from "./format";

interface ChecklistResultControlProps {
  result: ChecklistResult;
  onChange: (result: ChecklistResult) => void;
  /** Base label for the two buttons' aria-labels, e.g. an item name. */
  label: string;
  /** "sm" for dense Week/Month table cells; "md" for the roomier Day feed. */
  size?: "sm" | "md";
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}

// Compact PASS(O)/FAIL(X) two-action control shared by Day/Week/Month — same
// UNSET<->PASS<->FAIL semantics everywhere (nextChecklistResult), only the
// button size differs by surface. Pressing the already-selected action
// clears it back to UNSET; the other action always switches directly.
export function ChecklistResultControl({ result, onChange, label, size = "md", selected, onSelect, disabled }: ChecklistResultControlProps) {
  const dimension = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <fieldset disabled={disabled} className="inline-flex items-center gap-1 disabled:opacity-60">
      {onSelect && <input type="checkbox" checked={selected ?? false} onChange={onSelect} aria-label={`${label} 일괄 선택`} />}
      <button
        type="button"
        onClick={() => onChange(nextChecklistResult(result, "PASS"))}
        aria-pressed={result === "PASS"}
        aria-label={`${label} 완료(O)`}
        className={`flex items-center justify-center rounded border ${dimension} ${FOCUS_VISIBLE} ${
          result === "PASS" ? "border-success-fg bg-success-fg/15 text-success-fg" : "border-control-border text-fg-muted hover:bg-canvas-subtle"
        }`}
      >
        <Check size={iconSize} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={() => onChange(nextChecklistResult(result, "FAIL"))}
        aria-pressed={result === "FAIL"}
        aria-label={`${label} 미달성(X)`}
        className={`flex items-center justify-center rounded border ${dimension} ${FOCUS_VISIBLE} ${
          result === "FAIL" ? "border-danger-fg bg-danger-fg/15 text-danger-fg" : "border-control-border text-fg-muted hover:bg-canvas-subtle"
        }`}
      >
        <X size={iconSize} strokeWidth={2.5} />
      </button>
      <button type="button" onClick={() => onChange(nextChecklistResult(result, "UNRECORDED"))}
        aria-pressed={result === "UNRECORDED"} aria-label={`${label} 기록 못함`} title="기록 못함 · 실패 통계에서 제외"
        className={`flex items-center justify-center rounded border ${dimension} ${FOCUS_VISIBLE} ${result === "UNRECORDED" ? "border-accent-fg bg-accent-fg/15 text-accent-fg" : "border-control-border text-fg-muted hover:bg-canvas-subtle"}`}>
        <Minus size={iconSize} />
      </button>
    </fieldset>
  );
}
