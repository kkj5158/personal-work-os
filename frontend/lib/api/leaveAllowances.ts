import { apiClient } from "./client";
import type { LeaveMonthSummaryDto } from "./types";

export function getLeaveMonthSummary(year: number, month: number): Promise<LeaveMonthSummaryDto> {
  return apiClient.get<LeaveMonthSummaryDto>(`/api/leave-allowances/${year}/${month}`);
}

export function setLeaveMonthAllowance(year: number, month: number, allowanceDays: number): Promise<LeaveMonthSummaryDto> {
  return apiClient.put<LeaveMonthSummaryDto>(`/api/leave-allowances/${year}/${month}`, { allowanceDays });
}
