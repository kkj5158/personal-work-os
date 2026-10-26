export type StudyPart = "required" | "extension";
export type QuestionKind = "single_choice" | "multiple_choice" | "true_false" | "short_answer" | "essay" | "case_analysis" | "diagram";
export type Question = {
  id: string; version: number; order: number; kind: QuestionKind; prompt: string;
  context?: string; options?: { id: string; text: string }[];
  responseSchema: "option" | "options" | "boolean" | "text" | "attachment";
  source: { materialId: string; section: string }; guidance?: string; rows?: number;
};
export type Response = { selected: string } | { selected: string[] } | { value: boolean } | { text: string };
export type DocumentRef = { workbookId: string; workbookVersion: number; kind: "question" | "answer"; state: "preview" | "ready" | "missing"; url?: string };
export type DailyStudyPackage = {
  id: string; version: number; date: string; topic: string; policyVersion: number;
  status: "published" | "preview" | "error"; required: Question[]; extension: Question[];
  questionPdf: DocumentRef; answerExplanationPdf: DocumentRef;
};
export type WeeklyStudyBatch = { id: string; start: string; end: string; status: "published" | "preview" | "error"; packageIds: string[]; message?: string };
export type StudySource = { id: string; title: string; domain: string; weight: number; included: boolean; scope: string; status: "metadata" };
export type StudyRoadmapItem = { id: string; title: string; subjectId: string; state: "current" | "upcoming" };
export type StudyPolicy = { version: number; format: "classic" | "case"; explanation: "standard" | "intuitive"; effectiveWeek: string; reason: string };
export type PolicyProposal = { id: string; before: StudyPolicy; after: StudyPolicy; status: "pending" | "approved" | "rejected" };
export type CoachFeedback = { id: string; text: string; state: "pending_analysis" | "preset_proposal"; createdAt: string };
export type Binding = { workbookId: string; workbookVersion: number; part: StudyPart; questionId: string; questionVersion: number };
export type StudyDraft = { binding: Binding; response: Response; updatedAt: string };
export type HandwrittenAttachmentMetadata = { id: string; name: string; type: string; size: number; order: number };
export type StudyAttempt = {
  id: string; workbookId: string; workbookVersion: number; part: StudyPart; mode: "online" | "handwritten";
  coverage: string[]; responses: Record<string, Response>; attachments: HandwrittenAttachmentMetadata[];
  note: string; createdAt: string; simulated: true;
};
export type StudyCompletion = { complete: boolean; covered: number; total: number; mode: "online" | "handwritten" | "hybrid" | null };
export type AnswerKey = { binding: Binding; model: string; explanation: string; rubric: string[]; incorrectReasons?: Record<string, string>; followUp: string[] };
export type StudySnapshot = {
  batches: WeeklyStudyBatch[]; packages: DailyStudyPackage[]; sources: StudySource[]; roadmap: StudyRoadmapItem[];
  policies: StudyPolicy[]; proposals: PolicyProposal[]; feedback: CoachFeedback[];
  drafts: Record<string, StudyDraft>; attempts: StudyAttempt[];
  automation: { enabled: boolean; timeLabel: "일요일 저녁 · Asia/Seoul"; connected: false };
};
export interface StudyDataPort {
  readonly mode: "demo" | "disconnected";
  subscribe(listener: () => void): () => void;
  getSnapshot(): StudySnapshot;
  readPackage(id: string): DailyStudyPackage | undefined;
  saveDraft(binding: Binding, response: Response): void;
  discardDrafts(workbookId: string, version: number, part: StudyPart): void;
  recordAttempt(input: Omit<StudyAttempt, "id" | "createdAt" | "simulated">): void;
  readAnswerKeys(workbookId: string, version: number, part: StudyPart): Promise<AnswerKey[]>;
  updateSource(source: StudySource): void;
  addFeedback(text: string): void;
  propose(change: "format" | "explanation"): void;
  decideProposal(id: string, approve: boolean): void;
  rollbackPolicy(version: number): void;
  configureAutomation(enabled: boolean): void;
  retryPreview(batchId: string): void;
}
export const responseKey = (binding: Binding) => JSON.stringify([binding.workbookId, binding.workbookVersion, binding.part, binding.questionId, binding.questionVersion]);
export const bindingFor = (pkg: DailyStudyPackage, part: StudyPart, q: Question): Binding => ({ workbookId: pkg.id, workbookVersion: pkg.version, part, questionId: q.id, questionVersion: q.version });
export const kstDate = (now = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export function addDays(date: string, days: number): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function weekStart(now = new Date()): string { const date = kstDate(now); const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return addDays(date, -((day + 6) % 7)); }
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 16000;
const positive = (value: unknown) => Number.isInteger(value) && Number(value) > 0;
const schema: Record<QuestionKind, Question["responseSchema"]> = { single_choice: "option", multiple_choice: "options", true_false: "boolean", short_answer: "text", essay: "text", case_analysis: "text", diagram: "attachment" };
export function validateQuestions(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 40) return ["문항은 1~40개여야 합니다."];
  const errors: string[] = [], ids = new Set<string>(), orders = new Set<number>();
  value.forEach((q, i) => {
    const fail = (message: string) => errors.push(`${i + 1}번 문항: ${message}`);
    if (!q || typeof q !== "object") { fail("문항 데이터가 없습니다."); return; }
    const allowed = ["id", "version", "order", "kind", "prompt", "context", "options", "responseSchema", "source", "guidance", "rows"];
    if (Object.keys(q).some(key => !allowed.includes(key))) fail("허용되지 않은 필드입니다. 정답은 별도 계약으로 전달하세요.");
    if (!text(q.id) || ids.has(q.id)) fail("문항 ID가 비었거나 중복됩니다."); ids.add(q.id);
    if (!positive(q.version) || !positive(q.order) || orders.has(q.order)) fail("버전/순서가 올바르지 않습니다."); orders.add(q.order);
    if (!text(q.prompt) || !Object.hasOwn(schema, q.kind) || schema[q.kind as QuestionKind] !== q.responseSchema) fail("알 수 없는 유형 또는 응답 스키마입니다.");
    if (!q.source || !text(q.source.materialId) || !text(q.source.section)) fail("출처 메타데이터가 없습니다.");
    if (q.kind === "case_analysis" && !text(q.context)) fail("사례 본문이 없습니다.");
    if (q.context !== undefined && !text(q.context)) fail("사례 본문 형식이 올바르지 않습니다.");
    if (q.guidance !== undefined && !text(q.guidance)) fail("작성 안내 형식이 올바르지 않습니다.");
    if (q.rows !== undefined && (!positive(q.rows) || q.rows > 30)) fail("입력 영역 크기가 올바르지 않습니다.");
    if (["single_choice", "multiple_choice"].includes(q.kind)) {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || q.options.some((o: { id?: unknown; text?: unknown }) => !o || !text(o.id) || !text(o.text) || Object.keys(o).some(k => !["id", "text"].includes(k))) || new Set(q.options.map((o: { id: string }) => o?.id)).size !== q.options.length) fail("선택지는 고유 ID와 본문을 가진 2~6개여야 합니다.");
    } else if (q.options !== undefined) fail("이 유형에는 선택지를 지정할 수 없습니다.");
  });
  return errors;
}
export function validateResponse(q: Question, response: unknown): response is Response {
  if (!response || typeof response !== "object" || Object.keys(response).length !== 1) return false;
  const r = response as Record<string, unknown>, options = q.options?.map(o => o.id) ?? [];
  switch (q.kind) {
    case "single_choice": return typeof r.selected === "string" && options.includes(r.selected);
    case "multiple_choice": return Array.isArray(r.selected) && r.selected.length > 0 && new Set(r.selected).size === r.selected.length && r.selected.every(id => typeof id === "string" && options.includes(id));
    case "true_false": return typeof r.value === "boolean";
    case "short_answer": case "essay": case "case_analysis": return text(r.text);
    default: return false;
  }
}
export function validDocumentPair(pkg: DailyStudyPackage): boolean {
  return ([pkg.questionPdf, pkg.answerExplanationPdf]).every((d, i) => d?.workbookId === pkg.id && d.workbookVersion === pkg.version && d.state === "ready" && d.kind === (i === 0 ? "question" : "answer") && typeof d.url === "string" && /^https:\/\//.test(d.url));
}
export function validatePackage(pkg: DailyStudyPackage): string[] {
  return [...(!text(pkg.id) || !positive(pkg.version) || !positive(pkg.policyVersion) || !/^\d{4}-\d{2}-\d{2}$/.test(pkg.date) || !Number.isFinite(Date.parse(pkg.date)) || new Date(pkg.date).toISOString().slice(0,10) !== pkg.date ? ["문제집 식별자/날짜/버전 오류"] : []), ...validateQuestions(pkg.required), ...validateQuestions(pkg.extension), ...(pkg.status === "published" && !validDocumentPair(pkg) ? ["게시하려면 동일 버전의 실제 문제·해설 PDF 쌍이 필요합니다."] : [])];
}
export function completion(pkg: DailyStudyPackage, part: StudyPart, attempts: StudyAttempt[]): StudyCompletion {
  const relevant = attempts.filter(a => a.workbookId === pkg.id && a.workbookVersion === pkg.version && a.part === part);
  const ids = new Set(pkg[part].map(q => responseKey(bindingFor(pkg, part, q))));
  const covered = new Set(relevant.flatMap(a => a.coverage).filter(id => ids.has(id))).size;
  const modes = new Set(relevant.map(a => a.mode));
  return { complete: covered === ids.size && ids.size > 0, covered, total: ids.size, mode: modes.size > 1 ? "hybrid" : relevant[0]?.mode ?? null };
}
export function validateFile(file: Pick<File, "name" | "type" | "size">): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
  if (!extension || !types[extension] || file.type !== types[extension]) return "JPG·PNG·PDF만 선택할 수 있습니다.";
  return file.size > 20 * 1024 * 1024 || file.size <= 0 ? "파일 크기는 0바이트 초과, 20MB 이하여야 합니다." : null;
}
