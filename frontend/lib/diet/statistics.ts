import type { DailyRecord, DietData, Importance, MetabolicKey } from "./types";
import { addDays, average, checklistStats, daysBetween, goalFor, latestWeight, monthEnd, monthStart, today, weekStart } from "./model";

/**
 * DIET Statistics (Progress) calculations, extracted from app/diet/Progress.tsx
 * without behavior change so the screen stays thin and the exact semantics can
 * be mirrored by diet-sys-mobile (src/diet/stats). `asOf` defaults to the Seoul
 * date; tests pass it explicitly.
 */
export type StatisticsPeriod = "7d" | "4w" | "month" | "challenge" | "all" | "custom";
export const STATISTICS_PERIODS: [StatisticsPeriod, string][] = [["7d", "7일"], ["4w", "4주"], ["month", "이번 달"], ["challenge", "Challenge"], ["all", "전체"], ["custom", "기간 선택"]];

export type RangeOptions = { challengeId?: string; customStart?: string; customEnd?: string };

/** Inclusive [start, end] of a period. "전체" may end in the future (goal/milestone dates). */
export function statisticsRange(data: DietData, period: StatisticsPeriod, options: RangeOptions = {}, asOf = today()) {
  const challenge = data.challenges.find(c => c.id === options.challengeId);
  const start = period === "7d" ? addDays(asOf, -6)
    : period === "month" ? monthStart(asOf)
    : period === "all" ? [asOf, ...data.days.map(d => d.date), ...data.items.map(i => i.startDate), ...data.goals.flatMap(g => g.baselineDate ? [g.baselineDate, g.targetDate] : [g.targetDate]), ...data.milestones.map(m => m.date)].sort()[0]
    : period === "custom" ? options.customStart ?? addDays(asOf, -27)
    : period === "challenge" ? (challenge?.startDate ?? asOf)
    : addDays(asOf, -27);
  const end = period === "all" ? [asOf, ...data.days.map(d => d.date), ...data.goals.map(g => g.targetDate), ...data.milestones.map(m => m.date)].sort().at(-1)!
    : period === "custom" ? options.customEnd ?? asOf
    : period === "challenge" ? (challenge?.endDate ?? asOf)
    : asOf;
  return { start, end, dates: start <= end ? daysBetween(start, end) : [] };
}

export const rowsInRange = (data: DietData, start: string, end: string) => data.days.filter(d => d.date >= start && d.date <= end);

/** 현재 체중 · 기간 변화 · 기간 최저 · 최종 목표까지. */
export function weightSummary(data: DietData, start: string, end: string, asOf = today()) {
  const weights = rowsInRange(data, start, end).filter(d => d.morningWeight != null).sort((a, b) => a.date.localeCompare(b.date));
  const latest = latestWeight(data.days, end);
  const difference = weights.length > 1 ? weights.at(-1)!.morningWeight! - weights[0].morningWeight! : null;
  const minimum = weights.length ? Math.min(...weights.map(d => d.morningWeight!)) : null;
  const final = goalFor(data, "FINAL", asOf);
  return { latest, difference, minimum, toFinal: latest != null && final ? latest - final.targetWeight : null };
}

export const METABOLIC_FIELDS = {
  glucose: ["morningGlucose", "bedtimeGlucose", "mg/dL"],
  breath: ["morningBreathKetone", "bedtimeBreathKetone", "ppm"],
  blood: ["morningBloodKetone", "bedtimeBloodKetone", "mmol/L"],
} as const satisfies Record<MetabolicKey, readonly [keyof DailyRecord, keyof DailyRecord, string]>;

/** 전체/아침/취침 평균, 측정 수 and the daily morning/bedtime series. */
export function metabolicStatistics(data: DietData, metric: MetabolicKey, start: string, end: string) {
  const [am, pm, unit] = METABOLIC_FIELDS[metric];
  const rows = rowsInRange(data, start, end);
  const amValues = rows.map(d => d[am] as number | null | undefined), pmValues = rows.map(d => d[pm] as number | null | undefined);
  const dates = start <= end ? daysBetween(start, end) : [];
  return {
    unit,
    overall: average([...amValues, ...pmValues]),
    morning: average(amValues),
    bedtime: average(pmValues),
    count: [...amValues, ...pmValues].filter(v => v != null).length,
    dates,
    morningSeries: dates.map(d => (rows.find(r => r.date === d)?.[am] as number | null | undefined) ?? null),
    bedtimeSeries: dates.map(d => (rows.find(r => r.date === d)?.[pm] as number | null | undefined) ?? null),
    lines: data.settings.metabolic?.[metric]?.lines ?? [],
    bands: data.settings.metabolic?.[metric]?.bands ?? [],
  };
}

export type ImportanceFilter = Importance | "ALL";
export type CountPeriod = "week" | "month";

/** Checklist rows: selected range, this week and this month for each visible item. */
export function checklistItemRows(data: DietData, importance: ImportanceFilter, start: string, end: string, includeMissing: boolean, asOf = today()) {
  return [...data.items].filter(i => importance === "ALL" || i.importance === importance).sort((a, b) => a.sortOrder - b.sortOrder).map(item => ({
    item,
    range: checklistStats(data, [item.id], start, end, includeMissing, asOf),
    week: checklistStats(data, [item.id], weekStart(asOf), asOf, includeMissing, asOf),
    month: checklistStats(data, [item.id], monthStart(asOf), asOf, includeMissing, asOf),
  }));
}

/** Success count per week/month bucket, clipped to the selected range, plus the item reference. */
export function checklistBuckets(data: DietData, itemId: string, start: string, end: string, countPeriod: CountPeriod, includeMissing: boolean, asOf = today()) {
  const dates = start <= end ? daysBetween(start, end) : [];
  const buckets = [...new Set(dates.map(d => countPeriod === "week" ? weekStart(d) : monthStart(d)))];
  const values = buckets.map(d => {
    const bucketEnd = countPeriod === "week" ? addDays(d, 6) : monthEnd(d);
    return checklistStats(data, [itemId], d < start ? start : d, bucketEnd < end ? bucketEnd : end, includeMissing, asOf).success;
  });
  const item = data.items.find(i => i.id === itemId);
  const reference = item?.[countPeriod === "week" ? "weeklyReference" : "monthlyReference"] ?? null;
  return { buckets, values, reference };
}
