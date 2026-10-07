import type { CalendarPreferences } from "./appearance";
import type { CalendarPlanMode } from "./CalendarToolbar";

export function restoredCalendarMode(query:string|null,prefs:CalendarPreferences):CalendarPlanMode {
  const value=query ?? prefs.mode;
  return value === "compare" ? "review" : value === "all" || value === "plan" || value === "actual" || value === "review" ? value : "all";
}
