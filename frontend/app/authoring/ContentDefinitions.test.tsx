import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionField, AnswerValue } from "./QuestionField";
import { ReportDocument, SessionDocument } from "./SessionDocument";
import { emptyEpochs } from "./StructuredWriting";
import { hasAnswer, questionComplete, sectionComplete, sectionLabel, sectionProgress, sectionTitle, type FieldRow, type Goal, type Identity, type Program, type Question, type Session } from "@/lib/authoring/types";

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

test("돈을 벌며 살아가는 방식 keeps one editor per stage, three optional income levels and a report made only of authored values", () => {
  const program = definition("earning-a-living", "2026-10-02");
  assert.equal(program.group, "TOPIC");
  assert.equal(program.title, "돈을 벌며 살아가는 방식");
  assert.equal(program.reportTitle, "돈을 벌며 살아가는 방식");
  assert.deepEqual(program.sections.map(s => s.title), ["돈이 내 삶에서 해주었으면 하는 일", "지금까지의 돈벌이에서 알게 된 것", "지금 나는 어떻게 돈을 벌고 있는가",
    "나에게 어느 정도의 수입이 필요한가", "나는 무엇으로 돈을 벌 수 있는가", "나는 어떤 방식으로 일해야 오래 이어갈 수 있는가", "지금 생활을 지탱할 일과 앞으로 키울 일", "돈을 벌면서도 지키고 싶은 것", "지금부터 해볼 것"]);
  assert.deepEqual(program.sections.map((_, i) => sectionLabel(program, i)), ["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
  assert.equal(sectionProgress(program, 3), "04 / 9");
  const render = (q: Question, value?: FieldRow[] | string) => renderToStaticMarkup(<QuestionField question={q} value={value} answers={{}} change={() => {}} />);
  const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
  // Guide bullets are never inputs: each free-writing stage is one wide editor under its main question and guide.
  for (const key of ["moneyRole", "learned", "currentIncome", "offer", "sustainable", "protect"]) {
    const q = question(program, key), html = render(q, "");
    assert.equal(count(html, "textarea"), 1, key);
    assert.equal(count(html, "input"), 0, key);
    assert.equal(program.sections.find(s => s.questions.includes(q))!.questions.length, 1, key);
    assert.ok(html.includes(q.helperText!.split("\n")[0]), key);
  }
  assert.match(render(question(program, "learned"), ""), /&quot;저는 원래 일을 꾸준히 못 하는 사람입니다.&quot;/);
  assert.doesNotMatch(JSON.stringify(program), /점수|score|ledger|예산/i);

  // 04: three fixed levels, each with an optional amount, a reason and an optional note of what to check.
  const needs = question(program, "incomeNeeds");
  const blank = render(needs);
  assert.deepEqual(blank.match(/<h3>[^<]+<\/h3>/g), ["<h3>최소 유지</h3>", "<h3>자립과 안정</h3>", "<h3>선택의 폭</h3>"]);
  assert.equal(count(blank, "input"), 3, "one amount input per level");
  assert.equal(count(blank, "textarea"), 6, "reason and what-to-check per level");
  assert.equal(blank.split("월 기준 금액 (선택)").length - 1, 3);
  assert.equal(blank.split("이 정도가 필요한 이유<").length - 1, 3);
  assert.equal(blank.split("아직 확인할 것 (선택)").length - 1, 3);
  assert.doesNotMatch(blank, /type="number"|required|placeholder/, "amounts are free text and nothing is suggested or required");
  assert.ok(blank.includes("현재의 휴식이나 즐거움도 실제로 삶을 유지하는 데 필요한 비용일 수 있습니다."));
  const levels: FieldRow[] = [{ id: "minimum", amount: "약 150~180만 원", reason: "월세와 식비\n둘째 줄", check: "확인 필요" }, { id: "stability", reason: "", amount: " " }, { id: "choice" }];
  const filled = render(needs, levels);
  assert.match(filled, /value="약 150~180만 원"/);
  assert.match(filled, /월세와 식비\n둘째 줄<\/textarea>/);
  const stage = program.sections[3];
  assert.equal(sectionComplete(stage, {}), false);
  assert.equal(sectionComplete(stage, { incomeNeeds: [{ id: "minimum" }, { id: "stability", amount: " " }, { id: "choice" }] }), false, "untouched rows are not writing");
  assert.equal(sectionComplete(stage, { incomeNeeds: [{ id: "choice", check: "실제 생활비를 먼저 확인해야 합니다." }] }), true, "one written field marks the stage");
  assert.equal(hasAnswer(levels), false, "field rows never crash or pass the generic check");

  // 07: one main question and guide above two clearly separated editors.
  const paths = program.sections[6];
  assert.deepEqual(paths.questions.map(q => q.prompt), ["현재 생활을 지탱할 소득", "앞으로 키워갈 경로"]);
  const full = renderToStaticMarkup(<SessionDocument session={{ definition: program, answers: { incomeNeeds: levels, support: "지금 근무를 이어간다", growth: "외주 시험" } } as unknown as Session} />);
  assert.equal(full.split("앞으로 한동안은 무엇으로 생활비를 벌고,").length - 1, 1, "the main question appears once");
  assert.equal(full.split("아직 여러 방향을 탐색해보기").length - 1, 1);
  for (const q of paths.questions) { assert.equal(count(render(q, ""), "textarea"), 1); assert.equal((q.helperText!.match(/^- /gm) ?? []).length, 3); }
  assert.equal(sectionComplete(paths, { support: "근무" }), false);
  assert.equal(sectionComplete(paths, { support: "근무", growth: "아직 여러 방향을 탐색 중" }), true);
  assert.match(full, /04\. 나에게 어느 정도의 수입이 필요한가/);
  assert.match(full, /09\. 지금부터 해볼 것/);
  assert.match(full, /약 150~180만 원/);

  // Close: three light fields, none required.
  assert.deepEqual(program.sections[8].questions.map(q => q.prompt), ["지금의 수입을 안정시키기 위해 할 일", "앞으로의 가능성을 확인하기 위해 해볼 일", "다시 돌아볼 시점"]);
  assert.deepEqual(program.completionKeys, []);
  assert.equal(program.sections.flatMap(s => s.questions).some(q => q.required), false);

  // The report is the stored snapshot: authored text in order, written levels and fields only, nothing invented.
  const authored: Record<string, unknown> = { moneyRole: "월세를 직접 내고 싶다\n\n아직 잘 모르겠습니다.", incomeNeeds: levels, support: "지금 근무를 이어간다", growth: "외주 시험", "close.stabilize": "근무표 확인" };
  const report = { programKey: program.programKey, specVersion: program.version, completedAt: "2026-10-02T00:00:00Z", sections: program.reportSections.map(section => ({ title: section.title,
    items: section.questionKeys.map(key => ({ questionKey: key, prompt: question(program, key).prompt, type: question(program, key).type, value: authored[key] ?? null })) })) } as Session["report"];
  const rendered = renderToStaticMarkup(<ReportDocument session={{ programKey: program.programKey, specVersion: program.version, definition: program, answers: {}, report } as unknown as Session} />);
  const order = ["돈이 내 삶에서 해주었으면 하는 일", "월세를 직접 내고 싶다", "지금까지의 돈벌이에서 알게 된 것", "지금 나는 어떻게 돈을 벌고 있는가", "나에게 어느 정도의 수입이 필요한가", "최소 유지", "월 기준 금액", "약 150~180만 원", "이 정도가 필요한 이유", "월세와 식비", "아직 확인할 것", "확인 필요",
    "나는 무엇으로 돈을 벌 수 있는가", "나는 어떤 방식으로 일해야 오래 이어갈 수 있는가", "지금 생활을 지탱할 일과 앞으로 키울 일", "현재 생활을 지탱할 소득", "지금 근무를 이어간다", "앞으로 키워갈 경로", "외주 시험", "돈을 벌면서도 지키고 싶은 것", "지금부터 해볼 것",
    "지금의 수입을 안정시키기 위해 할 일", "근무표 확인", "앞으로의 가능성을 확인하기 위해 해볼 일", "다시 돌아볼 시점"];
  const positions = order.map(text => rendered.indexOf(`>${text}`));
  assert.deepEqual(order.filter((_, i) => positions[i] < 0), [], "every heading and authored value is present");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "in authored order");
  assert.match(rendered, /월세를 직접 내고 싶다\n\n아직 잘 모르겠습니다\./, "long writing is kept verbatim");
  assert.doesNotMatch(rendered, /자립과 안정|선택의 폭/, "levels that were not written are left out");
  assert.equal(rendered.split("월 기준 금액").length - 1, 1, "only the written amount is shown");
  for (const title of program.reportSections.map(s => s.title)) assert.equal(rendered.split(`<h2>${title}</h2>`).length - 1, 1, title);
  assert.equal(rendered.split("근무표 확인").length - 1, 1, "authored text is not duplicated");
  assert.doesNotMatch(rendered, /점수|score|요약|합계|NaN|undefined/i);
  const emptyNeeds = renderToStaticMarkup(<ReportDocument session={{ programKey: program.programKey, specVersion: program.version, definition: program, answers: {},
    report: { ...report!, sections: [{ title: "나에게 어느 정도의 수입이 필요한가", items: [{ questionKey: "incomeNeeds", prompt: needs.prompt, type: "FIELD_ROWS", value: [{ id: "minimum" }, { id: "stability" }, { id: "choice" }] }] }] } } as unknown as Session} />);
  assert.match(emptyNeeds, /아직 작성하지 않음/);
  assert.doesNotMatch(emptyNeeds, /최소 유지|월 기준 금액/);
});

test("나의 성향과 커리어 keeps one editor per stage, an optional three-field close and a report made only of authored text", () => {
  const program = definition("career-temperament", "2026-10-11");
  assert.equal(program.group, "TOPIC");
  assert.equal(program.title, "나의 성향과 커리어");
  assert.equal(program.subtitle, "나에게 맞는 일에서, 건강하게 오래 깊어지기");
  assert.equal(program.reportTitle, "나의 성향과 커리어");
  const titles = ["일하고 배울 때 드러나는 나", "내가 깊어질 수 있는 것", "나를 흔드는 것과 지켜야 할 조건", "내가 원하는 탁월함", "나에게 맞는 일의 형태", "실력을 쌓아가는 방식", "다음 걸음과 다시 볼 시점"];
  assert.deepEqual(program.sections.map(s => s.title), titles);
  assert.deepEqual(program.reportSections.map(s => s.title), titles);
  assert.deepEqual(program.sections.map((_, i) => sectionLabel(program, i)), ["01", "02", "03", "04", "05", "06", "07"]);
  assert.equal(sectionProgress(program, 2), "03 / 7");
  const render = (q: Question, value = "") => renderToStaticMarkup(<QuestionField question={q} value={value} answers={{}} change={() => {}} />);
  const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
  const stages = ["workSelf", "strengths", "conditions", "excellence", "workShape", "practice"];
  // Guide bullets are never inputs: each stage is one wide editor under its main question and guide.
  stages.forEach((key, i) => {
    const q = question(program, key), html = render(q);
    assert.equal(program.sections[i].questions.length, 1, key);
    assert.equal(program.sections[i].questions[0], q, key);
    assert.equal(q.type, "FREE_TEXT", key);
    assert.equal(count(html, "textarea"), 1, key);
    assert.equal(count(html, "input"), 0, key);
    assert.doesNotMatch(html, /authoring-required|required=""/, key);
    assert.ok(html.includes(q.helperText!.split("\n")[0]), key);
    assert.equal(sectionComplete(program.sections[i], { [key]: "아직 잘 모르겠습니다" }), true, key);
  });
  assert.deepEqual(stages.map(key => (question(program, key).helperText!.match(/^- /gm) ?? []).length), [7, 7, 7, 6, 5, 6]);
  assert.equal((question(program, "strengths").helperText!.match(/· (이미 증명된 것|자라고 있는 것|아직 바람에 가까운 것): /g) ?? []).length, 3);
  assert.equal((question(program, "workShape").helperText!.match(/· (무엇|역할|환경|구조): /g) ?? []).length, 4);
  assert.match(render(question(program, "workSelf")), /“여러 사람이 동시에 말하는 회의 뒤에는 한두 시간 혼자 정리할 시간이 필요했다”/);
  // 03 keeps its health notice under the guide; no diagnosis, score or suitability rating is named anywhere.
  const conditions = render(question(program, "conditions"));
  assert.ok(conditions.indexOf("약이나 치료 계획은 이 글만으로 바꾸지 마세요.") > conditions.indexOf("“상담에서 다루겠습니다”도 유효한 답입니다."));
  assert.ok(conditions.indexOf("약이나 치료 계획은 이 글만으로 바꾸지 마세요.") < conditions.indexOf("<textarea"));
  assert.match(conditions, /해당하지 않는다면 넘어가도 됩니다\./);
  assert.doesNotMatch(JSON.stringify(program), /점수|score|양극성|조울|HSP|적성 유형|적합도|위험도/i);
  assert.match(program.guidance ?? "", /이 글쓰기는 진단이나 치료를 대신하지 않습니다\./);
  assert.equal((program.guidance ?? "").split("\n\n").length, 5);

  // Close: three light optional fields.
  const close = program.sections[6];
  assert.deepEqual(close.questions.map(q => q.prompt), ["가장 먼저 해볼 일", "다시 볼 시점", "선택 앞에서 나에게 물을 질문"]);
  assert.ok(close.questions.every(q => q.type === "FREE_TEXT" && q.metadata?.rows === 3 && q.metadata?.omitWhenEmpty === true));
  assert.deepEqual(program.completionKeys, []);
  assert.equal(program.sections.flatMap(s => s.questions).some(q => q.required), false);

  const report = (authored: Record<string, string>) => ({ programKey: program.programKey, specVersion: program.version, completedAt: "2026-10-11T00:00:00Z", sections: program.reportSections.map(section => ({ title: section.title,
    items: section.questionKeys.map(key => ({ questionKey: key, prompt: question(program, key).prompt, type: question(program, key).type, value: authored[key] ?? null })) })) }) as Session["report"];
  const document = (authored: Record<string, string>) => renderToStaticMarkup(<ReportDocument session={{ programKey: program.programKey, specVersion: program.version, definition: program, answers: {}, report: report(authored) } as unknown as Session} />);
  // The report is the stored snapshot: authored text in order, only the close values that were written, nothing invented.
  const rendered = document({ workSelf: "회의 뒤에는 혼자 정리할 시간이 필요했다\n\n아직 잘 모르겠습니다.", conditions: "지금은 쓰지 않겠습니다", practice: "매주 한 편을 내보인다", "close.reviewAt": "석 달 뒤" });
  const order = [...titles.slice(0, 1), "회의 뒤에는 혼자 정리할 시간이 필요했다", ...titles.slice(1, 3), "지금은 쓰지 않겠습니다", ...titles.slice(3, 6), "매주 한 편을 내보인다", titles[6], "다시 볼 시점", "석 달 뒤"];
  const positions = order.map(text => rendered.indexOf(`>${text}`));
  assert.deepEqual(order.filter((_, i) => positions[i] < 0), [], "every heading and authored value is present");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "in authored order");
  assert.match(rendered, /회의 뒤에는 혼자 정리할 시간이 필요했다\n\n아직 잘 모르겠습니다\./, "long writing is kept verbatim");
  assert.doesNotMatch(rendered, /가장 먼저 해볼 일|선택 앞에서 나에게 물을 질문/, "unwritten close values are left out, not filled in");
  for (const title of titles) assert.equal(rendered.split(`<h2>${title}</h2>`).length - 1, 1, title);
  assert.equal(rendered.split("매주 한 편을 내보인다").length - 1, 1, "authored text is not duplicated into the close");
  assert.doesNotMatch(rendered, /점수|score|요약|유형|NaN|undefined/i);
  // With no close value written the close section is left out altogether; the six stages stay.
  const bare = document({ workSelf: "장면" });
  assert.doesNotMatch(bare, /다음 걸음과 다시 볼 시점/);
  for (const title of titles.slice(0, 6)) assert.equal(bare.split(`<h2>${title}</h2>`).length - 1, 1, title);

  const full = renderToStaticMarkup(<SessionDocument session={{ definition: program, answers: { conditions: "지금은 쓰지 않겠습니다" } } as unknown as Session} />);
  assert.match(full, /03\. 나를 흔드는 것과 지켜야 할 조건/);
  assert.match(full, /07\. 다음 걸음과 다시 볼 시점/);
  assert.match(full, /이 글쓰기는 나에게 맞는 직업을 골라주는 검사가 아닙니다\./);
  assert.equal(full.split("지금은 쓰지 않겠습니다").length - 1, 2, "once in the guide, once as the answer");
});

