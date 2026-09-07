import type { ReflectionEntry, TimeBlock } from "@/lib/notes/reflection";
const blocks = (values: [string, string, string][]): TimeBlock[] =>
  values.map(([startTime, endTime, label], i) => ({
    sourceId: `fixture-${i}-${startTime}`,
    startTime,
    endTime,
    durationMinutes:
      Number(endTime.slice(0, 2)) * 60 +
      Number(endTime.slice(3)) -
      Number(startTime.slice(0, 2)) * 60 -
      Number(startTime.slice(3)),
    label,
    semanticType: "ACTIVITY",
  }));
export const reflectionFixture: ReflectionEntry = {
  id: "fixture-reflection",
  date: "2026-09-06",
  content:
    "계획과 실제 흐름을 비교하며 하루를 돌아봅니다. 집중이 이어진 시간을 기억하고 내일의 계획에 여유를 남깁니다.",
  version: 1,
  workOsRoute: "/worklog?date=2026-09-06",
  snapshot: {
    date: "2026-09-06",
    generatedAt: "2026-09-06T13:00:00Z",
    plannedBlocks: blocks([
      ["06:00", "08:00", "아침 루틴"],
      ["09:00", "12:00", "프로젝트 작업"],
      ["13:00", "15:00", "리서치 및 자료 정리"],
      ["16:00", "18:00", "운동"],
      ["20:00", "21:00", "독서"],
    ]),
    actualBlocks: blocks([
      ["06:30", "08:30", "아침 루틴"],
      ["09:00", "12:30", "프로젝트 작업"],
      ["12:30", "13:30", "점심 식사"],
      ["14:00", "17:30", "리서치 및 자료 정리"],
      ["19:00", "20:30", "운동"],
    ]),
    workSummary: { plannedMinutes: 600, actualMinutes: 690 },
    checklistSummary: { completed: 2, total: 4 },
  },
};
