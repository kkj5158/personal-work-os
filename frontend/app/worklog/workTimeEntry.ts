// Route-local type for the future additive work-time entry model
// (docs/frontend/work-log/work-log-ui-spec.md §10, "업무시간 기록").
//
// This is prepared ahead of the Work-time Entry Modal phase but is NOT yet
// wired into WorkLogRecord as the source of truth for `실근무`. See
// mockData.ts for why that migration is deferred.

export interface WorkTimeEntry {
  id: string;
  /**
   * Canonical shared ActivityCategory id (frontend/lib/api/types.ts) —
   * required, exactly one per entry. Never a Work Log-specific category
   * type, never a name/color snapshot: the category name is always
   * resolved live from the current catalog (see activityCategory.ts's
   * resolveCategoryLabel), so a later category rename is reflected here
   * automatically instead of going stale.
   */
  categoryId: string;
  /** Free-text item label, independent of categoryId (spec §10: example items only, not a fixed enum). */
  item: string;
  minutes: number;
  memo?: string;
}

export function sumWorkTimeEntries(entries: WorkTimeEntry[]): number {
  return entries.reduce((total, entry) => total + entry.minutes, 0);
}

// Shared draft/validation shape for the work-time editor (v3 unit: extracted
// so the 일 (daily) view and the embedded editor inside the record-edit
// modal validate identically instead of drifting). `minutes`
// stays free text here (`timeText`) since the editable field accepts
// "HH:MM" input that may be transiently invalid mid-keystroke — only
// `validateWorkTimeDraftEntries` below parses it into a committed number.
export interface WorkTimeDraftEntry {
  id: string;
  /** "" means not yet selected — a new row never defaults to any category,
   *  including the first one in the catalog; the user must choose explicitly. */
  categoryId: string;
  item: string;
  timeText: string;
  memo: string;
}

export interface WorkTimeRowErrors {
  category?: string;
  item?: string;
  time?: string;
}

export function toWorkTimeDraftEntry(entry: WorkTimeEntry, formatMinutes: (minutes: number) => string): WorkTimeDraftEntry {
  return { id: entry.id, categoryId: entry.categoryId, item: entry.item, timeText: formatMinutes(entry.minutes), memo: entry.memo ?? "" };
}

export function isBlankWorkTimeDraftEntry(entry: WorkTimeDraftEntry): boolean {
  return entry.categoryId === "" && entry.item.trim() === "" && entry.timeText.trim() === "" && entry.memo.trim() === "";
}

// Validates a full draft list at save time (spec §10/§7: never bridge a
// blank never-touched row into a validation error). `parseMinutes` is
// injected (rather than importing format.ts's parseHoursMinutes directly)
// to keep this domain file free of a dependency on the presentation-layer
// format module.
export function validateWorkTimeDraftEntries(
  entries: WorkTimeDraftEntry[],
  parseMinutes: (text: string) => number | null,
): { errors: Record<string, WorkTimeRowErrors>; validEntries: WorkTimeEntry[] } {
  const errors: Record<string, WorkTimeRowErrors> = {};
  const validEntries: WorkTimeEntry[] = [];

  for (const entry of entries) {
    if (isBlankWorkTimeDraftEntry(entry)) continue;

    const rowErrors: WorkTimeRowErrors = {};
    if (entry.categoryId === "") rowErrors.category = "카테고리를 선택하세요";
    if (entry.item.trim() === "") rowErrors.item = "항목을 입력하세요";
    const minutes = parseMinutes(entry.timeText);
    if (minutes == null) rowErrors.time = "HH:MM 형식으로 입력하세요 (예: 01:30)";
    else if (minutes <= 0) rowErrors.time = "00:00은 저장할 수 없습니다";

    if (rowErrors.category || rowErrors.item || rowErrors.time) {
      errors[entry.id] = rowErrors;
      continue;
    }

    validEntries.push({
      id: entry.id,
      categoryId: entry.categoryId,
      item: entry.item.trim(),
      minutes: minutes as number,
      memo: entry.memo.trim() || undefined,
    });
  }

  return { errors, validEntries };
}
