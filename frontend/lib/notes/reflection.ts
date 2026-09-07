export const DISPLAY_MODES = {
  COMPARE: "계획 vs 실제",
  ACTUAL_ONLY: "실제만",
  PLAN_ONLY: "계획만",
  TEXT_ONLY: "Calendar 없이 회고만",
} as const;
export type DisplayMode = keyof typeof DISPLAY_MODES;
export type TimeBlock = {
  sourceId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  label: string;
  categoryId?: string | null;
  categoryLabel?: string | null;
  semanticType: string;
};
export type ReflectionSnapshot = {
  date: string;
  generatedAt: string;
  plannedBlocks: TimeBlock[];
  actualBlocks: TimeBlock[];
  workSummary: { plannedMinutes: number; actualMinutes: number };
  checklistSummary: { completed: number; total: number };
};
export type ReflectionEntry = {
  id: string;
  date: string;
  content: string;
  version: number;
  snapshot: ReflectionSnapshot;
  workOsRoute: string;
};
export type ReflectionEmbed = {
  reflectionEntryId: string;
  reflectionDate: string;
  displayMode: DisplayMode;
};
export interface ReflectionProvider {
  findMain(date: string): Promise<ReflectionEntry | null>;
  createMain(date: string): Promise<ReflectionEntry>;
  updateMain(entry: ReflectionEntry, content: string): Promise<ReflectionEntry>;
  frozenSnapshot(id: string): Promise<ReflectionSnapshot>;
}
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function snapshotBounds(s: ReflectionSnapshot) {
  const blocks = [...s.plannedBlocks, ...s.actualBlocks];
  return {
    start: Math.min(360, ...blocks.map((b) => minutes(b.startTime))),
    end: Math.max(1320, ...blocks.map((b) => minutes(b.endTime))),
  };
}
export function embedOnce(
  embeds: ReflectionEmbed[],
  entry: ReflectionEntry,
  displayMode: DisplayMode,
) {
  return embeds.some(
    (e) => e.reflectionEntryId === entry.id || e.reflectionDate === entry.date,
  )
    ? embeds
    : [
        ...embeds,
        {
          reflectionEntryId: entry.id,
          reflectionDate: entry.date,
          displayMode,
        },
      ];
}
export function unlinkEmbed(embeds: ReflectionEmbed[], id: string) {
  return embeds.filter((e) => e.reflectionEntryId !== id);
}
