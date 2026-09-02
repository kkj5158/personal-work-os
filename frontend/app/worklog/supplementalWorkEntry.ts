// Route-local type for Supplemental Work ("보강근무") — additional actual-work
// time recorded separately from ordinary WorkTimeEntry ("정규근무"), allowed
// under every Attendance status and never cleared by a status transition
// (see mockData.ts's WorkLogRecord.supplementalWorkEntries and
// docs/product/work-log-policy.md). Mirrors workTimeEntry.ts's draft/
// validation shape so both editors share the same conventions, but adds:
//   - totalMinutes (총시간) as the aggregation source of truth, never
//     recomputed from startTime/endTime once the user has a value present.
//   - optional startTime/endTime, always a pair, same-day only.
//   - overlap validation (against sibling Supplemental entries and against
//     the record's own regular clock-in/clock-out interval) — a concept
//     WorkTimeEntry has no equivalent of, since it carries no time-of-day.

import type { ActivityCategory } from "@/lib/api/types";

export interface SupplementalWorkEntry {
  id: string;
  /** Same canonical shared ActivityCategory child id convention as
   *  WorkTimeEntry.categoryId — see workTimeEntry.ts. */
  categoryId: string;
  item: string;
  totalMinutes: number;
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  memo?: string;
}

export function sumSupplementalWorkEntries(entries: SupplementalWorkEntry[]): number {
  return entries.reduce((total, entry) => total + entry.totalMinutes, 0);
}

export interface SupplementalWorkDraftEntry {
  id: string;
  parentCategoryId: string;
  categoryId: string;
  item: string;
  timeText: string;
  startText: string;
  endText: string;
  memo: string;
}

export interface SupplementalWorkRowErrors {
  category?: string;
  item?: string;
  time?: string;
  /** Start/end pairing, ordering, or overlap (vs a sibling entry or the
   *  record's own regular work interval) — all surfaced as one message per
   *  row, matching the backend's own "기존 근무시간 HH:mm~HH:mm과 겹칩니다."
   *  wording so a row-level rejection here and a save-time backend rejection
   *  read the same way. */
  interval?: string;
}

export function toSupplementalWorkDraftEntry(
  entry: SupplementalWorkEntry,
  formatMinutes: (minutes: number) => string,
  categories: ActivityCategory[],
): SupplementalWorkDraftEntry {
  const child = categories.find((c) => c.id === entry.categoryId);
  return {
    id: entry.id,
    parentCategoryId: child?.parentId ?? "",
    categoryId: entry.categoryId,
    item: entry.item,
    timeText: formatMinutes(entry.totalMinutes),
    startText: entry.startTime ?? "",
    endText: entry.endTime ?? "",
    memo: entry.memo ?? "",
  };
}

export function isBlankSupplementalWorkDraftEntry(entry: SupplementalWorkDraftEntry): boolean {
  return (
    entry.parentCategoryId === "" &&
    entry.categoryId === "" &&
    entry.item.trim() === "" &&
    entry.timeText.trim() === "" &&
    entry.startText.trim() === "" &&
    entry.endText.trim() === "" &&
    entry.memo.trim() === ""
  );
}

interface TimedInterval {
  id: string;
  startMinutes: number;
  endMinutes: number;
}

function overlaps(a: TimedInterval, bStart: number, bEnd: number): boolean {
  return a.startMinutes < bEnd && a.endMinutes > bStart;
}

