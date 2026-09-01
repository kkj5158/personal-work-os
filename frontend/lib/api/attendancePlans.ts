import { apiClient } from "./client";
import type { AttendancePlanDto, AttendancePlanInput, AttendancePlanningReplaceInput, AttendancePlanningReplaceResult } from "./types";

export function listAttendancePlans(from: string, to: string): Promise<AttendancePlanDto[]> {
  return apiClient.get<AttendancePlanDto[]>(`/api/attendance-plans?from=${from}&to=${to}`);
}

export function upsertAttendancePlan(date: string, input: AttendancePlanInput): Promise<AttendancePlanDto> {
  return apiClient.put<AttendancePlanDto>(`/api/attendance-plans/${date}`, input);
}

export function deleteAttendancePlan(date: string): Promise<void> {
  return apiClient.delete<void>(`/api/attendance-plans/${date}`);
}

/** P1-C fix: atomically replaces one date's entire AttendancePlan +
 *  PlannedTimeBlock state in a single backend transaction — see
 *  AttendancePlanningReplaceService. Used by broadcast paste's overwrite
 *  path instead of separate delete/upsert/create requests, which could
 *  leave a target half-replaced on a mid-sequence failure. */
export function replaceAttendancePlanning(date: string, input: AttendancePlanningReplaceInput): Promise<AttendancePlanningReplaceResult> {
  return apiClient.put<AttendancePlanningReplaceResult>(`/api/attendance-plans/${date}/replace`, input);
}
