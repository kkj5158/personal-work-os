export type SourcePageRange = { firstPage: number; lastPage: number };
export type PlanIntent = {
  date: string;
  days: 1 | 7;
  materialIds: string[];
  sourceRanges?: Record<string, SourcePageRange>;
  operationId: string;
};
export const planIntentKey = (owner: string) => `study-plan-intent-v3/${owner}`;
export function readPlanIntent(
  storage: Pick<Storage, "getItem">,
  owner: string,
): PlanIntent | undefined {
  const raw = storage.getItem(planIntentKey(owner));
  if (!raw) return;
  const value = JSON.parse(raw) as PlanIntent;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    ![1, 7].includes(value.days) ||
    !Array.isArray(value.materialIds) ||
    !value.materialIds.every((id) => typeof id === "string") ||
    !/^[0-9a-f-]{36}$/.test(value.operationId) ||
    (value.sourceRanges !== undefined && (value.sourceRanges === null ||
      typeof value.sourceRanges !== "object" ||
      Object.entries(value.sourceRanges).some(([id, range]) =>
        !value.materialIds.includes(id) || !range || !Number.isInteger(range.firstPage) ||
        !Number.isInteger(range.lastPage) || range.firstPage < 1 || range.lastPage > 2000 ||
        range.firstPage > range.lastPage)))
  )
    throw new Error(
      "저장된 생성 요청을 확인할 수 없습니다. 요청 기록을 확인한 뒤 새 요청을 시작하세요.",
    );
  return value;
}
export function savePlanIntent(
  storage: Pick<Storage, "setItem">,
  owner: string,
  value: PlanIntent,
) {
  // Persist before sending; failure to persist blocks sending rather than losing replay identity.
  storage.setItem(
    planIntentKey(owner),
    JSON.stringify({ ...value, materialIds: [...value.materialIds].sort() }),
  );
}
