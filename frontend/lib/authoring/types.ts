export type QuestionType = "FREE_TEXT" | "SINGLE_SELECT" | "MULTI_SELECT" | "SCORE" | "CLASSIFICATION";
export type Score = { value: number | null; memo?: string };
export type Classification = { text: string; classification: string; timing?: string; memo?: string };
export type Answer = string | string[] | Score | Classification[] | null;
export type Answers = Record<string, Answer>;
export type Question = { questionKey: string; type: QuestionType; prompt: string; helperText?: string; required?: boolean; options?: string[]; metadata?: { memo?: boolean; sourceQuestionKey?: string; maxItems?: number; timing?: boolean } };
export type Section = { sectionKey: string; title: string; description?: string; questions: Question[] };
export type Program = { programKey: string; version: string; title: string; description: string; guidance?: string; sourceUrl: string; sections: Section[]; stoppingRules: string[]; completionKeys: string[]; reportSections: { title: string; questionKeys: string[] }[] };
export type ReportItem = { questionKey: string; prompt: string; type: QuestionType; value: Answer };
export type Report = { programKey: string; specVersion: string; completedAt: string; sections: { title: string; items: ReportItem[] }[]; scanSummary?: { count: number; average: number; spread: number; highest: { questionKey: string; prompt: string; value: number }[]; lowest: { questionKey: string; prompt: string; value: number }[] }; recoveryExport?: unknown };
export type SessionSummary = { id: string; programKey: string; specVersion: string; status: "IN_PROGRESS" | "COMPLETED"; currentSectionKey: string; sourceSessionId: string | null; startedAt: string; updatedAt: string; completedAt: string | null; version: number };
export type Session = SessionSummary & { definition: Program; answers: Answers; report: Report | null };
export type Draft = { answers: Answers; currentSectionKey: string };
export const sessionRoute = (session: Pick<SessionSummary, "id" | "programKey">, mode = "") => `/authoring/${session.programKey}/session/${session.id}${mode ? `/${mode}` : ""}`;
export const hasAnswer = (value: Answer | undefined): boolean => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.every(v => typeof v === "string" ? v.trim().length > 0 : v.text.trim().length > 0 && v.classification.length > 0);
  return value.value != null && value.value >= 1 && value.value <= 10;
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
