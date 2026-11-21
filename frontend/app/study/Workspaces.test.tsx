import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import type { StudyDataPort } from "../../lib/study/model";
import { createStudyPort } from "../../lib/study/port";
import { Handwritten, Solver } from "./Workspaces";

test("local image/PDF previews reorder, remove, validate, record metadata and revoke URLs", async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/study"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const created:string[]=[],revoked:string[]=[], originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  URL.createObjectURL=()=>{const url=`blob:study-${created.length}`;created.push(url);return url;};URL.revokeObjectURL=url=>{revoked.push(url);};
  const root=createRoot(document.getElementById("root")!);
  try{
    const port=createStudyPort("demo",new Date("2026-10-27T01:00:00Z")),pkg=port.getSnapshot().packages.find(p=>p.date==="2026-10-27")!;
    const props={pkg,part:"required" as const,port,snapshot:port.getSnapshot(),back:()=>{},open:()=>{}};
    await act(()=>root.render(<Handwritten {...props}/>));
    const input=document.querySelector<HTMLInputElement>('[aria-label="답안 파일 선택"]')!;
    const files=[new dom.window.File(["image-one"],"one.png",{type:"image/png"}),new dom.window.File(["image-two"],"two.jpg",{type:"image/jpeg"}),new dom.window.File(["%PDF-sample"],"scan.pdf",{type:"application/pdf"})];
    Object.defineProperty(input,"files",{value:files,configurable:true});
    await act(()=>input.dispatchEvent(new dom.window.Event("change",{bubbles:true})));
    assert.equal(document.querySelectorAll('.study-file-preview img').length,2);assert.equal(document.querySelectorAll('.study-file-preview object[type="application/pdf"]').length,1);
    const click=async(label:string)=>act(()=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.getAttribute('aria-label')===label || b.textContent===label)!.click());
    await click("two.jpg 위로");assert.match(document.querySelector('.study-file-preview header strong')!.textContent!,/two.jpg/);
    await click("one.png 제거");assert.equal(document.querySelectorAll('.study-file-preview').length,2);assert.ok(revoked.includes(created[0]));
    await act(()=>document.querySelector<HTMLInputElement>('.study-coverage-option input')!.click());
    await click("수기 답안 샘플 제출");
    const attempt=port.getSnapshot().attempts.at(-1)!;
    assert.equal(attempt.mode,"handwritten");assert.equal(attempt.coverage.length,1);assert.deepEqual(attempt.attachments.map(a=>a.name),["two.jpg","scan.pdf"]);assert.ok(!JSON.stringify(attempt).includes("image-two"));assert.match(document.querySelector('[role=status]')!.textContent!,/파일은 POS 서버에 저장되지/);
    Object.defineProperty(input,"files",{value:[new dom.window.File(["script"],"bad.html",{type:"text/html"})],configurable:true});
    await act(()=>input.dispatchEvent(new dom.window.Event("change",{bubbles:true})));assert.match(document.querySelector('[role=status]')!.textContent!,/JPG·PNG·PDF만/);assert.equal(created.length,3);
    await act(()=>root.unmount());assert.ok(created.every(url=>revoked.includes(url)));
  }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;dom.window.close();}
});
test("solver safely renders content and rejects malformed schemas before exposing controls", async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/study"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById("root")!),port=createStudyPort("demo",new Date("2026-10-27T01:00:00Z"));
  const pkg=structuredClone(port.getSnapshot().packages[0]);pkg.required[0].prompt='<img src=x onerror="alert(1)">';
  const props={pkg,part:"required" as const,port,snapshot:port.getSnapshot(),back:()=>{},open:()=>{}};
  await act(()=>root.render(<Solver {...props}/>));assert.equal(document.querySelectorAll('.study-question img').length,0);assert.match(document.querySelector('.study-question h2')!.textContent!,/<img src=x/);assert.equal(document.querySelectorAll('.study-answer').length,0);
  pkg.required[0].kind="unrecognized" as never;
  await act(()=>root.render(<Solver {...props} pkg={{...pkg}}/>));assert.match(document.querySelector('[role=alert]')!.textContent!,/アル|알 수 없는/);assert.equal(document.querySelectorAll('input[type=radio]').length,0);
  await act(()=>root.unmount());dom.window.close();
});

test("progressive hints retry the same stage, survive a remount and leave the answer route closed", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/study" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  const base = createStudyPort("demo", new Date("2026-10-27T01:00:00Z"));
  const original = base.getSnapshot().packages[0];
  const pkg = { ...original, status: "published" as const, hintStages: 3 as const,
    questionPdf: { ...original.questionPdf, state: "ready" as const, url: "https://example.test/question.pdf" },
    answerExplanationPdf: { ...original.answerExplanationPdf, state: "ready" as const, url: "https://example.test/answer.pdf" },
  };
  const requested: number[] = [];
  let count: 0 | 1 | 2 | 3 = 0, answerReads = 0;
  const hints = ["어떤 증거가 빠졌나요?", "비교 기준을 두 가지 적어 보세요.", "원인, 근거, 대안 순으로 나눠 보세요."];
  const port: StudyDataPort = {
    ...base,
    readAnswerKeys: async () => { answerReads++; return []; },
    readHints: async binding => {
      assert.equal(binding.workbookVersion, pkg.version);
      const value = binding.questionId === pkg.required[0].id ? count : 0;
      return { revealedHintCount: value, hints: hints.slice(0, value) };
    },
    revealHint: async (binding, level) => {
      assert.equal(binding.questionVersion, pkg.required[0].version);
      requested.push(level);
      count = level;
      if (requested.length === 1) throw new Error("ACK lost");
      return { revealedHintCount: count, hints: hints.slice(0, count) };
    },
  };
  const render = (key: string) => act(() => root.render(<Solver key={key} pkg={pkg} part="required" port={port}
    snapshot={port.getSnapshot()} back={() => {}} open={() => {}} />));
  const button = () => document.querySelector<HTMLButtonElement>(".study-hints button")!;
  const shown = () => document.querySelectorAll(".study-hints ol li").length;
  try {
    await render("initial");
    assert.equal(shown(), 0);
    await act(() => button().click());
    assert.equal(shown(), 0);
    await act(() => button().click());
    assert.equal(shown(), 1);
    await act(() => button().click());
    assert.equal(shown(), 2);
    await render("reloaded");
    assert.equal(shown(), 2);
    await act(() => button().click());
    assert.equal(shown(), 3);
    assert.deepEqual(requested, [1, 1, 2, 3]);
    assert.equal(answerReads, 0);
    assert.equal(document.querySelectorAll(".study-answer").length, 0);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
  }
});
