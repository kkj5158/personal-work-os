import type { DietData, ReferenceLine, WeightGoal } from "./types";
import { addDays, daysBetween, goalFor, today } from "./model";

const GOAL_NAMES: Record<WeightGoal["kind"], string> = { SHORT_TERM: "단기 목표", WEEKLY: "주 목표", MONTHLY: "월 목표", FINAL: "최종 목표" };
const GOAL_COLORS = { SHORT_TERM: "#2875dc", WEEKLY: "#4d8a79", MONTHLY: "#927aa9", FINAL: "#7f8795" };

// Preserve sparse target points, with interpolated endpoints when a period clips a segment.
function trendValues(dates: string[], points: { date: string; value: number }[]) {
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const values = new Map(ordered.map(p => [p.date, p.value]));
  return dates.map((date, index) => {
    if (values.has(date)) return values.get(date)!;
    if (index !== 0 && index !== dates.length - 1) return null;
    const next = ordered.findIndex(p => p.date > date);
    if (next < 1) return null;
    const before = ordered[next - 1], after = ordered[next];
    const time = (d: string) => Date.parse(`${d}T00:00:00Z`);
    return before.value + (after.value - before.value) * (time(date) - time(before.date)) / (time(after.date) - time(before.date));
  });
}

export function weightAnalytics(data: DietData, start?: string, end?: string) {
  const weightMilestones = data.milestones.filter(m => data.challenges.some(c => c.id === m.challengeId && c.type === "WEIGHT"));
  const allDates = [...data.days.filter(d => d.morningWeight != null || d.targetWeight != null).map(d => d.date), ...weightMilestones.map(m => m.date), ...data.goals.map(g => g.targetDate)].sort();
  const from = start ?? allDates[0] ?? addDays(today(), -27);
  const to = end ?? (allDates.at(-1) && allDates.at(-1)! > today() ? allDates.at(-1)! : today());
  const dates = daysBetween(from, to);
  const dayMap = new Map(data.days.map(d => [d.date, d]));
  const movingAverage = dates.map(date => {
    if (date > today()) return null;
    const values = Array.from({ length: 7 }, (_, i) => dayMap.get(addDays(date, -i))?.morningWeight).filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
  const goalLines: ReferenceLine[] = (Object.keys(GOAL_NAMES) as WeightGoal["kind"][]).flatMap(kind => {
    const goal = goalFor(data, kind);
    return goal ? [{ id: `goal-${kind}`, name: `${GOAL_NAMES[kind]} · ${goal.targetWeight}kg${goal.core ? ` · ${goal.core}` : ""}`, value: goal.targetWeight, visible: !(data.settings.hiddenGoalLines ?? []).includes(kind), goalKind: kind, color: GOAL_COLORS[kind] }] : [];
  });
  return { dates, series: [
    { name: "실제 체중", color: "#2875dc", values: dates.map(date => dayMap.get(date)?.morningWeight ?? null), connectGaps: true },
    { name: "7일 이동평균", color: "#859cc6", values: movingAverage, dashed: true },
    { name: "일 목표 체중", color: "#b97d45", values: trendValues(dates, data.days.filter(d => d.targetWeight != null).map(d => ({ date: d.date, value: d.targetWeight! }))), connectGaps: true, targetTrend: true },
    ...(["WEEKLY", "MONTHLY"] as const).map(kind => ({ name: `${GOAL_NAMES[kind]} 추이`, color: GOAL_COLORS[kind], values: trendValues(dates, data.goals.filter(g => g.kind === kind).map(g => ({ date: g.targetDate, value: g.targetWeight }))), connectGaps: true, targetTrend: true })),
  ], lines: [...goalLines, ...(data.settings.weightLines ?? [])], markers: weightMilestones.map(m => ({ id: m.id, date: m.date, value: m.value, label: m.title || "마일스톤", color: data.challenges.find(c => c.id === m.challengeId)?.color || "#b97d45" })) };
}
