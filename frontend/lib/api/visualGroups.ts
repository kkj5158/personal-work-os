import { apiClient } from "./client";
import type { CalendarVisualGroup, VisualGroupInput } from "@/app/calendar/visualGroups";
const ROOT = "/api/calendar/visual-groups";
export const listVisualGroups = (from: string, to: string) => apiClient.get<CalendarVisualGroup[]>(`${ROOT}?${new URLSearchParams({ from, to })}`);
export const createVisualGroup = (input: VisualGroupInput) => apiClient.post<CalendarVisualGroup>(ROOT, input);
export const updateVisualGroup = (id: string, input: VisualGroupInput) => apiClient.put<CalendarVisualGroup>(`${ROOT}/${id}`, input);
export const deleteVisualGroup = (id: string) => apiClient.delete<{ undoToken: string }>(`${ROOT}/${id}`);
export const undoVisualGroup = (token: string) => apiClient.post<CalendarVisualGroup>(`${ROOT}/undo/${token}`, {});
