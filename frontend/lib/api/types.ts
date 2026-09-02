export type PlannedStatus = "WORK" | "DAY_OFF" | "ANNUAL_LEAVE" | "SICK_LEAVE";

export const PLANNED_STATUSES: PlannedStatus[] = ["WORK", "DAY_OFF", "ANNUAL_LEAVE", "SICK_LEAVE"];

// Fully resolved plan for a date: overrides applied on top of yearly defaults.
export interface EffectiveWorkSchedule {
  workDate: string; // yyyy-MM-dd
  plannedStatus: PlannedStatus;
  plannedStartTime: string | null; // HH:mm:ss
  graceMinutes: number | null;
  targetDurationMinutes: number | null;
  memo: string | null;
}

// Raw stored override for a date. A null field means "inherit from WorkSettings".
export interface WorkScheduleOverride {
  workDate: string;
  plannedStatus: PlannedStatus | null;
  plannedStartTime: string | null;
  graceMinutes: number | null;
  targetDurationMinutes: number | null;
  memo: string | null;
}

export interface WorkScheduleOverrideInput {
  plannedStatus: PlannedStatus | null;
  plannedStartTime: string | null;
  graceMinutes: number | null;
  targetDurationMinutes: number | null;
  memo: string | null;
}

// The canonical user-owned category, shared across Planning, Work Log
// work-time entries, the future time calendar, and future plan-versus-actual
// analytics — not a Planning-only concept, despite living in this file next
// to Planning-specific types today.
export interface ActivityCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
}

export interface ActivityCategoryInput {
  name: string;
  parentId: string | null;
}

export interface ActivityCategoryReorderInput {
  /** null reorders every top-level category; a category id reorders that parent's children. */
  parentId: string | null;
  orderedIds: string[];
}

// Work Log — StartTimeCriterion (backend: com.kafka.backend.starttimecriterion)

export interface StartTimeCriterionDto {
  id: string;
  name: string;
  startTime: string; // "HH:mm:ss"
  isActive: boolean;
  sortOrder: number;
  /** Minutes of lateness grace on top of startTime — see docs/backend/start-time-criteria.md. */
  graceMinutes: number;
  /** At most one active criterion per user — see docs/backend/start-time-criteria.md's default invariant. */
  isDefault: boolean;
  /** Optional free-text note. */
  memo: string | null;
}

// Shared by create and update — isActive is ignored server-side on create.
// graceMinutes: null defaults to 0 server-side (matching every pre-existing criterion's behavior).
export interface StartTimeCriterionInput {
  name: string;
  startTime: string; // "HH:mm" or "HH:mm:ss"
  isActive: boolean | null;
  graceMinutes: number | null;
  memo: string | null;
}

// Work Log — WorkRecord / WorkTimeEntry (backend: com.kafka.backend.workrecord / worktimeentry)

export type WorkAttendanceStatus = "WORK" | "EARLY_LEAVE" | "HALF_DAY" | "DAY_OFF" | "PAID_LEAVE" | "SICK_LEAVE" | "ABSENT";

export interface WorkTimeEntryDto {
  id: string;
  categoryId: string;
  item: string;
  minutes: number;
  memo: string | null;
  position: number;
}

// One line of WorkRecordRequest.workTimeEntries — id is null for a brand-new
// row; a non-null id matching one of the record's own current rows updates
// that row in place (identity preserved). List order is the position.
export interface WorkTimeEntryItemInput {
  id: string | null;
  categoryId: string;
  item: string;
  minutes: number;
  memo: string | null;
}

// Supplemental Work ("보강근무", backend: com.kafka.backend.supplementalwork)
// — additional actual-work time, independent of Attendance status (allowed
// under every status, never cleared by a status change). Unlike
// WorkTimeEntryDto, totalMinutes is the aggregation source of truth (never
// recomputed from startTime/endTime server-side) and startTime/endTime are
// optional but always a pair when present.

export interface SupplementalWorkEntryDto {
  id: string;
  categoryId: string;
  item: string;
  totalMinutes: number;
  startTime: string | null; // "HH:mm:ss"
  endTime: string | null;
  memo: string | null;
  position: number;
}

// One line of WorkRecordRequest.supplementalWorkEntries — same replace-all
// identity rule as WorkTimeEntryItemInput (id null = new row).
export interface SupplementalWorkEntryItemInput {
  id: string | null;
  categoryId: string;
  item: string;
  totalMinutes: number;
  startTime: string | null; // "HH:mm"
  endTime: string | null;
  memo: string | null;
}

