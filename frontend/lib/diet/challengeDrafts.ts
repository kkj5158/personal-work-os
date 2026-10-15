import type { Challenge, DietData, Milestone } from "./types";
import { civilDay } from "../dateRange";

export type ChallengeDraft = { base: Challenge | null; value: Challenge; error?: string };
export type ChallengeDraftMap = Record<string, ChallengeDraft>;
const editable = (c: Challenge) => {
  const { sortOrder: _sort, homeSortOrder: _home, ...fields } = c;
  void _sort; void _home;
  return Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, key === "title" || key === "keyPoint" ? String(value).trim() : key === "notes" ? (value as string[]).map(s => s.trim()) : value]));
};
export const challengeEqual = (a: Challenge, b: Challenge) => JSON.stringify(editable(a)) === JSON.stringify(editable(b));
export const draftChanged = (draft: ChallengeDraft) => !draft.base || !challengeEqual(draft.value, draft.base);
export function validateChallenge(c: Challenge, milestones: Milestone[]): string {
  if (!c.title.trim() || c.title.length > 200) return "제목을 1~200자로 입력하세요.";
  try { if (civilDay(c.startDate) > civilDay(c.endDate)) return "종료일은 시작일 이후여야 합니다."; } catch { return "올바른 시작일과 종료일을 입력하세요."; }
  if (!c.role) return "역할을 명시적으로 선택하세요.";
  if (!/^#[0-9a-f]{6}$/i.test(c.color)) return "색상을 확인하세요.";
  for (const key of ["startWeight", "targetWeight", "targetValue"] as const) if (c[key] != null && (!Number.isFinite(c[key]) || c[key]! <= 0)) return "체중과 목표 값은 0보다 커야 합니다.";
  if (c.currentValue != null && (!Number.isFinite(c.currentValue) || c.currentValue < 0)) return "현재 값은 0 이상이어야 합니다.";
  if (c.type === "WEIGHT" && (c.startWeight == null || c.targetWeight == null)) return "시작 체중과 목표 체중을 입력하세요.";
  if (c.type !== "WEIGHT" && c.targetValue == null) return "목표 값을 입력하세요.";
  if (c.type === "CHECKLIST" && (!c.itemIds.length || (c.goalMode === "RATE" && c.targetValue! > 100) || (c.goalMode === "COUNT" && !Number.isInteger(c.targetValue)))) return "체크리스트 항목과 목표 성공률(100 이하) 또는 정수 횟수를 확인하세요.";
  if (c.keyPoint.length > 2000 || c.notes.length > 100 || c.notes.some(n => n.length > 2000)) return "핵심/메모 길이를 확인하세요.";
  if (milestones.some(m => m.challengeId === c.id && (m.date < c.startDate || m.date > c.endDate))) return "기간 밖 마일스톤을 먼저 수정하세요. 날짜는 자동으로 이동하지 않습니다.";
  return "";
}

/** Independent PUTs; successful items are removed immediately, failed drafts survive.
 * The API has no challenge revision/CAS. Refetch detects observed conflicts and
 * uncertain responses; it cannot promise atomic batch writes or cross-client CAS.
 */
export async function saveChallengeDrafts(ids: string[], drafts: ChallengeDraftMap, io: {
  load: () => Promise<DietData>;
  save: (value: Challenge) => Promise<void>;
  committed: (id: string, value: Challenge) => void;
  failed: (id: string, message: string) => void;
}) {
  const changed = ids.map(id => drafts[id]).filter((d): d is ChallengeDraft => !!d && draftChanged(d));
  let latest: DietData;
  try { latest = await io.load(); } catch { for (const d of changed) io.failed(d.value.id, "최신 데이터를 확인하지 못했습니다. 초안을 보관했습니다."); return; }
  const invalid = changed.filter(d => validateChallenge(d.value, latest.milestones));
  if (invalid.length) { for (const d of invalid) io.failed(d.value.id, validateChallenge(d.value, latest.milestones)); return; }
  for (const d of changed) {
    const id = d.value.id;
    try {
      // Refetch before each PUT because earlier writes may refresh the canonical data.
      const remote = (await io.load()).challenges.find(c => c.id === id);
      if (remote && challengeEqual(remote, d.value)) { io.committed(id, remote); continue; }
      if ((d.base && (!remote || !challengeEqual(remote, d.base))) || (!d.base && remote)) throw new Error("다른 화면에서 변경되었습니다. 초안을 보관했습니다. 최신 값과 비교 후 다시 편집하세요.");
      const value = remote ? { ...d.value, sortOrder: remote.sortOrder, homeSortOrder: remote.homeSortOrder } : d.value;
      try { await io.save(value); } catch (error) {
        // A lost response may follow a committed PUT. Never blindly retry it.
        const confirmed = (await io.load()).challenges.find(c => c.id === id);
        if (!confirmed || !challengeEqual(confirmed, value)) throw error;
      }
      const confirmed = (await io.load()).challenges.find(c => c.id === id);
      if (!confirmed || !challengeEqual(confirmed, value)) throw new Error("저장 후 값이 달라졌습니다. 초안을 보관했습니다.");
      io.committed(id, confirmed);
    } catch (error) { io.failed(id, error instanceof Error ? error.message : "저장 실패 · 다시 시도하세요."); }
  }
}
