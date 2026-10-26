import { addDays, bindingFor, responseKey, weekStart, type DailyStudyPackage, type Question, type StudyPolicy, type StudySnapshot } from "./model";

const source = { materialId: "lean-startup", section: "MVP와 학습 실험 · 직접 작성한 샘플" };
const choice = (id: string, order: number, five = false): Question => ({ id, version: 1, order, kind: "single_choice", prompt: ["MVP로 먼저 확인해야 할 것은 무엇인가요?", "AI 기능을 만들기 전에 검증할 가설은 무엇인가요?", "학습 속도를 가장 잘 보여 주는 지표는 무엇인가요?", "작은 실험에서 비교 조건을 두는 이유는 무엇인가요?", "검증 결과가 예상과 다르면 무엇부터 해야 하나요?"][order - 1] ?? "다음 실험의 우선순위는 무엇인가요?", options: ["완성도 높은 기능을 모두 구현한다", "사용자 문제와 핵심 가설을 작은 실험으로 확인한다", "모델 크기를 최대한 늘린다", "경쟁 서비스의 기능 수를 따라간다", ...(five ? ["결과를 확인하지 않고 서비스를 확장한다"] : [])].map((text, i) => ({ id: String.fromCharCode(65 + i), text })), responseSchema: "option", source });
export function questions(policy: StudyPolicy, extension = false): Question[] {
  if (extension) return [
    { id: "signals", version: 1, order: 1, kind: "multiple_choice", prompt: "유효한 학습 실험의 조건을 모두 골라보세요.", options: [{ id: "A", text: "검증할 가설을 미리 정한다" }, { id: "B", text: "성공 기준을 미리 정한다" }, { id: "C", text: "유리한 결과만 기록한다" }], responseSchema: "options", source },
    { id: "hypothesis", version: 1, order: 2, kind: "true_false", prompt: "모델의 정확도가 높으면 사용자 문제도 자동으로 해결된다.", responseSchema: "boolean", source },
    { id: "mvp", version: 1, order: 3, kind: "short_answer", prompt: "최소한의 자원으로 가설을 검증하는 제품을 뜻하는 약어를 써보세요.", responseSchema: "text", source, guidance: "한 단어나 짧은 문장으로 작성하세요." },
    { id: "sketch", version: 1, order: 4, kind: "diagram", prompt: "만들기 → 측정 → 학습의 순환을 그리고 AI 기능 실험을 연결하세요.", responseSchema: "attachment", source },
  ];
  if (policy.format === "case") return [
    ...Array.from({ length: 3 }, (_, i) => choice(`choice-${i + 1}`, i + 1, true)),
    ...[1, 2].map((n): Question => ({ id: `case-${n}`, version: 1, order: n + 3, kind: "case_analysis", prompt: n === 1 ? "다음 일주일의 가장 작은 검증 실험을 설계해보세요." : "성공 지표와 중단 기준을 분리해 제안해보세요.", context: "한 팀이 고객 문의를 요약하는 AI를 만들었습니다. 요약 정확도는 높지만 상담원은 결과를 거의 사용하지 않습니다. 팀은 더 큰 모델을 도입하려 합니다.", responseSchema: "text", source, rows: 12, guidance: "가설 → 비교 조건 → 관찰할 행동 → 다음 결정 순서로 작성하세요." })),
  ];
  return [...Array.from({ length: 5 }, (_, i) => choice(`choice-${i + 1}`, i + 1)), { id: "experiment", version: 1, order: 6, kind: "essay", prompt: "지금 만들고 싶은 AI 기능을 하나 고르고, 1주일 안에 핵심 가설을 검증할 실험을 설명하세요.", responseSchema: "text", source, rows: 9, guidance: "대상 사용자, 예상 행동, 성공 지표를 포함해 5~8문장으로 작성하세요." }];
}
export function makePackage(date: string, policy: StudyPolicy, version = 1): DailyStudyPackage {
  const id = `study-${date}`;
  return { id, version, date, topic: "린 스타트업 × AI 엔지니어링", policyVersion: policy.version, status: "preview", required: questions(policy), extension: questions(policy, true), questionPdf: { workbookId: id, workbookVersion: version, kind: "question", state: "preview" }, answerExplanationPdf: { workbookId: id, workbookVersion: version, kind: "answer", state: "preview" } };
}
export function emptySnapshot(): StudySnapshot { return { batches: [], packages: [], sources: [], roadmap: [], policies: [], proposals: [], feedback: [], drafts: {}, attempts: [], automation: { enabled: false, timeLabel: "일요일 저녁 · Asia/Seoul", connected: false } }; }
export function fixtureSnapshot(now = new Date()): StudySnapshot {
  const start = weekStart(now), future = addDays(start, 7);
  const policy: StudyPolicy = { version: 1, format: "classic", explanation: "standard", effectiveWeek: start, reason: "기본 샘플 정책" };
  const packages = [-7, 0, 7].flatMap(offset => Array.from({ length: 7 }, (_, i) => makePackage(addDays(start, offset + i), policy)));
  packages[6].answerExplanationPdf.state = "missing";
  const archive = packages[0];
  const onlineCoverage = archive.required.slice(0, 5).map(q => responseKey(bindingFor(archive, "required", q)));
  const handwrittenCoverage = archive.required.slice(5).map(q => responseKey(bindingFor(archive, "required", q)));
  const date = `${archive.date}T10:00:00+09:00`;
  return { ...emptySnapshot(), packages, policies: [policy], batches: [-7, 0, 7].map(offset => ({ id: `week-${addDays(start, offset)}`, start: addDays(start, offset), end: addDays(start, offset + 6), status: "preview", packageIds: packages.filter(p => p.date >= addDays(start, offset) && p.date <= addDays(start, offset + 6)).map(p => p.id) })), sources: [
    { id: "lean-startup", title: "린 스타트업", domain: "제품·비즈니스", weight: 60, included: true, scope: "MVP · 검증된 학습 · 실험 설계", status: "metadata" },
    { id: "ai-engineering", title: "AI 엔지니어링 학습 노트", domain: "AI·개발", weight: 40, included: true, scope: "평가 · 사용자 문제 · 운영 관찰", status: "metadata" },
  ], roadmap: [{ id: "r1", title: "작은 실험과 MVP", subjectId: "lean-startup", state: "current" }, { id: "r2", title: "AI 평가와 실제 사용자 행동", subjectId: "ai-engineering", state: "upcoming" }], attempts: [
    { id: "sample-online", workbookId: archive.id, workbookVersion: 1, part: "required", mode: "online", coverage: onlineCoverage, responses: Object.fromEntries(onlineCoverage.map(k => [k, { selected: "B" }])), attachments: [], note: "과거 샘플 기록", createdAt: date, simulated: true },
    { id: "sample-handwritten", workbookId: archive.id, workbookVersion: 1, part: "required", mode: "handwritten", coverage: handwrittenCoverage, responses: {}, attachments: [{ id: "sample-file", name: "과거 수기 답안 (메타데이터만)", type: "image/png", size: 1024, order: 0 }], note: "원본 파일은 없는 샘플입니다.", createdAt: date, simulated: true },
  ], feedback: [{ id: "sample-feedback", text: "필수 15분에 객관식 5문제 + 주관식 1문제", state: "preset_proposal", createdAt: `${future}T00:00:00+09:00` }] };
}