export interface WorkRecordDto {
  id: string;
  workDate: string; // "yyyy-MM-dd"
  status: WorkAttendanceStatus;
  clockIn: string | null; // "HH:mm:ss"
  clockOut: string | null;
  basicWorkMinutes: number | null;
  workLocation: string | null;
  workScore: number | null;
  memo: string | null;
  appliedCriterionId: string | null;
  appliedCriterionName: string | null;
  appliedStartTime: string | null; // "HH:mm:ss"
  /** The grace period (minutes) frozen alongside appliedStartTime at the
   *  moment the criterion was applied — null when no criterion is applied,
   *  or when this record predates the grace-period feature (treated as 0
   *  by every lateness calculation either way). */
  appliedGraceMinutes: number | null;
  /** null = not applicable. 0 = on time (within the grace-adjusted
   *  threshold). positive = minutes late beyond it. Raw — never
   *  pre-combined with isOnTimeOverride. */
  latenessMinutes: number | null;
  isOnTimeOverride: boolean;
  absenceAutoGenerated: boolean;
  absenceCorrectedAt: string | null;
  version: number;
  workTimeEntries: WorkTimeEntryDto[];
  netWorkMinutes: number;
  /** Supplemental Work ("보강근무") entries — independent of status. */
  supplementalWorkEntries: SupplementalWorkEntryDto[];
  /** Sum of supplementalWorkEntries' totalMinutes. Deliberately separate
   *  from netWorkMinutes — see docs/product/work-log-policy.md. */
  supplementalWorkMinutes: number;
}

// Full-state upsert body for PUT /api/work-records/{date} and
// POST /api/work-records/{date}/absence-correction. expectedVersion is
// required and checked when a record already exists for that date;
// irrelevant (send null) on first creation.
export interface WorkRecordInput {
  status: WorkAttendanceStatus;
  clockIn: string | null; // "HH:mm"
  clockOut: string | null;
  workLocation: string | null;
  workScore: number | null;
  memo: string | null;
  appliedCriterionId: string | null;
  expectedVersion: number | null;
  workTimeEntries: WorkTimeEntryItemInput[];
  isOnTimeOverride: boolean | null;
  supplementalWorkEntries: SupplementalWorkEntryItemInput[];
}

// Body for the dedicated clock-in/clock-out/clock-times-clear action
// endpoints — these only ever operate on an already-existing record.
export interface WorkRecordActionInput {
  expectedVersion: number | null;
}

export interface PlannedTimeBlock {
  id: string;
  title: string;
  startAt: string; // yyyy-MM-ddTHH:mm:ss, naive Asia/Seoul wall-clock
  endAt: string;
  categoryId: string | null;
  memo: string | null;
}

export interface PlannedTimeBlockInput {
  title: string;
  startAt: string;
  endAt: string;
  categoryId: string | null;
  memo: string | null;
}

// Leave allowance (backend: com.kafka.backend.leaveallowance)

export interface LeaveMonthSummaryDto {
  year: number;
  month: number;
  /** null = this month has never been configured — annual leave/half-day
   *  cannot be selected yet. Distinct from an explicit 0. */
  allowanceDays: number | null;
  /** Confirmed usage — actual WorkRecord leave-consuming statuses. */
  usedDays: number;
  /** Outstanding reservation — leave-consuming AttendancePlan rows not yet
   *  superseded by an actual WorkRecord for that same date. */
  plannedDays: number;
  /** "Available" = allowanceDays - usedDays - plannedDays. Null exactly when allowanceDays is. */
  remainingDays: number | null;
}

// Attendance plans (backend: com.kafka.backend.attendanceplan) — future
// planned attendance, a separate domain from the actual WorkRecord. Only a
// subset of WorkAttendanceStatus is ever plannable — see AttendancePlanDto.

export type PlannableAttendanceStatus = "WORK" | "HALF_DAY" | "PAID_LEAVE" | "DAY_OFF";

export const PLANNABLE_ATTENDANCE_STATUSES: PlannableAttendanceStatus[] = ["WORK", "HALF_DAY", "PAID_LEAVE", "DAY_OFF"];

export interface AttendancePlanDto {
  id: string;
  planDate: string; // yyyy-MM-dd
  plannedStatus: PlannableAttendanceStatus;
  /** Required for WORK/HALF_DAY, null otherwise. */
  startTimeCriterionId: string | null;
  /** Optional day-level planned net-work target, in minutes (attendance
   *  follow-up QA round 2). null = not configured — never conflated with an
   *  explicit 0. Independent of PlannedTimeBlock's own derived total; never
   *  auto-synced either direction. Stored verbatim regardless of
   *  plannedStatus — a non-work status (PAID_LEAVE/DAY_OFF) does not erase
   *  it, it only becomes dormant (not currently effective); see
   *  docs/product/work-attendance-management-design.md. */
  plannedNetWorkMinutes: number | null;
}

export interface AttendancePlanInput {
  plannedStatus: PlannableAttendanceStatus;
  startTimeCriterionId: string | null;
  /** Always sent verbatim, regardless of plannedStatus — see
   *  AttendancePlanDto's own doc. A caller preserving a dormant value while
   *  saving a non-work status must resend it, never omit it. */
  plannedNetWorkMinutes: number | null;
}

