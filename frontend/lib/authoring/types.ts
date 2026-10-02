export type QuestionType = "FREE_TEXT" | "SINGLE_SELECT" | "MULTI_SELECT" | "SCORE" | "CLASSIFICATION" | "GOALS" | "GOAL_DEEP_DIVE" | "EPOCHS" | "EXPERIENCES" | "EFFECTS" | "CRITICAL" | "IDENTITIES" | "IDENTITY_WRITING" | "FIELD_ROWS";
export type AuthoringGroup = "QUICK" | "CORE" | "TOPIC";
/** Home section order and labels; programs declare their group in their definition. `cue`/`summary` are Library shelf presentation. */
export const authoringGroups: { group: AuthoringGroup; title: string; subtitle?: string; cue: string; summary: string }[] = [
  { group: "QUICK", title: "빠른 글쓰기", subtitle: "5~10분 · 지금 할 작은 행동으로 돌아가기", cue: "⚡", summary: "짧게 쓰고 바로 할 첫 행동으로 돌아간 기록" },
  { group: "CORE", title: "핵심 글쓰기", cue: "🧭", summary: "삶의 중심, 현재, 앞으로의 방향과 지나온 시간을 정리한 기록" },
  { group: "TOPIC", title: "주제 글쓰기", cue: "🎯", summary: "특정 삶의 주제를 깊게 다룬 기록" },
];
export const groupTitle = (group: AuthoringGroup) => authoringGroups.find(g => g.group === group)?.title ?? group;
/** Decorative program cue, keyed by the stable program key (presentation only — never part of a definition). */
export const programEmoji: Record<string, string> = {
  "quick-motivation": "⚡", recovery: "❤️", reality: "🔎", "present-life": "🌿", "grounded-future": "🗺️",
  past: "🕰️", review: "🧭", "sexual-pattern": "🛡️", responsibility: "🏗️", "present-future-identity": "👣",
  "earning-a-living": "💰",
};
export const programCue = (programKey: string) => programEmoji[programKey] ?? "📝";
export type Score = { value: number | null; memo?: string };
export type Classification = { text: string; classification: string; timing?: string; memo?: string };
/** Deep-dive fields belong to 2026-09-21 goals; later definitions use one integrated `plan`. */
export type Goal = { id: string; title: string; description: string; why?: string; impact?: string; strategy?: string; obstacles?: string; benchmark?: string; plan?: string };
export type Experience = { id: string; title: string; event: string; effects: string; critical: boolean };
export type Epoch = { id: string; title: string; experiences: Experience[] };
/** One of a fixed set of identity slots; the four writing fields are edited on that identity's own stage. */
export type Identity = { id: string; name: string; meaning?: string; description?: string; effort?: string; strategy?: string; adjustment?: string };
export type IdentityPart = { key: "description" | "effort" | "strategy" | "adjustment"; title: string; prompt: string; guides?: string[]; rows?: number };
/** A fixed row declared by the definition (`metadata.items`) holding optional free-text fields (`metadata.fields`). */
export type FieldRow = { id: string; [field: string]: string | undefined };
export type FieldRowItem = { id: string; title: string };
export type FieldRowField = { key: string; label: string; optional?: boolean; rows?: number };
export const fieldRowWritten = (row: FieldRow) => Object.entries(row).some(([key, text]) => key !== "id" && !!text?.trim());
export type Answer = string | string[] | Score | Classification[] | Goal[] | Epoch[] | Identity[] | FieldRow[] | null;
export type Answers = Record<string, Answer>;
export type Question = { questionKey: string; type: QuestionType; prompt: string; helperText?: string; required?: boolean; options?: string[]; metadata?: { memo?: boolean; sourceQuestionKey?: string; maxItems?: number; minItems?: number; timing?: boolean; rows?: number; group?: string; gate?: boolean; context?: boolean; placeholder?: string; recommendation?: string; requiredFields?: string[]; plan?: boolean; planGuides?: string[]; itemPrompt?: string; itemHelp?: string; omitWhenEmpty?: boolean; count?: number; index?: number; parts?: IdentityPart[]; items?: FieldRowItem[]; fields?: FieldRowField[]; [key: string]: unknown } };
/** `label` replaces the positional stage number (e.g. "04-1"); `part` names the stage group shown above it. */
export type Section = { sectionKey: string; title: string; description?: string; questions: Question[]; prompt?: string | null; label?: string | null; part?: string | null };
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
  // Field rows are judged by `questionComplete`; a row reaching this fallback simply counts as unwritten.
  if (Array.isArray(value)) return value.length > 0 && (value as (string | Goal | Epoch | Identity | Classification)[]).every(v => typeof v === "string" ? v.trim().length > 0 : "title" in v ? v.title.trim().length > 0 : "name" in v ? v.name.trim().length > 0 : !!v.text?.trim() && !!v.classification?.length);
  return value.value != null && value.value >= 1 && value.value <= 10;
};
export const virtualTypes: QuestionType[] = ["GOAL_DEEP_DIVE", "EXPERIENCES", "EFFECTS", "CRITICAL", "IDENTITY_WRITING"];
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
  if (q.type === "IDENTITY_WRITING") {
    const identity = ((value ?? []) as Identity[])[q.metadata?.index ?? 0];
    return !!identity && (q.metadata?.parts ?? []).every(part => !!identity[part.key]?.trim());
  }
  // Every row and field is optional, so one written field is enough to mark the stage.
  if (q.type === "FIELD_ROWS") return ((value ?? []) as FieldRow[]).some(fieldRowWritten);
  return hasAnswer(value);
}
/** A stage is marked written by its main writing; optional compact values never hold the mark back. */
export const sectionComplete = (section: Section, answers: Answers) => {
  const main = section.questions.filter(q => !q.metadata?.omitWhenEmpty);
  return section.questions.length > 0 && (main.length ? main : section.questions).every(q => questionComplete(q, answers));
};
/** An identity stage shows the name the writer gave that identity. */
export const sectionTitle = (section: Section, answers: Answers) => {
  const q = section.questions.find(q => q.type === "IDENTITY_WRITING");
  const name = q && ((answerFor(q, answers) ?? []) as Identity[])[q.metadata?.index ?? 0]?.name?.trim();
  return name ? `${section.title} · ${name}` : section.title;
};
/** A first section holding a gate question is a preparation step, not a numbered writing section. */
export const hasPreparation = (program: Program) => !!program.sections[0]?.questions.some(q => q.metadata?.gate);
export const sectionLabel = (program: Program, index: number) => program.sections[index]?.label ? program.sections[index].label! : hasPreparation(program) ? (index === 0 ? "준비" : String(index).padStart(2, "0")) : String(index + 1).padStart(2, "0");
export const sectionProgress = (program: Program, index: number) => program.sections[index]?.label ? `${program.sections[index].label} / ${(program.sections.at(-1)!.label ?? "").split("-")[0]}` : hasPreparation(program) ? (index === 0 ? "준비" : `${String(index).padStart(2, "0")} / ${program.sections.length - 1}`) : `${String(index + 1).padStart(2, "0")} / ${program.sections.length}`;
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
