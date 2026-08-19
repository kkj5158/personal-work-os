import { apiClient } from "./client";
import type { EffectiveWorkSchedule, WorkScheduleOverride, WorkScheduleOverrideInput } from "./types";

export function getEffectiveWorkPlan(date: string): Promise<EffectiveWorkSchedule> {
  return apiClient.get<EffectiveWorkSchedule>(`/api/work-plans/${date}`);
}

export async function getWorkScheduleOverride(date: string): Promise<WorkScheduleOverride | null> {
  const override = await apiClient.get<WorkScheduleOverride | undefined>(`/api/work-plans/${date}/override`);
  return override ?? null;
}

export function upsertWorkScheduleOverride(
  date: string,
  input: WorkScheduleOverrideInput,
): Promise<WorkScheduleOverride> {
  return apiClient.put<WorkScheduleOverride>(`/api/work-plans/${date}/override`, input);
}
