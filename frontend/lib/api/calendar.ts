import { apiClient } from "./client";
import type {
  ActualSourceType,
  BatchActualRequest,
  BatchActualResponse,
  CalendarRangeResponse,
  SupplementalWorkEntryDto,
  WorkTimeEntryDto,
  LifeTimeEntryDto,
} from "./types";

export function getCalendarRange(from: string, to: string): Promise<CalendarRangeResponse> {
  const params = new URLSearchParams({ from, to });
  return apiClient.get<CalendarRangeResponse>(`/api/calendar?${params.toString()}`);
}

type ScheduleResponse = WorkTimeEntryDto | SupplementalWorkEntryDto | LifeTimeEntryDto;

/** Unscheduled Actual -> Time Grid: assigns start/end to an existing Actual record. */
export function scheduleActual(sourceType: ActualSourceType, id: string, startTime: string, endTime: string): Promise<ScheduleResponse> {
  return apiClient.put<ScheduleResponse>(`/api/calendar/actual/${sourceType}/${id}/schedule`, { startTime, endTime });
}

/** Time Grid -> Unscheduled Actual: clears scheduling, preserves duration/identity. */
export function unscheduleActual(sourceType: ActualSourceType, id: string): Promise<ScheduleResponse> {
  return apiClient.put<ScheduleResponse>(`/api/calendar/actual/${sourceType}/${id}/unschedule`, {});
}

/** Batch Actual Editor commit — nothing is persisted unless every row validates. */
export function commitBatchActual(request: BatchActualRequest): Promise<BatchActualResponse> {
  return apiClient.post<BatchActualResponse>("/api/calendar/batch-actual", request);
}
