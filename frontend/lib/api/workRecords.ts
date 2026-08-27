import { apiClient } from "./client";
import type { WorkRecordActionInput, WorkRecordDto, WorkRecordInput } from "./types";

export function listWorkRecords(from: string, to: string): Promise<WorkRecordDto[]> {
  const params = new URLSearchParams({ from, to });
  return apiClient.get<WorkRecordDto[]>(`/api/work-records?${params.toString()}`);
}

// 204 No Content (no record for this date) resolves to null — never an
// error, and this never creates a row as a side effect.
export async function getWorkRecord(date: string): Promise<WorkRecordDto | null> {
  const record = await apiClient.get<WorkRecordDto | undefined>(`/api/work-records/${date}`);
  return record ?? null;
}

export function upsertWorkRecord(date: string, input: WorkRecordInput): Promise<WorkRecordDto> {
  return apiClient.put<WorkRecordDto>(`/api/work-records/${date}`, input);
}

export function clockIn(date: string, input: WorkRecordActionInput): Promise<WorkRecordDto> {
  return apiClient.post<WorkRecordDto>(`/api/work-records/${date}/clock-in`, input);
}

export function clockOut(date: string, input: WorkRecordActionInput): Promise<WorkRecordDto> {
  return apiClient.post<WorkRecordDto>(`/api/work-records/${date}/clock-out`, input);
}

export function clearClockTimes(date: string, input: WorkRecordActionInput): Promise<WorkRecordDto> {
  return apiClient.post<WorkRecordDto>(`/api/work-records/${date}/clock-times/clear`, input);
}

// 결근 정정 — only eligible when the record's current status is ABSENT.
export function correctAbsence(date: string, input: WorkRecordInput): Promise<WorkRecordDto> {
  return apiClient.post<WorkRecordDto>(`/api/work-records/${date}/absence-correction`, input);
}
