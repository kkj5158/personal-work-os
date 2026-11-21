import type { EngineJob, EngineStatus } from "./engine";
import {
  addDays,
  validDocumentPair,
  type DailyStudyPackage,
  type StudySnapshot,
} from "./model";

export const jobKindLabel: Record<EngineJob["kind"], string> = {
  INDEX: "교재 분석",
  PLAN: "학습계획",
  GENERATE: "문제 생성",
  RENDER: "PDF 제작",
  COACH: "피드백 분석",
};
export function jobStateLabel(job: EngineJob): string {
  if (job.receipt?.error === "QUALITY_REVIEW_REQUIRED")
    return job.state === "PARTIAL" ? "품질 보완 대기" : "검토 필요";
  if (job.receipt?.error === "NEEDS_SOURCE_REVIEW") return "출제할 본문 부족";
  if (job.state === "READY")
    return job.kind === "GENERATE"
      ? "검토 필요"
      : job.kind === "INDEX"
        ? "분석 처리됨"
        : "처리됨";
  return (
    (
      {
        QUEUED: "대기",
        RUNNING: "진행 중",
        PARTIAL: "일부 진행",
        VALIDATING: "검증 중",
        PUBLISHED: "발행 완료",
        FAILED: "실패",
        BLOCKED: "조치 필요",
        CANCELLED: "취소",
      } as Record<string, string>
    )[job.state] ?? "상태 확인 필요"
  );
}
export type DaySlot = {
  date: string;
  state: "action" | "progress" | "published" | "failed" | "empty";
  label: string;
  job?: EngineJob;
  pkg?: DailyStudyPackage;
  jobs: EngineJob[];
  packages: DailyStudyPackage[];
};
const active = new Set(["QUEUED", "RUNNING", "PARTIAL", "VALIDATING"]);
export const workbookIdentity = (value: {
  workbookId?: string;
  workbookVersion?: number;
}) => `${value.workbookId ?? ""}/${value.workbookVersion ?? ""}`;
/** Dates are display slots only; operation and immutable version identities survive in history. */
export function weeklySlots(
  week: string,
  snapshot: StudySnapshot,
  jobs: EngineJob[],
): DaySlot[] {
  const byDate = new Map<string, EngineJob[]>(),
    byPackageDate = new Map<string, DailyStudyPackage[]>();
  for (const j of jobs)
    if (j.date && ["GENERATE", "RENDER", "PLAN"].includes(j.kind)) {
      const group = byDate.get(j.date) ?? [];
      group.push(j);
      byDate.set(j.date, group);
    }
  for (const p of snapshot.packages) {
    const group = byPackageDate.get(p.date) ?? [];
    group.push(p);
    byPackageDate.set(p.date, group);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(week, i),
      dayJobs = (byDate.get(date) ?? []).sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
      );
    const packages = (byPackageDate.get(date) ?? []).sort(
        (a, b) => b.version - a.version,
      ),
      published = packages.filter(
        (p) => p.status === "published" && validDocumentPair(p),
      );
    const isPublished = (j: EngineJob) =>
      published.some(
        (p) =>
          p.id === j.workbookId && p.version >= (j.workbookVersion ?? Infinity),
      );
    const ready = dayJobs.find(
      (j) =>
        j.kind === "GENERATE" &&
        j.state === "READY" &&
        !isPublished(j) &&
        !dayJobs.some(
          (r) =>
            r.kind === "RENDER" &&
            r.state !== "CANCELLED" &&
            workbookIdentity(r) === workbookIdentity(j),
        ),
    );
    const failure = dayJobs.find(
      (j) =>
        ["FAILED", "BLOCKED"].includes(j.state) &&
        !isPublished(j) &&
        !dayJobs.some(
          (other) =>
            other !== j &&
            workbookIdentity(other) === workbookIdentity(j) &&
            other.updatedAt > j.updatedAt &&
            (active.has(other.state) || other.state === "PUBLISHED"),
        ),
    );
    const current = dayJobs.find((j) => active.has(j.state) && !isPublished(j)),
      job = ready ?? failure ?? current;
    const pkg = job
      ? packages.find(
          (p) => p.id === job.workbookId && p.version === job.workbookVersion,
        )
      : published[0];
    return {
      date,
      jobs: dayJobs,
      packages,
      job,
      pkg,
      state: ready
        ? "action"
        : failure
          ? failure.state === "FAILED"
            ? "failed"
            : "action"
          : current
            ? "progress"
            : published.length
              ? "published"
              : "empty",
      label: ready
        ? "검토 필요"
        : failure
          ? failure.state === "FAILED"
            ? "실패 · 재시도"
            : "조치 필요"
          : current
            ? current.kind === "RENDER"
              ? "PDF 제작 중"
              : current.state === "QUEUED"
                ? "생성 대기"
                : "생성 중"
            : published.length
              ? "발행 완료"
              : "아직 요청 없음",
    };
  });
}
export function workerConnection(
  status: EngineStatus,
  now = Date.now(),
): { label: string; detail: string } {
  const valid = status.workers.filter(
    (w) => !w.revoked && Date.parse(w.expiresAt) > now,
  );
  if (!valid.length)
    return {
      label: "워커 연결 대기",
      detail: status.workers.some((w) => !w.revoked)
        ? "연결 기한이 만료되었습니다. 학습 코치의 에이전트 운영 설정에서 다시 연결하세요."
        : "학습 코치의 에이전트 운영 설정에서 워커 연결을 확인하세요.",
    };
  if (status.workerOnline)
    return {
      label: "워커 응답 확인",
      detail:
        "최근 2분 안에 응답했습니다. 설치된 워커의 다음 확인은 약 5분 주기입니다.",
    };
  const seen = Math.max(
    ...valid.map((w) => (w.lastSeenAt ? Date.parse(w.lastSeenAt) : 0)),
  );
  if (seen && now - seen <= 6 * 60_000)
    return {
      label: "다음 워커 확인 대기",
      detail: `마지막 응답 ${new Date(seen).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })} KST · 약 5분 주기로 확인합니다.`,
    };
  return {
    label: "워커 연결 대기",
    detail: seen
      ? "예상 확인 주기가 지났습니다. 로컬 워커 실행과 연결 기한을 확인하세요."
      : "아직 워커 응답이 없습니다. 로컬 워커를 실행하면 대기 중인 생성을 이어갑니다.",
  };
}
export function warningSummary(job: EngineJob): string[] {
  const warnings = [...(job.receipt?.warnings ?? []), ...(job.receipt?.quality?.warnings ?? [])],
    result: string[] = [];
  if (warnings.some((w) => /duration|minutes|30|time estimate|예상 풀이 시간/i.test(w)))
    result.push(
      "예상 학습 시간이 구성 목표와 다를 수 있습니다. 문항 분량을 확인하세요.",
    );
  if (warnings.length)
    result.push(
      "내용 정확성·모호한 문항·중복 여부를 직접 확인한 뒤 발행하세요.",
    );
  if (job.receipt?.error === "NEEDS_SOURCE_REVIEW")
    result.push("학습 문제 생성 실패: 출제할 본문 부족. 본문 범위와 자료 분석 상태를 확인하세요.");
  else if (job.receipt?.error === "QUALITY_REVIEW_REQUIRED") {
    result.push(job.state === "PARTIAL" ? "실패한 검사를 바탕으로 제한 내에서 다시 생성합니다."
      : "생성 결과를 발행할 수 없습니다. 검토 내역을 확인하고 새 요청을 시작하세요.");
    const reasons: Record<string, string> = {
      FRONT_MATTER_TRIVIA: "표지·판권 등 학습 목표와 관계없는 문항",
      REASONING_DEPTH: "사례 판단 또는 추론 단계 부족",
      SEMANTIC_DUPLICATION: "비슷한 질문 반복",
      CASE_WORKLOAD_TOO_LOW: "확장 사례의 풀이 분량 부족",
      WEAK_DISTRACTORS: "선택지 또는 오답 해설 부족",
      CONCEPT_COVERAGE: "일일 출제 목표와 근거가 맞지 않음",
      SOURCE_QUOTE_MISMATCH: "고정된 원문과 인용 불일치",
      HINT_ANSWER_LEAK: "힌트에 정답 노출 위험",
      HINT_PROGRESSION: "세 단계 힌트의 차이 또는 내용 부족",
    };
    for (const code of job.receipt?.quality?.issues ?? []) if (reasons[code]) result.push(reasons[code]);
  } else if (job.receipt?.error)
    result.push(
      "작업을 마치지 못했습니다. 원인 확인 후 해당 작업만 재시도할 수 있습니다.",
    );
  return result;
}
