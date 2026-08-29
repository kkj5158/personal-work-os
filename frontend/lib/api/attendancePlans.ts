import { apiClient } from "./client";
import type { AttendancePlanDto, AttendancePlanInput } from "./types";

export function listAttendancePlans(from: string, to: string): Promise<AttendancePlanDto[]> {
  return apiClient.get<AttendancePlanDto[]>(`/api/attendance-plans?from=${from}&to=${to}`);
}

export function upsertAttendancePlan(date: string, input: AttendancePlanInput): Promise<AttendancePlanDto> {
  return apiClient.put<AttendancePlanDto>(`/api/attendance-plans/${date}`, input);
}

export function deleteAttendancePlan(date: string): Promise<void> {
  return apiClient.delete<void>(`/api/attendance-plans/${date}`);
}
