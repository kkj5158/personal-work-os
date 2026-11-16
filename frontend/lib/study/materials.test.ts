import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudyPort } from "./port";
import { registerMaterial, validateMaterialPdf, type MaterialRegistration } from "./materials";
import type { StudyDataPort, StudySource } from "./model";

function setup() {
  const base = createStudyPort("demo"), sources: StudySource[] = [], calls: string[] = [];
  let uploadFailure = false, indexFailure = false, analysis = "ready";
  const port: StudyDataPort = { ...base, mode: "server", getSnapshot: () => ({ ...base.getSnapshot(), sources, connection: { state: "ready" } }),
    updateSource: async source => { calls.push(`save:${source.id}`); sources.push({ ...source, version: 1 }); },
    uploadFile: async (_file, context) => { calls.push(`upload:${"materialId" in context ? context.materialId : "wrong"}`); if (uploadFailure) { uploadFailure = false; throw new Error("network"); } return { id: "asset", name: "self.pdf", type: "application/pdf", size: 20, order: 1 }; },
    engine: { status: async () => ({ jobs: [], sources: [{ materialId: "logical", materialVersion: 1, state: analysis }] }) as never,
      search: async () => [], action: async (action, data) => { calls.push(action); if (action.startsWith("index/")) { assert.deepEqual(data, { materialVersion: 1 }); if (indexFailure) { indexFailure = false; throw new Error("index network"); } return { id: "job", state: "QUEUED" }; } return { checked: true }; } },
  };
  const source: StudySource = { id: "logical", title: "Self-authored", domain: "test", included: true, active: true, weight: 50, scope: "문서 전체", status: "metadata", rights: "author" };
  const progress: MaterialRegistration = { materialId: "logical", metadataSaved: false };
  const file = new File(["%PDF-self-authored"], "self.pdf", { type: "application/pdf" });
  return { port, source, progress, file, calls, failUpload: () => { uploadFailure = true; }, failIndex: () => { indexFailure = true; }, textless: () => { analysis = "needs_source_check"; } };
}
test("file validation uses actual configured limit and strict PDF contract", () => {
  assert.equal(validateMaterialPdf({ name: "source.pdf", type: "application/pdf", size: 500 }, 1000), null);
  assert.match(validateMaterialPdf({ name: "source.pdf", type: "application/pdf", size: 1001 }, 1000)!, /파일/);
  assert.match(validateMaterialPdf({ name: "source.png", type: "image/png", size: 100 }, 1000)!, /PDF/);
});
test("registration saves real bytes then enqueues and runs exact current-version INDEX once", async () => {
  const s = setup(), stages: string[] = [];
  const result = await registerMaterial(s.port, s.progress, s.source, s.file, value => stages.push(value));
  assert.deepEqual(s.calls, ["save:logical", "upload:logical", "index/asset", "jobs/job/run"]);
  assert.match(result, /사용 가능/); assert.ok(stages.includes("업로드 중"));
});
test("upload retry keeps material identity and does not resave metadata", async () => {
  const s = setup(); s.failUpload();
  await assert.rejects(registerMaterial(s.port, s.progress, s.source, s.file, () => {}));
  assert.equal(s.progress.metadataSaved, true); assert.equal(s.progress.assetId, undefined);
  await registerMaterial(s.port, s.progress, s.source, s.file, () => {});
  assert.equal(s.calls.filter(value => value === "save:logical").length, 1);
  assert.equal(s.calls.filter(value => value === "index/asset").length, 1);
});
test("index retry reuses saved asset and textless PDF stays an honest blocker", async () => {
  const s = setup(); s.failIndex();
  await assert.rejects(registerMaterial(s.port, s.progress, s.source, s.file, () => {}));
  assert.equal(s.progress.assetId, "asset"); s.textless();
  const result = await registerMaterial(s.port, s.progress, s.source, null, () => {});
  assert.match(result, /원문 확인 필요/); assert.doesNotMatch(result, /사용 가능/);
  assert.equal(s.calls.filter(value => value.startsWith("upload:")).length, 1);
});
test("an older usable PDF cannot hide a failed analysis of the just-uploaded asset", async () => {
  const s = setup();
  s.port.engine!.status = async () => ({ jobs: [{ id: "job", state: "PARTIAL" }], sources: [{ materialId: "logical", materialVersion: 1, assetId: "older-asset", jobId: "older-job", state: "ready" }] }) as never;
  await assert.rejects(registerMaterial(s.port, s.progress, s.source, s.file, () => {}), /해당 파일 분석이 끝나지/);
});
