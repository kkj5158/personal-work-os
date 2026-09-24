import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionField, AnswerValue } from "./QuestionField";
import { ReportDocument, SessionDocument } from "./SessionDocument";
import { emptyEpochs } from "./StructuredWriting";
import { questionComplete, type Goal, type Program, type Question, type Session } from "@/lib/authoring/types";

const definition = (key: string, version = "2026-09-24") =>
  JSON.parse(readFileSync(`../backend/src/main/resources/authoring/${key}/${version}.json`, "utf8")) as Program;
const question = (program: Program, key: string) => program.sections.flatMap(s => s.questions).find(q => q.questionKey === key)!;
const goal = (patch: Partial<Goal>): Goal => ({ id: crypto.randomUUID(), title: "", description: "", ...patch });

test("New future goals need only a title, use one plan editor, and allow one to five goals", () => {
  const goals = question(definition("grounded-future"), "goals");
  assert.equal(questionComplete(goals, { goals: [goal({ title: "생활비 마련" })] }), true);
  assert.equal(questionComplete(goals, { goals: [goal({ title: " " })] }), false);
  assert.equal(questionComplete(goals, { goals: Array.from({ length: 6 }, (_, i) => goal({ title: `G${i}` })) }), false);
  const html = renderToStaticMarkup(<QuestionField question={goals} value={[goal({ title: "생활비 마련", plan: "계획 원문" })]} answers={{}} change={() => {}} />);
  assert.equal((html.match(/<textarea/g) ?? []).length, 2, "description + one integrated plan");
  for (const guide of goals.metadata!.planGuides!) assert.ok(html.includes(guide));
  assert.match(html, /3~5개 권장/);
  assert.doesNotMatch(html, /WHY|IMPACT|STRATEGY|OBSTACLES|BENCHMARK/);
  assert.match(renderToStaticMarkup(<AnswerValue type="GOALS" value={[goal({ title: "생활비 마련", plan: "계획 원문" })]} />), /계획 원문/);
});

test("Legacy future goals keep their 6–8 deep-dive rules", () => {
  const legacy = question(definition("grounded-future", "2026-09-21"), "goals");
  const full = (i: number) => goal({ title: `G${i}`, description: "d" });
  assert.equal(questionComplete(legacy, { goals: Array.from({ length: 6 }, (_, i) => full(i)) }), true);
  assert.equal(questionComplete(legacy, { goals: [full(0)] }), false);
});

test("New Past wording comes from the definition while the original stays for legacy sessions", () => {
  const epochs = emptyEpochs().map((e, i) => ({ ...e, title: `E${i}`, experiences: [{ id: `x${i}`, title: "경험", event: "사건", effects: "영향", critical: false }] }));
  const current = renderToStaticMarkup(<QuestionField question={question(definition("past"), "past.effects")} value={epochs} answers={{}} change={() => {}} />);
  assert.match(current, /이 경험 이후 달라진 것/);
  assert.doesNotMatch(current, /이 경험은 당신의 삶을 어떻게 형성했고/);
  const legacy = renderToStaticMarkup(<QuestionField question={question(definition("past", "2026-09-21"), "past.effects")} value={epochs} answers={{}} change={() => {}} />);
  assert.match(legacy, /이 경험은 당신의 삶을 어떻게 형성했고/);
  const critical = question(definition("past"), "past.critical") as Question;
  assert.equal(questionComplete(critical, { epochs }), false, "selection stays optional because it is not a completion key");
  assert.deepEqual(definition("past").completionKeys, ["epochs"]);
});

test("Decision stages show their main question once above labelled decision fields", () => {
  const reality = definition("reality");
  const html = renderToStaticMarkup(<SessionDocument session={{ definition: reality, answers: { "decision.keep": "산책" } } as unknown as Session} />);
  assert.equal(html.split("앞에서 살펴본 생활을 바탕으로, 앞으로 한동안 무엇을 유지하고 무엇을 바꾸겠나요?").length - 1, 1);
  for (const label of ["계속 지킬 것", "바꿀 방식", "그만둘 것", "시험해볼 것"]) assert.ok(html.includes(label));
  assert.match(html, /산책/);
});

test("지금의 삶을 누리기 keeps one long contemplation editor and omits unwritten optional values from its report", () => {
  const program = definition("present-life");
  const stay = question(program, "stay");
  const html = renderToStaticMarkup(<QuestionField question={stay} value="" answers={{}} change={() => {}} />);
  assert.equal((html.match(/<textarea/g) ?? []).length, 1, "ten contemplation prompts stay guide text, not inputs");
  assert.match(html, /rows="24"/);
  assert.equal((stay.helperText!.match(/^- /gm) ?? []).length, 10);
  const report = { programKey: "present-life", specVersion: program.version, completedAt: "2026-09-24T00:00:00Z", sections: [
    { title: "이 삶을 지탱하는 최소한의 노력", items: [
      { questionKey: "minimumEffort", prompt: question(program, "minimumEffort").prompt, type: "FREE_TEXT", value: "잠을 충분히 잔다" },
      { questionKey: "minimumEffort.actions", prompt: "최소 유지 행동", type: "FREE_TEXT", value: null }] },
    { title: "묵상을 마치며", items: [{ questionKey: "closing.scene", prompt: "더 자주 알아차리고 싶은 한 장면", type: "FREE_TEXT", value: null }] },
  ] } as Session["report"];
  const rendered = renderToStaticMarkup(<ReportDocument session={{ programKey: "present-life", specVersion: program.version, definition: program, answers: {}, report } as unknown as Session} />);
  assert.match(rendered, /잠을 충분히 잔다/);
  assert.doesNotMatch(rendered, /최소 유지 행동/, "empty optional compact value is not shown or invented");
  assert.match(rendered, /더 자주 알아차리고 싶은 한 장면/, "closing fields stay visible even when empty");
});
