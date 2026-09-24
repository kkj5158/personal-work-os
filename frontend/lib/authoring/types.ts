export type QuestionType = "FREE_TEXT" | "SINGLE_SELECT" | "MULTI_SELECT" | "SCORE" | "CLASSIFICATION" | "GOALS" | "GOAL_DEEP_DIVE" | "EPOCHS" | "EXPERIENCES" | "EFFECTS" | "CRITICAL";
export type AuthoringGroup = "QUICK" | "CORE" | "TOPIC";
/** Home section order and labels; programs declare their group in their definition. */
export const authoringGroups: { group: AuthoringGroup; title: string; subtitle?: string }[] = [
  { group: "QUICK", title: "빠른 글쓰기", subtitle: "5~10분 · 지금 할 작은 행동으로 돌아가기" },
  { group: "CORE", title: "핵심 글쓰기" },
  { group: "TOPIC", title: "주제 글쓰기" },
];
export const groupTitle = (group: AuthoringGroup) => authoringGroups.find(g => g.group === group)?.title ?? group;
export type Score = { value: number | null; memo?: string };
export type Classification = { text: string; classification: string; timing?: string; memo?: string };
/** Deep-dive fields belong to 2026-09-21 goals; later definitions use one integrated `plan`. */
export type Goal = { id: string; title: string; description: string; why?: string; impact?: string; strategy?: string; obstacles?: string; benchmark?: string; plan?: string };
export type Experience = { id: string; title: string; event: string; effects: string; critical: boolean };
export type Epoch = { id: string; title: string; experiences: Experience[] };
export type Answer = string | string[] | Score | Classification[] | Goal[] | Epoch[] | null;
export type Answers = Record<string, Answer>;
export type Question = { questionKey: string; type: QuestionType; prompt: string; helperText?: string; required?: boolean; options?: string[]; metadata?: { memo?: boolean; sourceQuestionKey?: string; maxItems?: number; minItems?: number; timing?: boolean; rows?: number; group?: string; gate?: boolean; context?: boolean; placeholder?: string; recommendation?: string; requiredFields?: string[]; plan?: boolean; planGuides?: string[]; itemPrompt?: string; itemHelp?: string; [key: string]: unknown } };
export type Section = { sectionKey: string; title: string; description?: string; questions: Question[]; prompt?: string | null };
export type Program = { programKey: string; version: string; group: AuthoringGroup; title: string; subtitle?: string | null; reportTitle?: string | null; description: string; guidance?: string; sourceUrl: string; sections: Section[]; stoppingRules: string[]; completionKeys: string[]; reportSections: { title: string; questionKeys: string[] }[] };
export type ReportItem = { questionKey: string; prompt: string; type: QuestionType; value: Answer };
export type Report = { programKey: string; specVersion: string; completedAt: string; sections: { title: string; items: ReportItem[] }[]; scanSummary?: { count: number; average: number; spread: number; highest: { questionKey: string; prompt: string; value: number }[]; lowest: { questionKey: string; prompt: string; value: number }[] }; source?: { id: string; programKey: string; completedAt: string; specVersion: string }; recoveryExport?: unknown };
export type SessionSummary = { id: string; programKey: string; specVersion: string; status: "IN_PROGRESS" | "COMPLETED"; currentSectionKey: string; sourceSessionId: string | null; startedAt: string; updatedAt: string; completedAt: string | null; version: number; title?: string | null; memo?: string | null };
export type Session = SessionSummary & { definition: Program; answers: Answers; report: Report | null; programTitle?: string | null };
/** Today's display name; a session's frozen definition may carry an older title. */
export const programTitle = (session: Pick<Session, "programTitle" | "definition">) => session.programTitle || session.definition.title;
export type Draft = { answers: Answers; currentSectionKey: string; title?: string | null; memo?: string | null };
export const sessionRoute = (session: Pick<SessionSummary, "id" | "programKey">, mode = "") => `/authoring/${session.programKey}/session/${session.id}${mode ? `/${mode}` : ""}`;
export const hasAnswer = (value: Answer | undefined): boolean => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.every(v => typeof v === "string" ? v.trim().length > 0 : "title" in v ? v.title.trim().length > 0 : v.text.trim().length > 0 && v.classification.length > 0);
  return value.value != null && value.value >= 1 && value.value <= 10;
};
export const virtualTypes: QuestionType[] = ["GOAL_DEEP_DIVE", "EXPERIENCES", "EFFECTS", "CRITICAL"];
export const answerKey = (q: Question) => virtualTypes.includes(q.type) ? q.metadata?.sourceQuestionKey ?? q.questionKey : q.questionKey;
export const answerFor = (q: Question, answers: Answers) => answers[answerKey(q)];
export function questionComplete(q: Question, answers: Answers): boolean {
  const value = answerFor(q, answers);
  if (q.type === "GOALS" || q.type === "GOAL_DEEP_DIVE") {
    const goals = (value ?? []) as Goal[];
    // Definitions without limits keep the original 6–8 goal rules.
    const min = q.metadata?.minItems ?? 6, max = q.metadata?.maxItems ?? 8;
    const fields = (q.type === "GOALS" ? q.metadata?.requiredFields ?? ["title", "description"] : ["why", "impact", "strategy", "obstacles", "benchmark"]) as (keyof Goal)[];
    return goals.length >= min && goals.length <= max && goals.every(g => fields.every(k => !!String(g[k] ?? "").trim()));
  }
  if (["EPOCHS","EXPERIENCES","EFFECTS","CRITICAL"].includes(q.type)) {
    const epochs = (value ?? []) as Epoch[];
    if (q.type === "EPOCHS") return epochs.length === 7 && epochs.every(e => !!e.title?.trim());
    if (q.type === "EXPERIENCES") return epochs.length === 7 && epochs.every(e => e.experiences.length >= 1 && e.experiences.length <= 6 && e.experiences.every(x => !!x.title?.trim() && !!x.event?.trim()));
    if (epochs.length !== 7 || epochs.some(e => !e.experiences.length)) return false;
    const experiences = epochs.flatMap(e => e.experiences);
    if (q.type === "EFFECTS") return experiences.length > 0 && experiences.every(e => !!e.effects?.trim());
    const count = experiences.filter(e => e.critical).length;
    return count > 0 && count <= 10;
  }
  return hasAnswer(value);
}
/** A first section holding a gate question is a preparation step, not a numbered writing section. */
export const hasPreparation = (program: Program) => !!program.sections[0]?.questions.some(q => q.metadata?.gate);
export const sectionLabel = (program: Program, index: number) => hasPreparation(program) ? (index === 0 ? "준비" : String(index).padStart(2, "0")) : String(index + 1).padStart(2, "0");
export const sectionProgress = (program: Program, index: number) => hasPreparation(program) ? (index === 0 ? "준비" : `${String(index).padStart(2, "0")} / ${program.sections.length - 1}`) : `${String(index + 1).padStart(2, "0")} / ${program.sections.length}`;
export const gateMissing = (program: Program, answers: Answers) => hasPreparation(program) && program.sections[0].questions.some(q => q.metadata?.gate && !hasAnswer(answerFor(q, answers)));
export const contextAnswer = (program: Program, answers: Answers) => {
  const question = program.sections.flatMap(s => s.questions).find(q => q.metadata?.context);
  const value = question ? answerFor(question, answers) : undefined;
  return question && typeof value === "string" && value.trim() ? { label: question.prompt, value } : null;
};
export function scanSummary(program: Program, answers: Answers) {
  const section = program.sections.find(s => s.sectionKey === "scan");
  const scores = (section?.questions ?? []).filter(q => q.type === "SCORE").flatMap(q => {
    const a = answers[q.questionKey] as Score | undefined;
    return a?.value == null ? [] : [{ title: q.prompt, value: a.value }];
  });
  if (!scores.length) return null;
  const sorted = [...scores].sort((a, b) => b.value - a.value);
  return { count: scores.length, total: section?.questions.filter(q => q.type === "SCORE").length ?? 0, average: scores.reduce((sum, s) => sum + s.value, 0) / scores.length, high: sorted.slice(0, 3), low: [...scores].sort((a,b) => a.value-b.value).slice(0, 3), spread: sorted[0].value - sorted.at(-1)!.value };
}
