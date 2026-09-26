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

export type MeasurementRow = { label: string; unit: string; morning: string; bedtime: string };

const number = (value: unknown) => typeof value === "number" ? String(Number(value.toFixed(2))) : "—";
const time = (value: unknown) => typeof value === "string" && value.length >= 16 ? value.slice(11, 16) : "—";

/**
 * Structured view model for the managed block. Rows follow the live slot contract:
 * weight exists only for the morning slot, so its bedtime cell is "해당 없음", never a value.
 */
export function dietDayView(day: DietDayPayload) {
  const m = day.measurements;
  const measurements: MeasurementRow[] = [
    { label: "체중 기록", unit: "kg", morning: number(m.morningWeight), bedtime: "해당 없음" },
    { label: "혈당", unit: "mg/dL", morning: number(m.morningGlucose), bedtime: number(m.bedtimeGlucose) },
    { label: "혈중 케톤", unit: "mmol/L", morning: number(m.morningBloodKetone), bedtime: number(m.bedtimeBloodKetone) },
    { label: "호흡 케톤", unit: "ppm", morning: number(m.morningBreathKetone), bedtime: number(m.bedtimeBreathKetone) },
    { label: "측정 시각", unit: "", morning: time(m.morningMeasuredAt), bedtime: time(m.bedtimeMeasuredAt) },
  ];
  const focus = FOCUS_ROLES.map(([role, label]) => ({ role, label, entries: day.focus.filter(f => f.role === role) }));
  const c = day.checklist;
  const checklistSummary = c.total ? `성공 ${c.success} / ${c.total}${c.failure ? ` · 실패 ${c.failure}` : ""}${c.unrecorded ? ` · 기록 못함 ${c.unrecorded}` : ""}` : "";
  const checklist = c.items.map(item => ({ importance: item.importance, title: item.title, state: item.state, label: CHECK_STATE_LABELS[item.state] ?? item.state }));
  const currentWeight = day.currentWeight
    ? { value: number(day.currentWeight.value), note: day.currentWeight.date === day.date ? "이 날 기록" : `${day.currentWeight.date.slice(5).replace("-", "/")} 기록` }
    : null;
  return { measurements, focus, checklist, checklistSummary, currentWeight };
}
