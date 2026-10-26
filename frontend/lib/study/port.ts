import { emptySnapshot, fixtureSnapshot, makePackage } from "./fixtures";
import { addDays, bindingFor, responseKey, validatePackage, validateResponse, weekStart, type Binding, type Response, type StudyDataPort, type StudyPolicy, type StudySnapshot, type StudySource, type StudyAttempt, type StudyPart } from "./model";

function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
export function createStudyPort(mode: "demo" | "disconnected", now = new Date()): StudyDataPort {
  let snapshot = freeze(mode === "demo" ? fixtureSnapshot(now) : emptySnapshot());
  const listeners = new Set<() => void>();
  const mutate = (fn: (next: StudySnapshot) => void) => {
    if (mode !== "demo") throw new Error("학습 서버가 연결되지 않았습니다.");
    const next = structuredClone(snapshot); fn(next); snapshot = freeze(next); listeners.forEach(listener => listener());
  };
  const future = addDays(weekStart(now), 7);
  const applyPolicy = (next: StudySnapshot, policy: StudyPolicy) => {
    next.policies.push(policy);
    // Published and archived snapshots are never overwritten. Future preview
    // corrections get new workbook versions; old attempts remain addressable.
    const originals = next.packages.filter(p => p.date >= future && p.status === "preview");
    const latest = new Map<string, typeof originals[number]>();
    originals.forEach(p => { if (!latest.has(p.date) || latest.get(p.date)!.version < p.version) latest.set(p.date, p); });
    for (const p of latest.values()) next.packages.push(makePackage(p.date, policy, p.version + 1));
  };
  return {
    mode, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getSnapshot: () => snapshot,
    readPackage: id => snapshot.packages.filter(p => p.id === id).sort((a, b) => b.version - a.version)[0],
    saveDraft: (binding: Binding, response: Response) => mutate(next => {
      const pkg = next.packages.find(p => p.id === binding.workbookId && p.version === binding.workbookVersion);
      const q = pkg?.[binding.part].find(q => q.id === binding.questionId && q.version === binding.questionVersion);
      if (q && Object.keys(response).length === 1 && (("text" in response && response.text === "") || (q.kind === "multiple_choice" && "selected" in response && Array.isArray(response.selected) && response.selected.length === 0))) { delete next.drafts[responseKey(binding)]; return; }
      if (!q || !validateResponse(q, response)) throw new Error("문항 버전 또는 응답 형식이 올바르지 않습니다.");
      next.drafts[responseKey(binding)] = { binding, response, updatedAt: new Date().toISOString() };
    }),
    discardDrafts: (id, version, part) => mutate(next => { Object.entries(next.drafts).forEach(([key, d]) => { if (d.binding.workbookId === id && d.binding.workbookVersion === version && d.binding.part === part) delete next.drafts[key]; }); }),
    recordAttempt: input => mutate(next => {
      const pkg = next.packages.find(p => p.id === input.workbookId && p.version === input.workbookVersion);
      if (!pkg || validatePackage(pkg).length) throw new Error("제출할 문제집 버전을 확인할 수 없습니다.");
      const bindings = new Map(pkg[input.part].map(q => [responseKey(bindingFor(pkg, input.part, q)), q]));
      if (!input.coverage.length || new Set(input.coverage).size !== input.coverage.length || input.coverage.some(k => !bindings.has(k))) throw new Error("제출 문항 범위가 올바르지 않습니다.");
      if (input.mode === "online" && (input.coverage.some(k => !validateResponse(bindings.get(k)!, input.responses[k])) || Object.keys(input.responses).some(k => !input.coverage.includes(k)))) throw new Error("응답 형식이 올바르지 않습니다.");
      if (input.mode === "handwritten" && !input.attachments.length) throw new Error("로컬 답안 파일을 선택하세요.");
      next.attempts.push({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), simulated: true });
    }),
    readAnswerKeys: async (id: string, version: number, part: StudyPart) => {
      if (mode !== "demo") throw new Error("해설 서버가 연결되지 않았습니다.");
      const pkg = snapshot.packages.find(p => p.id === id && p.version === version);
      if (!pkg || validatePackage(pkg).length) throw new Error("문제집 스키마 오류");
      const { sampleAnswerKeys } = await import("./answers");
      return sampleAnswerKeys(pkg, part, snapshot.policies.find(p => p.version === pkg.policyVersion));
    },
    updateSource: (source: StudySource) => mutate(next => { if (!source.title.trim() || !source.scope.trim() || !Number.isFinite(source.weight) || source.weight < 0 || source.weight > 100) throw new Error("자료 설정을 확인하세요."); const i = next.sources.findIndex(s => s.id === source.id); if (i >= 0) next.sources[i] = source; }),
    addFeedback: text => mutate(next => { if (!text.trim() || text.length > 4000) throw new Error("피드백은 1~4000자로 입력하세요."); next.feedback.push({ id: crypto.randomUUID(), text: text.trim(), state: "pending_analysis", createdAt: new Date().toISOString() }); }),
    propose: change => mutate(next => { const before = next.policies.at(-1)!; next.proposals.push({ id: crypto.randomUUID(), before, after: { ...before, version: before.version + 1, effectiveWeek: future, ...(change === "format" ? { format: "case" as const } : { explanation: "intuitive" as const }), reason: change === "format" ? "객관식 3문제(5지선다) + 사례 분석 2문제" : "직관적인 비유와 실제 사례 중심 해설" }, status: "pending" }); }),
    decideProposal: (id, approve) => mutate(next => { const proposal = next.proposals.find(p => p.id === id); if (!proposal || proposal.status !== "pending") return; proposal.status = approve ? "approved" : "rejected"; if (approve) { const policy = { ...next.policies.at(-1)!, ...(proposal.before.format !== proposal.after.format ? { format: proposal.after.format } : {}), ...(proposal.before.explanation !== proposal.after.explanation ? { explanation: proposal.after.explanation } : {}), version: next.policies.at(-1)!.version + 1, effectiveWeek: future, reason: proposal.after.reason }; applyPolicy(next, policy); } }),
    rollbackPolicy: version => mutate(next => { const previous = next.policies.find(p => p.version === version); if (previous) applyPolicy(next, { ...previous, version: next.policies.at(-1)!.version + 1, effectiveWeek: future, reason: `v${version} 설정으로 복원 (새 버전)` }); }),
    configureAutomation: enabled => mutate(next => { next.automation.enabled = enabled; }),
    retryPreview: batchId => mutate(next => { const batch = next.batches.find(b => b.id === batchId); if (batch) { batch.status = "error"; batch.message = "학습 엔진 미연결 · 실제 재시도는 실행되지 않았습니다."; } }),
  };
}
export function onlineAttempt(pkg: NonNullable<ReturnType<StudyDataPort["readPackage"]>>, part: StudyPart, drafts: StudySnapshot["drafts"]): Omit<StudyAttempt, "id" | "createdAt" | "simulated"> {
  const responses = Object.fromEntries(pkg[part].flatMap(q => { const key = responseKey(bindingFor(pkg, part, q)); return drafts[key] && validateResponse(q, drafts[key].response) ? [[key, drafts[key].response]] : []; }));
  return { workbookId: pkg.id, workbookVersion: pkg.version, part, mode: "online", coverage: Object.keys(responses), responses, attachments: [], note: "로컬 샘플 제출 · 채점 없음" };
}
