// Client view of the DIET SYS -> NOTE SYS projection block (backend diet.DietNoteProjection, v1).
export type DietDayPayload = {
  v: number;
  date: string;
  measurements: Record<string, number | string>;
  checklist: { total: number; success: number; failure: number; unrecorded: number; items: { title: string; importance: string; state: string }[] };
  note: string;
  focus: { title: string; role: string; startDate: string; endDate: string; keyPoint?: string }[];
};

const LABELS: [key: string, label: string, unit: string][] = [
  ["morningWeight", "아침 체중", "kg"],
  ["morningGlucose", "아침 혈당", "mg/dL"],
  ["morningBloodKetone", "아침 혈중 케톤", "mmol/L"],
  ["morningBreathKetone", "아침 호흡 케톤", "ppm"],
  ["bedtimeGlucose", "취침 전 혈당", "mg/dL"],
  ["bedtimeBloodKetone", "취침 전 혈중 케톤", "mmol/L"],
  ["bedtimeBreathKetone", "취침 전 호흡 케톤", "ppm"],
];
const ROLES: Record<string, string> = { CURRENT_FOCUS: "CURRENT FOCUS", NEXT_FOCUS: "NEXT FOCUS", FINAL_GOAL: "FINAL GOAL" };

export function parseDietDay(payload: string): DietDayPayload | null {
  try {
    const value = JSON.parse(payload) as Partial<DietDayPayload>;
    if (value?.v !== 1 || typeof value.date !== "string") return null;
    return {
      v: 1,
      date: value.date,
      measurements: value.measurements ?? {},
      checklist: value.checklist ?? { total: 0, success: 0, failure: 0, unrecorded: 0, items: [] },
      note: typeof value.note === "string" ? value.note : "",
      focus: Array.isArray(value.focus) ? value.focus : [],
    };
  } catch {
    return null;
  }
}

export function dietDayLines(day: DietDayPayload) {
  const time = (key: string) => {
    const at = day.measurements[key];
    return typeof at === "string" ? ` (${at.slice(11, 16)})` : "";
  };
  const measurements = LABELS.filter(([key]) => typeof day.measurements[key] === "number").map(
    ([key, label, unit]) => `${label} ${day.measurements[key]} ${unit}${time(key.startsWith("morning") ? "morningMeasuredAt" : "bedtimeMeasuredAt")}`,
  );
  const c = day.checklist;
  const checklist = c.total ? `체크리스트 ${c.success}/${c.total} 성공${c.failure ? ` · 실패 ${c.failure}` : ""}${c.unrecorded ? ` · 기록 못함 ${c.unrecorded}` : ""}` : "";
  const focus = day.focus.map(f => `${ROLES[f.role] ?? f.role} ${f.title} (${f.startDate} – ${f.endDate})`);
  return { measurements, checklist, focus };
}
