import assert from "node:assert/strict";
import { test } from "node:test";
import { tabTarget } from "../globalTabs";
import { fixtureSnapshot } from "./fixtures";
import { createStudyPort, onlineAttempt } from "./port";
import { addDays, bindingFor, completion, responseKey, validateFile, validatePackage, validateQuestions, validateResponse, validDocumentPair, weekStart } from "./model";
const now = new Date("2026-10-27T01:00:00Z");
test("KST Sunday and Monday boundaries preserve independent weekly identities", () => {
  assert.equal(weekStart(new Date("2026-11-01T14:59:59Z")), "2026-10-26");
  assert.equal(weekStart(new Date("2026-11-01T15:00:00Z")), "2026-11-02");
  assert.equal(addDays("2026-12-28",7),"2027-01-04");
  const before=fixtureSnapshot(new Date("2026-11-01T14:59:59Z")), after=fixtureSnapshot(new Date("2026-11-01T15:00:00Z"));
  assert.ok(before.packages.find(p=>p.date==="2026-11-01"));assert.ok(after.packages.find(p=>p.date==="2026-11-01"));
});
test("all fixture sets validate; six controls plus diagram are data driven and solution free", () => {
  const state=fixtureSnapshot(now), pkg=state.packages[0];
  state.packages.forEach(p=>assert.deepEqual(validatePackage(p),[]));
  assert.deepEqual(new Set([...pkg.required,...pkg.extension].map(q=>q.kind)),new Set(["single_choice","essay","multiple_choice","true_false","short_answer","diagram"]));
  assert.ok(!JSON.stringify(state.packages).includes('"rubric"'));
  assert.ok(validateQuestions([{...pkg.required[0],kind:"script"}]).length);
  assert.ok(validateQuestions([{...pkg.required[0],correct:"B"}]).length);
  assert.ok(validateQuestions([null]).length);
  assert.ok(validateQuestions([pkg.required[0],pkg.required[0]]).length);
  assert.ok(validateQuestions([{...pkg.required[0], options:[null]}]).length);
  assert.ok(validateQuestions([{...pkg.required[0], rows:NaN}]).length);
});
test("response contracts reject invalid shapes; false is a valid answer", () => {
  const pkg=fixtureSnapshot(now).packages[0];
  assert.ok(validateResponse(pkg.required[0],{selected:"B"}));
  assert.ok(!validateResponse(pkg.required[0],{selected:"Z"}));
  assert.ok(!validateResponse(pkg.required[0],{selected:"B",correct:true}));
  assert.ok(validateResponse(pkg.extension[1],{value:false}));
  assert.ok(!validateResponse(pkg.extension[1],{value:"false"}));
  assert.ok(!validateResponse(pkg.extension[0],{selected:["A","A"]}));
  assert.ok(!validateResponse(pkg.required[5],{text:"   "}));
});
test("publication requires matching real paired document metadata", () => {
  const pkg=structuredClone(fixtureSnapshot(now).packages[0]);
  pkg.status="published";
  assert.ok(validatePackage(pkg).length);
  for(const doc of [pkg.questionPdf,pkg.answerExplanationPdf]){doc.state="ready";doc.url=`https://example.org/${doc.kind}.pdf`;}
  assert.ok(validDocumentPair(pkg)); assert.deepEqual(validatePackage(pkg),[]);
  pkg.answerExplanationPdf.workbookVersion++; assert.equal(validDocumentPair(pkg),false);
});
test("draft binding uses full immutable identity independent of display order", () => {
  const port=createStudyPort("demo",now), pkg=port.getSnapshot().packages[0], q=pkg.required[0], binding=bindingFor(pkg,"required",q);
  port.saveDraft(binding,{selected:"B"});
  assert.equal(responseKey(bindingFor(pkg,"required",{...q,order:99})),responseKey(binding));
  assert.notEqual(responseKey({...binding,questionVersion:2}),responseKey(binding));
  assert.throws(()=>port.saveDraft({...binding,questionVersion:9},{selected:"B"}));
  assert.ok(Object.isFrozen(port.getSnapshot().packages[0].required[0]));
  port.saveDraft(bindingFor(pkg,"required",pkg.required[5]),{text:"Draft"});
  port.saveDraft(bindingFor(pkg,"required",pkg.required[5]),{text:""});
  assert.equal(Object.keys(port.getSnapshot().drafts).length,1);
});
test("hybrid and repeated submissions count coverage once without fabricated grades", () => {
  const port=createStudyPort("demo",now), pkg=port.getSnapshot().packages.find(p=>p.date==="2026-10-27")!;
  pkg.required.slice(0,5).forEach(q=>port.saveDraft(bindingFor(pkg,"required",q),{selected:"B"}));
  const input=onlineAttempt(pkg,"required",port.getSnapshot().drafts);
  port.recordAttempt(input);port.recordAttempt(input);
  assert.equal(completion(pkg,"required",port.getSnapshot().attempts).covered,5);
  port.recordAttempt({workbookId:pkg.id,workbookVersion:pkg.version,part:"required",mode:"handwritten",coverage:[responseKey(bindingFor(pkg,"required",pkg.required[5]))],responses:{},attachments:[{id:"f1",name:"sample.png",type:"image/png",size:100,order:0}],note:"Sample"});
  const state=completion(pkg,"required",port.getSnapshot().attempts);
  assert.equal(state.mode,"hybrid");assert.equal(state.complete,true);
  assert.equal(completion(pkg,"extension",port.getSnapshot().attempts).covered,0);
  const snapshot=JSON.stringify(port.getSnapshot().attempts); assert.ok(!snapshot.includes('"score"'));
  assert.throws(()=>port.recordAttempt({...input,coverage:["arbitrary"]}));
});
test("explicit policy approval changes only future preview; rejects and rollback preserve snapshots", async () => {
  const port=createStudyPort("demo",now), initial=port.getSnapshot(), future=initial.packages.find(p=>p.date==="2026-11-02")!, old=JSON.stringify(initial.packages);
  port.propose("format"); assert.equal(port.readPackage(future.id)!.version,1);
  port.decideProposal(port.getSnapshot().proposals[0].id,true);
  const updated=port.readPackage(future.id)!;
  assert.equal(updated.required.length,5);assert.equal(updated.required[0].options!.length,5);assert.equal(updated.required[4].kind,"case_analysis");assert.deepEqual(validatePackage(updated),[]);
  assert.equal(JSON.stringify(port.getSnapshot().packages.slice(0,initial.packages.length)),old);
  port.propose("explanation");port.decideProposal(port.getSnapshot().proposals.at(-1)!.id,false);assert.equal(port.getSnapshot().policies.length,2);
  port.propose("explanation");port.decideProposal(port.getSnapshot().proposals.at(-1)!.id,true);
  const newest=port.readPackage(future.id)!; const keys=await port.readAnswerKeys(newest.id,newest.version,"required");assert.ok(keys[0].explanation.includes("시식회"));
  port.rollbackPolicy(1);assert.equal(port.getSnapshot().policies.at(-1)!.version,4);assert.equal(port.readPackage(future.id)!.required.length,6);
  assert.equal(port.getSnapshot().packages.find(p=>p.date==="2026-10-27")!.version,1);
});
test("files enforce MIME, extension and size; disconnected adapter cannot mutate", () => {
  assert.equal(validateFile({name:"a.png",type:"image/png",size:100}),null);
  assert.ok(validateFile({name:"a.png",type:"text/html",size:100}));
  assert.ok(validateFile({name:"a.pdf",type:"application/pdf",size:21*1024*1024}));
  assert.ok(validateFile({name:"a.jpg",type:"image/jpeg",size:0}));
  const port=createStudyPort("disconnected",now);assert.equal(port.getSnapshot().packages.length,0);assert.throws(()=>port.addFeedback("x"));
});
test("STUDY shell routes preserve approved context and drop content/secret parameters", () => {
  const result=tabTarget("/study?tab=coach&demo=1&date=2026-11-02&version=2&part=required&mode=solve&token=secret&answer=private");
  assert.equal(result?.system,"STUDY");assert.ok(result?.route.includes("version=2"));assert.ok(!result?.route.includes("secret"));assert.ok(!result?.route.includes("private"));
  assert.equal(tabTarget("/study?mode=unknown&demo=2")?.route,"/study");
});