// Validates a full Supplemental Work draft list at save time — mirrors
// validateWorkTimeDraftEntries's shape/skip-blank-rows convention
// (workTimeEntry.ts), plus the two overlap rules from confirmed policy:
// no two timed Supplemental entries may overlap each other, and no timed
// Supplemental entry may overlap the record's own regular work interval
// (`regularInterval`, in minutes-of-day; null when the record has no
// complete clock-in/clock-out — e.g. non-working status, or not yet clocked
// out). Touching boundaries are allowed (half-open interval test, same as
// the backend). An entry with no start/end cannot be overlap-validated and
// is always accepted on that front. This is a same-day-only check — an
// overnight regular interval (clockOut time-of-day earlier than clockIn) is
// approximated here as [clockIn, 24:00) for this date, since a Supplemental
// entry can never itself cross midnight; the backend remains authoritative
// for the exact real-timestamp comparison regardless.
export function validateSupplementalWorkDraftEntries(
  entries: SupplementalWorkDraftEntry[],
  parseMinutes: (text: string) => number | null,
  parseTimeOfDay: (text: string) => number | null,
  categories: ActivityCategory[],
  regularInterval: { startMinutes: number; endMinutes: number } | null,
): { errors: Record<string, SupplementalWorkRowErrors>; validEntries: SupplementalWorkEntry[] } {
  const errors: Record<string, SupplementalWorkRowErrors> = {};
  const validEntries: SupplementalWorkEntry[] = [];
  const timedIntervals: TimedInterval[] = [];

  for (const entry of entries) {
    if (isBlankSupplementalWorkDraftEntry(entry)) continue;

    const rowErrors: SupplementalWorkRowErrors = {};

    if (entry.parentCategoryId === "") {
      rowErrors.category = "상위 카테고리를 선택하세요";
    } else if (entry.categoryId === "") {
      rowErrors.category = "하위 카테고리를 선택하세요";
    } else {
      const child = categories.find((c) => c.id === entry.categoryId);
      if (!child || child.parentId === null || child.parentId !== entry.parentCategoryId) {
        rowErrors.category = "올바른 하위 카테고리를 선택하세요";
      }
    }

    if (entry.item.trim() === "") rowErrors.item = "항목을 입력하세요";

    const totalMinutes = parseMinutes(entry.timeText);
    if (totalMinutes == null) rowErrors.time = "HH:MM 형식으로 입력하세요 (예: 01:30)";
    else if (totalMinutes <= 0) rowErrors.time = "00:00은 저장할 수 없습니다";

    const hasStart = entry.startText.trim() !== "";
    const hasEnd = entry.endText.trim() !== "";
    let startMinutes: number | null = null;
    let endMinutes: number | null = null;

    if (hasStart !== hasEnd) {
      rowErrors.interval = "시작과 종료를 함께 입력하세요";
    } else if (hasStart && hasEnd) {
      startMinutes = parseTimeOfDay(entry.startText);
      endMinutes = parseTimeOfDay(entry.endText);
      if (startMinutes == null || endMinutes == null) {
        rowErrors.interval = "시간 형식이 올바르지 않습니다 (예: 09:30)";
      } else if (endMinutes <= startMinutes) {
        rowErrors.interval = "종료 시간은 시작 시간보다 늦어야 합니다";
      }
    }

    if (!rowErrors.interval && startMinutes != null && endMinutes != null) {
      const conflictSibling = timedIntervals.find((other) => overlaps(other, startMinutes as number, endMinutes as number));
      if (conflictSibling) {
        rowErrors.interval = `기존 근무시간 ${minutesToClock(conflictSibling.startMinutes)}~${minutesToClock(conflictSibling.endMinutes)}과 겹칩니다.`;
      } else if (
        regularInterval &&
        startMinutes < regularInterval.endMinutes &&
        endMinutes > regularInterval.startMinutes
      ) {
        rowErrors.interval = `기존 근무시간 ${minutesToClock(regularInterval.startMinutes)}~${minutesToClock(regularInterval.endMinutes)}과 겹칩니다.`;
      }
    }

    if (rowErrors.category || rowErrors.item || rowErrors.time || rowErrors.interval) {
      errors[entry.id] = rowErrors;
      continue;
    }

    if (startMinutes != null && endMinutes != null) {
      timedIntervals.push({ id: entry.id, startMinutes, endMinutes });
    }

    validEntries.push({
      id: entry.id,
      categoryId: entry.categoryId,
      item: entry.item.trim(),
      totalMinutes: totalMinutes as number,
      startTime: hasStart ? entry.startText : null,
      endTime: hasEnd ? entry.endText : null,
      memo: entry.memo.trim() || undefined,
    });
  }

  return { errors, validEntries };
}

function minutesToClock(totalMinutes: number): string {
  const clamped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