test("A report section is hidden only when every one of its items is an unwritten optional value", () => {
  // Earlier programs keep every section heading: none of their report sections is made only of optional values.
  for (const [key, version] of [["present-life", "2026-09-24"], ["present-future-identity", "2026-10-01"], ["earning-a-living", "2026-10-02"], ["recovery", "2026-09-24"]] as const) {
    const program = definition(key, version);
    const report = { programKey: key, specVersion: version, completedAt: "2026-10-11T00:00:00Z", sections: program.reportSections.map(section => ({ title: section.title,
      items: section.questionKeys.map(k => ({ questionKey: k, prompt: question(program, k).prompt, type: question(program, k).type, value: null })) })) } as Session["report"];
    const html = renderToStaticMarkup(<ReportDocument session={{ programKey: key, specVersion: version, definition: program, answers: {}, report } as unknown as Session} />);
    for (const section of program.reportSections) assert.ok(html.includes(`<h2>${section.title}</h2>`), `${key}: ${section.title}`);
  }
});

test("The three body and style Topic programs are optional free writing with one stage notice and one report epigraph", () => {
  const light = definition("light-body-free-style", "2026-10-11"), ren = definition("ren-daily-training", "2026-10-11"), physique = definition("desired-physique", "2026-10-11");
  const keys = (program: Program) => program.sections.flatMap(s => s.questions).map(q => q.questionKey);
  assert.deepEqual([light, ren, physique].map(p => [p.group, p.version, p.title, p.reportTitle]), [["TOPIC", "2026-10-11", "가벼운 몸, 자유로운 스타일", "가벼운 몸, 자유로운 스타일"],
    ["TOPIC", "2026-10-11", "REN — 매일 몸을 단련하는 사람", "REN — 매일 몸을 단련하는 사람"], ["TOPIC", "2026-10-11", "내가 가지고 싶은 좋은 몸", "내가 가지고 싶은 좋은 몸"]]);
  assert.deepEqual(light.sections.map(s => s.sectionKey), ["desire", "body-image", "wardrobe", "style-self", "light-day", "sustain", "close"]);
  assert.deepEqual(ren.sections.map(s => s.sectionKey), ["ren-portrait", "meaning", "temple", "ordinary-week", "return-path", "close"]);
  assert.deepEqual(physique.sections.map(s => s.sectionKey), ["desire", "ideal-physique", "enjoyment", "building-way", "starting-point", "close"]);
  assert.deepEqual(keys(light), ["desire", "bodyImage", "wardrobe", "styleSelf", "lightDay", "sustain", "close.tryStyle", "close.habit"]);
  assert.deepEqual(keys(ren), ["renPortrait", "meaning", "temple", "ordinaryWeek", "returnPath", "close.thisWeek"]);
  assert.deepEqual(keys(physique), ["desire", "idealPhysique", "enjoyment", "buildingWay", "startingPoint", "close.reviewAt"]);
  assert.deepEqual([light, ren, physique].map(p => p.stoppingRules.length), [5, 4, 4]);
  assert.deepEqual(light.sections.map((_, i) => sectionLabel(light, i)), ["01", "02", "03", "04", "05", "06", "07"]);
  assert.equal(sectionProgress(ren, 5), "06 / 6");
  assert.equal(sectionProgress(physique, 5), "06 / 6");
  // The notice belongs to one stage of one program; the epigraph to one program.
  assert.deepEqual(light.sections.filter(s => s.note).map(s => s.sectionKey), ["sustain"]);
  assert.match(light.sections[5].note!, /^먹는 것이나 몸에 대한 생각이 쓰는 동안 지나치게 괴롭게 느껴진다면 잠시 멈춰도 됩니다\./);
  assert.equal([...ren.sections, ...physique.sections].some(s => "note" in s), false);
  assert.equal(ren.reportEpigraph, "육체야말로 인간의 신전이다.");
  assert.equal("reportEpigraph" in light || "reportEpigraph" in physique, false);
  assert.ok(ren.guidance!.startsWith("육체야말로 인간의 신전이다.\n\n"));
  assert.equal(question(light, "lightDay").metadata?.rows, 24);

  for (const program of [light, ren, physique]) {
    const name = program.programKey, all = program.sections.flatMap(s => s.questions), close = program.sections.at(-1)!;
    assert.deepEqual(program.completionKeys, [], name);
    assert.ok(all.every(q => q.type === "FREE_TEXT" && q.required === false), name);
    assert.ok(close.questions.every(q => q.metadata?.omitWhenEmpty === true && q.metadata.rows === 3), name);
    assert.equal(close.sectionKey, "close", name);
    assert.ok(all.filter(q => !close.questions.includes(q)).every(q => !q.metadata?.omitWhenEmpty && program.sections.find(s => s.questions.includes(q))!.questions.length === 1), `${name}: one editor per writing stage`);
    assert.deepEqual(program.reportSections.map(s => s.title), program.sections.map(s => s.title), name);
    assert.deepEqual(program.reportSections.flatMap(s => s.questionKeys), keys(program), name);
    assert.ok(program.guidance!.endsWith("아직 모르는 부분은 비워두어도 됩니다."), name);
    assert.doesNotMatch(JSON.stringify(program), /점수|score|streak|칼로리/i, name);
    // Guide bullets are helper text: every stage renders exactly one textarea per question and no other input.
    for (const q of all) {
      const html = renderToStaticMarkup(<QuestionField question={q} value="" answers={{}} change={() => {}} />);
      assert.equal((html.match(/<textarea[ >]/g) ?? []).length, 1, q.questionKey);
      assert.equal((html.match(/<input[ >]/g) ?? []).length, 0, q.questionKey);
      assert.doesNotMatch(html, /authoring-required/, q.questionKey);
    }
    // A writing stage is marked by its one editor; the Close stage, all optional, needs every field.
    assert.equal(sectionComplete(program.sections[0], { [all[0].questionKey]: "원문" }), true, name);
    assert.equal(sectionComplete(program.sections[0], { [all[0].questionKey]: " " }), false, name);
    assert.equal(sectionComplete(close, {}), false, name);
    assert.equal(sectionComplete(close, Object.fromEntries(close.questions.map(q => [q.questionKey, "하나"]))), true, name);

    // Full view: every stage in order; unwritten writing is shown as unwritten.
    const first = all[0].questionKey;
    const full = renderToStaticMarkup(<SessionDocument session={{ definition: program, answers: { [first]: "솔직한 원문\n\n둘째 문단" } } as unknown as Session} />);
    for (const [i, section] of program.sections.entries()) assert.ok(full.includes(`<h2>${String(i + 1).padStart(2, "0")}. ${section.title}</h2>`), `${name} ${section.sectionKey}`);
    assert.equal(full.split("아직 작성하지 않음").length - 1, all.length - 1, name);
    assert.match(full, /솔직한 원문\n\n둘째 문단/);
    assert.doesNotMatch(full, /authoring-section-note|authoring-report-epigraph/, name);

    // Report: the stored snapshot in authored order; an unwritten Close field is left out, unwritten writing is shown as unwritten.
    const authored: Record<string, string> = { [first]: "솔직한 원문\n\n둘째 문단" };
    const snapshot = (answers: Record<string, string>) => ({ programKey: name, specVersion: program.version, completedAt: "2026-10-11T00:00:00Z", sections: program.reportSections.map(section => ({ title: section.title,
      items: section.questionKeys.map(key => ({ questionKey: key, prompt: question(program, key).prompt, type: question(program, key).type, value: answers[key] ?? null })) })) }) as Session["report"];
    const render = (answers: Record<string, string>) => renderToStaticMarkup(<ReportDocument session={{ programKey: name, specVersion: program.version, definition: program, answers: {}, report: snapshot(answers) } as unknown as Session} />);
    const report = render(authored);
    const positions = program.reportSections.slice(0, -1).map(s => report.indexOf(`<h2>${s.title}</h2>`));
    assert.ok(positions.every(p => p > 0), name);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${name}: report sections in authored order`);
    assert.equal(report.includes(`<h2>${close.title}</h2>`), false, `${name}: a Close with nothing written has no heading`);
    assert.match(report, /솔직한 원문\n\n둘째 문단/, "long writing is kept verbatim");
    for (const q of close.questions) assert.equal(report.includes(`<h3>${q.prompt}</h3>`), false, `${name}: empty ${q.questionKey} is hidden`);
    assert.equal(report.split("아직 작성하지 않음").length - 1, all.length - close.questions.length - 1, name);
    const closed = render({ ...authored, [close.questions[0].questionKey]: "이번 주에 하나" });
    assert.ok(closed.includes(`<h2>${close.title}</h2>`) && closed.includes(`<h3>${close.questions[0].prompt}</h3>`) && closed.includes("이번 주에 하나"), `${name}: a written Close field appears under its heading`);
    assert.ok(closed.indexOf(`<h2>${close.title}</h2>`) > positions.at(-1)!, `${name}: the Close section is last`);
    assert.doesNotMatch(report, /점수|score|요약|NaN|undefined|authoring-section-note/i, name);
    // The epigraph opens REN's report only, set apart from the writer's text.
    const epigraphs = report.split('<p class="authoring-report-epigraph">').length - 1;
    assert.equal(epigraphs, name === "ren-daily-training" ? 1 : 0, name);
    if (epigraphs) assert.ok(report.startsWith('<div class="authoring-document"><p class="authoring-report-epigraph">육체야말로 인간의 신전이다.</p><section>'), "the epigraph comes before the first section");
  }
  // A report frozen before the field existed renders as before.
  const earlier = definition("earning-a-living", "2026-10-02");
  assert.doesNotMatch(renderToStaticMarkup(<ReportDocument session={{ programKey: earlier.programKey, specVersion: earlier.version, definition: earlier, answers: {},
    report: { programKey: earlier.programKey, specVersion: earlier.version, completedAt: "2026-10-02T00:00:00Z", sections: [] } } as unknown as Session} />), /authoring-report-epigraph/);
});
