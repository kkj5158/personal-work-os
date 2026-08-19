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

export interface TimeBlockCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TimeBlockCategoryInput {
  name: string;
  parentId: string | null;
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
