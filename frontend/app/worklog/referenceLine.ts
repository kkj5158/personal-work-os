import type { WorkChartReferenceLineColor, WorkChartReferenceLineDto, WorkChartReferenceLineScope } from "@/lib/api/types";
import { formatHoursMinutes } from "./format";

// Shared metadata for the "기준선 설정" reference-line system (post-
// production iteration 1, batch 2) — kept independent of any one chart
// component since Daily Work and Work Trend both render lines from the
// same backend scopes. See docs/backend/work-chart-reference-lines.md.

export const MAX_REFERENCE_LINES_PER_SCOPE = 3;
export const REFERENCE_LINE_LABEL_MAX_LENGTH = 20;

/** Fixed, restrained palette — never a free-form color picker. Each token
 *  maps to an existing Personal Work OS chart/semantic CSS variable so a
 *  reference line always reads as part of the same visual system as the
 *  data series it sits alongside. */
export const REFERENCE_LINE_COLORS: WorkChartReferenceLineColor[] = ["BLUE", "GREEN", "AMBER", "RED", "CYAN", "GRAY"];

export function referenceLineColorVar(color: WorkChartReferenceLineColor): string {
  switch (color) {
    case "BLUE":
      return "var(--primary-emphasis)";
    case "GREEN":
      return "var(--success-emphasis)";
    case "AMBER":
      return "var(--warning-emphasis)";
    case "RED":
      return "var(--danger-emphasis)";
    case "CYAN":
      return "var(--chart-score-emphasis)";
    case "GRAY":
      return "var(--fg-muted)";
  }
}

export function referenceLineColorLabel(color: WorkChartReferenceLineColor): string {
  switch (color) {
    case "BLUE":
      return "파랑";
    case "GREEN":
      return "초록";
    case "AMBER":
      return "주황";
    case "RED":
      return "빨강";
    case "CYAN":
      return "청록";
    case "GRAY":
      return "회색";
  }
}

export function isTimeScope(scope: WorkChartReferenceLineScope): boolean {
  return scope === "DAILY_TIME" || scope === "WEEKLY_TIME";
}

export function formatReferenceLineValue(scope: WorkChartReferenceLineScope, value: number): string {
  return isTimeScope(scope) ? formatHoursMinutes(value) : `${value}점`;
}

export function linesForScope(lines: WorkChartReferenceLineDto[], scope: WorkChartReferenceLineScope): WorkChartReferenceLineDto[] {
  return lines.filter((l) => l.scope === scope).sort((a, b) => a.position - b.position);
}
