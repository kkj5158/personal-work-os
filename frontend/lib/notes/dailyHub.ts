import type { Workspace } from "./types";

export type DailyHubSettings = { includedWorkspaceIds: string[]; autoIncludeNewWorkspaces: boolean };
export type DailyHubRecord = { date: string; workspaceCount: number };
export const dailyHubUrl = (date: string) => `/notes?module=DAILY_HUB&date=${date}`;
export const hasDailyContent = (content: string) => /[^\s\u200b]/u.test(content);
export function includedWorkspaces(workspaces: Workspace[], settings: DailyHubSettings) {
  const ids = new Set(settings.includedWorkspaceIds);
  return workspaces.filter(w => !w.archivedAt && ids.has(w.id));
}