// P1-C fix (broadcast-paste overwrite atomicity): the payload/result for
// PUT /api/attendance-plans/{date}/replace, which atomically replaces one
// date's entire AttendancePlan + PlannedTimeBlock state in one backend
// transaction — see AttendancePlanningReplaceService on the backend.

export interface AttendancePlanningReplaceInput {
  /** null = leave whatever plan already exists for this date untouched
   *  (never interpreted as "delete the existing plan"). */
  plan: AttendancePlanInput | null;
  /** The COMPLETE replacement set — required; an empty array means "no
   *  blocks", never "leave existing blocks alone". */
  blocks: PlannedTimeBlockInput[];
}

export interface AttendancePlanningReplaceResult {
  plan: AttendancePlanDto | null;
  blocks: PlannedTimeBlock[];
}

// Work chart reference lines (backend: com.kafka.backend.workchartreferenceline)
// Generalizes the old single-value Daily Work chart target into up to 3
// configurable "기준선" per chart/metric scope. Daily and weekly time scopes
// are semantically separate — see docs/backend/work-chart-reference-lines.md.

export type WorkChartReferenceLineScope = "DAILY_TIME" | "DAILY_SCORE" | "WEEKLY_TIME" | "WEEKLY_SCORE";

export type WorkChartReferenceLineColor = "BLUE" | "GREEN" | "AMBER" | "RED" | "CYAN" | "GRAY";

export interface WorkChartReferenceLineDto {
  id: string;
  scope: WorkChartReferenceLineScope;
  position: number;
  label: string;
  value: number;
  color: WorkChartReferenceLineColor;
}

export interface WorkChartReferenceLineCreateInput {
  scope: WorkChartReferenceLineScope;
  label: string;
  value: number;
  color: WorkChartReferenceLineColor;
}

export interface WorkChartReferenceLineUpdateInput {
  label: string;
  value: number;
  color: WorkChartReferenceLineColor;
}

// Checklist (backend: com.kafka.backend.checklist)

export type ChecklistPriority = "CORE" | "SECONDARY";

export interface ChecklistCategoryDto {
  id: string;
  name: string;
  position: number;
}

export interface ChecklistItemDto {
  id: string;
  categoryId: string | null;
  position: number;
  deleted: boolean;
  deletedAt: string | null; // yyyy-MM-dd
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  active: boolean;
  goalOverridePercent: number | null;
  effectiveGoalPercent: number;
}

export interface ChecklistItemCreateInput {
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  categoryId: string | null;
  goalOverridePercent: number | null;
}

export interface ChecklistItemVersionDto {
  id: string;
  effectiveFrom: string; // yyyy-MM-dd
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  active: boolean;
  goalOverridePercent: number | null;
  immutable: boolean;
}

export interface ChecklistItemVersionInput {
  effectiveFrom: string; // yyyy-MM-dd
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  active: boolean;
  goalOverridePercent: number | null;
}

export interface ChecklistGoalDto {
  id: string;
  effectiveFrom: string;
  goalPercent: number;
  immutable: boolean;
}

export interface ChecklistDailyEntryDto {
  id: string;
  itemId: string;
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  goalPercent: number;
  achieved: boolean;
  /** Per-date x per-item bullet memo, newline-joined; null = no memo. Never
   *  a global Item description — see backend ChecklistDailyEntry.memo. */
  memo: string | null;
}

export interface ChecklistDailyDto {
  date: string;
  applicable: boolean;
  entries: ChecklistDailyEntryDto[];
}

export interface AchievementPointDto {
  label: string;
  periodStart: string;
  periodEnd: string;
  overallRate: number | null;
  coreRate: number | null;
  secondaryRate: number | null;
  goalPercent: number;
  validDays: number;
}

export interface ItemBreakdownEntryDto {
  itemId: string;
  categoryId: string | null;
  position: number;
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  achievedCount: number;
  applicableCount: number;
  rate: number;
  effectiveGoalPercent: number;
  deleted: boolean;
}

export interface ItemTrendPointDto {
  label: string;
  periodStart: string;
  periodEnd: string;
  achievedCount: number | null;
  applicableCount: number | null;
  rate: number | null;
  goalPercent: number | null;
  state: "ACTIVE" | "NO_DATA";
}

// Checklist matrix (batch range read backing the checklist record table)

export interface ChecklistMatrixColumnDto {
  itemId: string;
  categoryId: string | null;
  position: number;
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  deleted: boolean;
  active: boolean;
}

export interface ChecklistMatrixCellDto {
  entryId: string;
  itemId: string;
  achieved: boolean;
}

export interface ChecklistMatrixRowDto {
  date: string; // yyyy-MM-dd
  status: WorkAttendanceStatus;
  applicable: boolean;
  cells: ChecklistMatrixCellDto[];
}

export interface ChecklistMatrixResponseDto {
  columns: ChecklistMatrixColumnDto[];
  rows: ChecklistMatrixRowDto[];
}
