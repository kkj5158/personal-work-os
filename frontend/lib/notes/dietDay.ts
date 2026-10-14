// Client view of the DIET SYS -> NOTE SYS projection block (backend diet.DietNoteProjection, v1).
// The block is a read-only snapshot; DIET SYS / CHECKLIST SYS / the Diet Daily Note stay canonical.
export type DietDayPayload = {
  v: number;
  date: string;
  measurements: Record<string, number | string>;
  /** Latest recorded morning weight on or before the date (absent in blocks projected before it existed). */
  currentWeight: { value: number; date: string } | null;
  checklist: { total: number; success: number; failure: number; unrecorded: number; items: { title: string; importance: string; state: string }[] };
  note: string;
  focus: { title: string; role: string; startDate: string; endDate: string; keyPoint?: string; status?: string }[];
};

export function parseDietDay(payload: string): DietDayPayload | null {
  try {
    const value = JSON.parse(payload) as Partial<DietDayPayload>;
    if (value?.v !== 1 || typeof value.date !== "string") return null;
    const current = value.currentWeight;
    return {
      v: 1,
      date: value.date,
      measurements: value.measurements ?? {},
      currentWeight: current && typeof current.value === "number" && typeof current.date === "string" ? current : null,
      checklist: value.checklist ?? { total: 0, success: 0, failure: 0, unrecorded: 0, items: [] },
      note: typeof value.note === "string" ? value.note : "",
      focus: Array.isArray(value.focus) ? value.focus : [],
    };
  } catch {
    return null;
  }
}

export const FOCUS_ROLES = [["CURRENT_FOCUS", "CURRENT FOCUS"], ["NEXT_FOCUS", "NEXT FOCUS"], ["FINAL_GOAL", "FINAL GOAL"]] as const;
export const CHECK_STATE_LABELS: Record<string, string> = { SUCCESS: "성공", FAILURE: "실패", UNRECORDED: "기록 못함", MISSING: "미입력" };

export type MeasurementCell = { value: string; state: "recorded" | "missing" | "unsupported" };
export type MeasurementRow = {
  slot: "MORNING" | "BEFORE_SLEEP";
  label: string;
  weight: MeasurementCell;
  glucose: MeasurementCell;
  bloodKetone: MeasurementCell;
  breathKetone: MeasurementCell;
  measuredAt: { dateTime: string; label: string } | null;
};

const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? String(Number(value.toFixed(2))) : "—";
const measurement = (value: unknown): MeasurementCell => ({ value: number(value), state: typeof value === "number" && Number.isFinite(value) ? "recorded" : "missing" });
// The projection currently supplies one timestamp per slot, not per metric.
// Keep it as slot context instead of implying every metric has its own timestamp.
const time = (value: unknown, date: string): MeasurementRow["measuredAt"] => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const clock = value.slice(11, 16);
  return { dateTime: value, label: value.startsWith(`${date}T`) ? clock : `${value.slice(0, 10)} ${clock}` };
};

/**
 * One row per canonical slot. Weight exists only in MORNING: a missing morning
 * value is distinct from the unsupported BEFORE_SLEEP cell, never carried forward.
 */
export function dietDayView(day: DietDayPayload) {
  const m = day.measurements;
  const measurements: MeasurementRow[] = [
    { slot: "MORNING", label: "아침", weight: measurement(m.morningWeight), glucose: measurement(m.morningGlucose), bloodKetone: measurement(m.morningBloodKetone), breathKetone: measurement(m.morningBreathKetone), measuredAt: time(m.morningMeasuredAt, day.date) },
    { slot: "BEFORE_SLEEP", label: "취침 전", weight: { value: "해당 없음", state: "unsupported" }, glucose: measurement(m.bedtimeGlucose), bloodKetone: measurement(m.bedtimeBloodKetone), breathKetone: measurement(m.bedtimeBreathKetone), measuredAt: time(m.bedtimeMeasuredAt, day.date) },
  ];
  const focus = FOCUS_ROLES.map(([role, label]) => ({ role, label, entries: day.focus.filter(f => f.role === role) }));
  const c = day.checklist;
  const checklistSummary = c.total ? `성공 ${c.success} / ${c.total}${c.failure ? ` · 실패 ${c.failure}` : ""}${c.unrecorded ? ` · 기록 못함 ${c.unrecorded}` : ""}` : "";
  const checklist = c.items.map(item => ({ importance: item.importance, title: item.title, state: item.state, label: CHECK_STATE_LABELS[item.state] ?? item.state }));
  const currentWeight = day.currentWeight
    ? { value: number(day.currentWeight.value), note: day.currentWeight.date === day.date ? "이 날 기록" : `${day.currentWeight.date} 기록` }
    : null;
  return { measurements, focus, checklist, checklistSummary, currentWeight };
}
