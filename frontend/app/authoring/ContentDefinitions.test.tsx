import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionField, AnswerValue } from "./QuestionField";
import { ReportDocument, SessionDocument } from "./SessionDocument";
import { emptyEpochs } from "./StructuredWriting";
import { hasAnswer, questionComplete, sectionComplete, sectionLabel, sectionProgress, sectionTitle, type Goal, type Identity, type Program, type Question, type Session } from "@/lib/authoring/types";

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

test("반복하고 싶은 현재와 도달하고 싶은 미래 numbers seven parts, keeps one editor per stage and reports all five identities verbatim", () => {
  const program = definition("present-future-identity", "2026-10-01");
  assert.equal(program.group, "TOPIC");
  assert.deepEqual(program.sections.map((_, i) => sectionLabel(program, i)), ["01", "02", "03", "04-1", "04-2", "04-3", "04-4", "04-5", "05-A", "05-B", "05-C", "06-A", "06-B", "06-C", "07"]);
  assert.equal(sectionProgress(program, 0), "01 / 07");
  assert.equal(sectionProgress(program, 3), "04-1 / 07");
  assert.equal(sectionProgress(program, 14), "07 / 07");
  // Existing programs keep their positional numbering.
  assert.equal(sectionProgress(definition("present-life"), 6), "07 / 7");
  const textareas = (q: Question, value?: Identity[]) => (renderToStaticMarkup(<QuestionField question={q} value={value} answers={{}} change={() => {}} />).match(/<textarea/g) ?? []).length;
  // Guide bullets are never inputs: every free-writing stage has exactly one large editor.
  for (const key of ["present", "together", "conflicts", "foundation", "focus", "firstScene", "check", "finalWriting"]) {
    const q = question(program, key);
    assert.equal(textareas(q), 1, key);
    assert.ok((q.helperText!.match(/^- /gm) ?? []).length >= 3, key);
    assert.equal(program.sections.find(s => s.questions.includes(q))!.questions.length, 1, key);
  }
  assert.match(renderToStaticMarkup(<QuestionField question={question(program, "finalWriting")} value="" answers={{}} change={() => {}} />), /rows="24"/);
  const sustain = program.sections[1];
  assert.deepEqual(sustain.questions.map(q => !!q.metadata?.omitWhenEmpty), [false, true, true, true]);
  assert.equal(sectionComplete(sustain, { sustain: "이어져야 할 것" }), true, "optional compact values never hold a stage back");
  assert.equal(sectionComplete(definition("present-life").sections[2], { minimumEffort: "잠" }), true);
  assert.equal(sectionComplete(sustain, {}), false);

  const identities: Identity[] = Array.from({ length: 5 }, (_, i) => ({ id: `identity-${i + 1}`, name: `이름${i + 1}`, meaning: `의미${i + 1}`, description: `묘사${i + 1}\n둘째 줄`, effort: `노력${i + 1}`, strategy: `전략${i + 1}`, adjustment: i === 4 ? "" : `조정${i + 1}` }));
  assert.equal(textareas(question(program, "identities"), identities), 0);
  assert.equal(hasAnswer(identities), true);
  assert.equal(hasAnswer(identities.map((x, i) => i ? x : { ...x, name: " " })), false);
  for (let i = 0; i < 5; i++) {
    const stage = program.sections[3 + i], q = stage.questions[0];
    assert.equal(stage.questions.length, 1);
    assert.equal(sectionTitle(stage, { identities }), `정체성 ${i + 1} · 이름${i + 1}`);
    assert.equal(sectionTitle(stage, {}), `정체성 ${i + 1}`);
    const html = renderToStaticMarkup(<QuestionField question={q} value={identities} answers={{ identities }} change={() => {}} />);
    assert.equal((html.match(/<textarea/g) ?? []).length, 4, "description, effort, strategy and adjustment");
    assert.match(html, new RegExp(`value="이름${i + 1}"`), "the identity name stays visible while writing");
    for (const title of ["A. 이 정체성으로 살아가는 나", "B. 의식적으로 노력해야 할 포인트", "C. 전략과 반복", "D. 흔들릴 때의 조정"]) assert.ok(html.includes(title), title);
    assert.match(html, new RegExp(`묘사${i + 1}`));
    for (let other = 0; other < 5; other++) if (other !== i) assert.doesNotMatch(html, new RegExp(`묘사${other + 1}|노력${other + 1}`));
    assert.equal(questionComplete(q, { identities }), i !== 4);
  }

  // The report is the stored snapshot: every identity with its raw text, in authored order, and nothing invented.
  const item = (key: string, value: unknown) => ({ questionKey: key, prompt: question(program, key).prompt, type: question(program, key).type, value });
  const report = { programKey: program.programKey, specVersion: program.version, completedAt: "2026-10-01T00:00:00Z", sections: program.reportSections.map(section => ({ title: section.title,
    items: section.questionKeys.map(key => item(key, key.startsWith("identities.") ? identities : key === "present" ? "저녁 산책\n\n아직 모르겠다" : key === "finalWriting" ? "마지막 글" : null)) })) } as Session["report"];
  const rendered = renderToStaticMarkup(<ReportDocument session={{ programKey: program.programKey, specVersion: program.version, definition: program, answers: {}, report } as unknown as Session} />);
  const order = ["반복하고 싶은 현재", "현재를 지탱하는 반복", "나의 다섯 가지 미래 정체성", "이름1", "묘사1", "노력1", "전략1", "조정1", "이름2", "이름5", "전략5", "다섯 모습을 한 사람의 삶으로", "지금부터 실제로 살아볼 변화", "내가 계속 살아가고 싶은 삶", "마지막 글"];
  assert.deepEqual(order.map(text => rendered.indexOf(`>${text}`)).filter(i => i < 0), [], "every heading and raw value is present");
  assert.deepEqual(order.map(text => rendered.indexOf(`>${text}`)), [...order.map(text => rendered.indexOf(`>${text}`))].sort((a, b) => a - b), "in authored order");
  assert.match(rendered, /묘사3\n둘째 줄/, "long writing is kept verbatim, not summarized");
  assert.doesNotMatch(rendered, /계속 누리고 싶은 것|그 삶을 지탱하는 반복<|현재에서 바꾸고 싶은 것/, "unwritten optional values are omitted, not filled in");
  assert.doesNotMatch(rendered, /점수|score/i);
  const full = renderToStaticMarkup(<SessionDocument session={{ definition: program, answers: { identities, present: "저녁 산책" } } as unknown as Session} />);
  assert.match(full, /04-3\. 정체성 3 · 이름3/);
  assert.match(full, /조정4/);
});
