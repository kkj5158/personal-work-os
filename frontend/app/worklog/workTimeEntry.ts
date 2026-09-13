import type { ActivityCategory } from "@/lib/api/types";

/** One live WORK classification; an active root or child is selectable. */
export interface WorkTimeEntry {
  id: string;
  categoryId: string;
  item: string;
  minutes: number;
  memo?: string;
  startTime?: string | null;
  endTime?: string | null;
}
export function sumWorkTimeEntries(entries: WorkTimeEntry[]): number {
  return entries.reduce((total, entry) => total + entry.minutes, 0);
}
export interface WorkTimeDraftEntry {
  id: string;
  parentCategoryId: string;
  categoryId: string;
  item: string;
  timeText: string;
  memo: string;
  startText?: string;
  endText?: string;
}
export interface WorkTimeRowErrors { category?: string; item?: string; time?: string; interval?: string }
export function toWorkTimeDraftEntry(entry: WorkTimeEntry, formatMinutes: (minutes: number) => string, categories: ActivityCategory[]): WorkTimeDraftEntry {
  const category = categories.find(c => c.id === entry.categoryId);
  return { id: entry.id, parentCategoryId: category?.parentId ?? category?.id ?? "", categoryId: entry.categoryId,
    item: entry.item, timeText: formatMinutes(entry.minutes), memo: entry.memo ?? "",
    startText: entry.startTime?.slice(0, 5) ?? "", endText: entry.endTime?.slice(0, 5) ?? "" };
}
export function isBlankWorkTimeDraftEntry(entry: WorkTimeDraftEntry): boolean {
  return !entry.parentCategoryId && !entry.categoryId && !entry.item.trim() && !entry.timeText.trim() && !entry.memo.trim() && !entry.startText?.trim() && !entry.endText?.trim();
}
export function clockMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function scheduledWorkMinutes(entry: Pick<WorkTimeDraftEntry, "startText" | "endText">): number | null {
  const start = clockMinutes(entry.startText ?? ""), end = clockMinutes(entry.endText ?? "");
  return start != null && end != null && start % 5 === 0 && end % 5 === 0 && end > start ? end - start : null;
}
export function validateWorkTimeDraftEntries(entries: WorkTimeDraftEntry[], parseMinutes: (text: string) => number | null, categories: ActivityCategory[]): { errors: Record<string, WorkTimeRowErrors>; validEntries: WorkTimeEntry[] } {
  const errors: Record<string, WorkTimeRowErrors> = {}, validEntries: WorkTimeEntry[] = [];
  for (const entry of entries) {
    if (isBlankWorkTimeDraftEntry(entry)) continue;
    const rowErrors: WorkTimeRowErrors = {};
    const categoryId = entry.categoryId || entry.parentCategoryId;
    const category = categories.find(c => c.id === categoryId);
    if (!entry.parentCategoryId) rowErrors.category = "상위 카테고리를 선택하세요";
    else if (!category || (category.id !== entry.parentCategoryId && category.parentId !== entry.parentCategoryId)) rowErrors.category = "올바른 카테고리를 선택하세요";
    // Existing inactive references remain valid; new options only expose active categories.
    if (!entry.item.trim()) rowErrors.item = "항목을 입력하세요";
    const hasStart = !!entry.startText?.trim(), hasEnd = !!entry.endText?.trim();
    let minutes = parseMinutes(entry.timeText);
    if (hasStart !== hasEnd) rowErrors.interval = "시작과 종료를 함께 입력하세요";
    else if (hasStart) {
      minutes = scheduledWorkMinutes(entry);
      if (minutes == null) rowErrors.interval = "같은 날짜의 시작/종료를 5분 단위로 입력하세요";
    } else if (minutes == null || minutes <= 0) rowErrors.time = "0분보다 큰 HH:MM 시간을 입력하세요 (예: 01:30)";
    if (Object.keys(rowErrors).length) { errors[entry.id] = rowErrors; continue; }
    validEntries.push({ id: entry.id, categoryId, item: entry.item.trim(), minutes: minutes!, memo: entry.memo.trim() || undefined,
      startTime: entry.startText?.trim() || null, endTime: entry.endText?.trim() || null });
  }
  return { errors, validEntries };
}
/** Each entry contributes once to its own category and once to each ancestor. Never sum these subtotals into an overall total. */
export function aggregateWorkMinutesByCategory(entries: Pick<WorkTimeEntry, "categoryId" | "minutes">[], categories: ActivityCategory[]): Map<string, number> {
  const parents = new Map(categories.map(c => [c.id, c.parentId]));
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const seen = new Set<string>();
    let id: string | null | undefined = entry.categoryId;
    while (id && !seen.has(id)) { seen.add(id); totals.set(id, (totals.get(id) ?? 0) + entry.minutes); id = parents.get(id); }
  }
  return totals;
}
