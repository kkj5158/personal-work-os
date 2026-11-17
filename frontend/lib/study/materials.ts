import type { EngineJob } from "./engine";
import type { StudyDataPort, StudySource } from "./model";

export type MaterialAnalysis = {
  materialId: string;
  materialVersion: number;
  assetId?: string;
  jobId?: string;
  state:
    | "missing"
    | "queued"
    | "processing"
    | "ready"
    | "needs_source_check"
    | "failed";
  usableExcerptCount: number;
  included: boolean;
  active: boolean;
};
export const materialStateLabel: Record<MaterialAnalysis["state"], string> = {
  missing: "분석 필요",
  queued: "분석 대기",
  processing: "분석 중",
  ready: "사용 가능",
  needs_source_check: "원문 확인 필요",
  failed: "실패 · 재시도",
};
export function validateMaterialPdf(
  file: Pick<File, "name" | "type" | "size">,
  maxBytes: number,
) {
  if (!/\.pdf$/i.test(file.name) || file.type !== "application/pdf")
    return "PDF 파일만 등록할 수 있습니다.";
  if (file.size <= 0 || file.size > maxBytes)
    return `파일은 0바이트 초과, ${Math.floor(maxBytes / 1048576)}MiB 이하여야 합니다.`;
  return null;
}
export type MaterialRegistration = {
  materialId: string;
  metadataSaved: boolean;
  assetId?: string;
  materialVersion?: number;
  uploadStarted?: boolean;
};

/** The caller retains this object for targeted retries; never allocate a new logical material here. */
export async function registerMaterial(
  port: StudyDataPort,
  progress: MaterialRegistration,
  source: StudySource,
  file: File | null,
  stage: (message: string) => void,
) {
  if (port.getSnapshot().connection?.state === "error") await port.retry?.();
  const saved = port
    .getSnapshot()
    .sources.find((item) => item.id === progress.materialId);
  if (saved) progress.metadataSaved = true;
  if (!progress.metadataSaved) {
    stage("자료 정보 저장 중");
    await port.updateSource({ ...source, id: progress.materialId });
    progress.metadataSaved = true;
  }
  progress.materialVersion ??= port
    .getSnapshot()
    .sources.find((item) => item.id === progress.materialId)?.version;
  if (!file && !progress.assetId)
    return "자료 정보 저장됨 · PDF를 추가하면 분석할 수 있습니다.";
  if (!progress.assetId) {
    if (!port.uploadFile || !file)
      throw new Error("업로드할 PDF를 다시 선택하세요.");
    stage("업로드 중");
    progress.uploadStarted = true;
    progress.assetId = (
      await port.uploadFile(file, {
        purpose: "material",
        materialId: progress.materialId,
      })
    ).id;
  }
  if (!port.engine || !progress.materialVersion)
    throw new Error(
      "파일 저장됨 · 현재 자료 버전을 확인한 뒤 분석을 재시도하세요.",
    );
  stage("분석 요청 중");
  let job = (await port.engine.action(`index/${progress.assetId}`, {
    materialVersion: progress.materialVersion,
  })) as EngineJob;
  if (!job?.id)
    throw new Error(
      "파일 저장됨 · 분석 요청 확인에 실패했습니다. 분석만 다시 시도하세요.",
    );
  if (["FAILED", "BLOCKED"].includes(job.state)) {
    await port.engine.action(`jobs/${job.id}/retry`);
    job = { ...job, state: "QUEUED" };
  }
  if (["QUEUED", "PARTIAL"].includes(job.state)) {
    stage("분석 중");
    await port.engine.action(`jobs/${job.id}/run`);
  }
  const status = await port.engine.status();
  const exact = status.jobs.find((item) => item.id === job.id) as
    | (EngineJob & { usableExcerptCount?: number })
    | undefined;
  if (exact) {
    if (exact.state === "READY" && exact.usableExcerptCount !== undefined)
      return `교재 등록됨 · ${exact.usableExcerptCount > 0 ? "사용 가능" : "원문 확인 필요"}`;
    if (exact.state === "QUEUED") return "교재 등록됨 · 분석 대기";
    if (["RUNNING", "VALIDATING"].includes(exact.state))
      return "교재 등록됨 · 분석 중";
    if (["FAILED", "BLOCKED", "PARTIAL", "CANCELLED"].includes(exact.state))
      throw new Error(
        "파일 저장됨 · 해당 파일 분석이 끝나지 않았습니다. 자료 상세에서 원인을 확인하고 재시도하세요.",
      );
  }
  const analysis = (status as { sources?: MaterialAnalysis[] }).sources?.find(
    (item) =>
      item.materialId === progress.materialId &&
      item.materialVersion === progress.materialVersion,
  );
  if (
    !analysis ||
    (analysis.jobId && analysis.jobId !== job.id) ||
    (analysis.assetId && analysis.assetId !== progress.assetId)
  )
    throw new Error(
      "파일 저장됨 · 해당 파일의 분석 결과 확인 대기입니다. 자료 목록에서 다시 확인하세요.",
    );
  if (analysis.state === "failed")
    throw new Error(
      "파일 저장됨 · 분석에 실패했습니다. 자료 상세에서 원인을 확인하고 분석만 재시도하세요.",
    );
  return `교재 등록됨 · ${materialStateLabel[analysis.state]}`;
}
