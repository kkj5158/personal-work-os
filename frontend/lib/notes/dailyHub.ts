import type { Workspace } from "./types";

export type DailyHubSettings = { includedWorkspaceIds: string[]; autoIncludeNewWorkspaces: boolean };
export type DailyHubRecord = { date: string; workspaceCount: number };
export const dailyHubUrl = (date: string) => `/notes?module=DAILY_HUB&date=${date}`;
export function includedWorkspaces(workspaces: Workspace[], settings: DailyHubSettings) {
  const ids = new Set(settings.includedWorkspaceIds);
  return workspaces.filter(w => !w.archivedAt && ids.has(w.id));
}
