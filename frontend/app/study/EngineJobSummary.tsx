"use client";
import { useEffect, useRef, useState } from "react";
import type {
  EngineAction,
  EngineHistory,
  EngineJob,
  HistoryFilters,
} from "@/lib/study/engine";
import type { StudyDataPort } from "@/lib/study/model";
import {
  jobKindLabel,
  jobStateLabel,
  warningSummary,
} from "@/lib/study/workbench";

export function JobDetail({
  job,
  port,
  blocked,
  action,
  onReview,
}: {
  job: EngineJob;
  port: StudyDataPort;
  blocked: boolean;
  action: (action: EngineAction, data?: unknown) => Promise<unknown>;
  onReview?: (job: EngineJob) => void;
}) {
  const [message, setMessage] = useState("");
  const invoke = async (verb: string) => {
    try {
      await action(`jobs/${job.id}/${verb}` as EngineAction);
    } catch (e) {
      setMessage(String(e));
    }
  };
  const reissue = async () => {
    if (
      !window.confirm(
        `${job.workbookId} v${job.workbookVersion}의 동일 문항으로 새 버전을 만들까요? 새 검토·승인이 필요합니다.`,
      )
    )
      return;
    try {
      const key = `study-reissue-v3/${port.getSnapshot().ownerId}/${job.id}`;
      let operationId = sessionStorage.getItem(key);
      if (!operationId) {
        operationId = crypto.randomUUID();
        sessionStorage.setItem(key, operationId);
      }
      await action(`jobs/${job.id}/reissue`, { operationId });
      setMessage(
        "새 버전 요청을 저장했습니다. 실행 이력에서 새 버전을 검토하세요.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  };
  return (
    <article className="study-job-detail">
      <h3>
        {jobKindLabel[job.kind]} · {job.date ?? job.week ?? "날짜 미지정"} ·{" "}
        {jobStateLabel(job)}
      </h3>
      {job.workbookId && (
        <p>
          {job.workbookId} v{job.workbookVersion}
        </p>
      )}
      {warningSummary(job).map((w) => (
        <p className="study-notice" key={w}>
          {w}
        </p>
      ))}
      <div className="study-actions">
        {job.kind === "GENERATE" &&
          ["READY", "PUBLISHED"].includes(job.state) &&
          onReview && (
            <button disabled={blocked} onClick={() => onReview(job)}>
              문제집 검토
            </button>
          )}
        {["QUEUED", "PARTIAL"].includes(job.state) &&
          ["INDEX", "PLAN", "RENDER"].includes(job.kind) && (
            <button disabled={blocked} onClick={() => void invoke("run")}>
              이 단계 계속 진행
            </button>
          )}
        {["FAILED", "BLOCKED", "PARTIAL"].includes(job.state) && job.receipt?.error !== "QUALITY_REVIEW_REQUIRED" && (
          <button disabled={blocked} onClick={() => void invoke("retry")}>
            제한 내 재시도
          </button>
        )}
      </div>
      <details>
        <summary>기술 정보 보기</summary>
        <p>
          작업 {job.id} · {job.kind} / {job.state}
        </p>
        <p>
          시도 {job.attempts} · 체크포인트 {job.checkpoint} · {job.updatedAt}
        </p>
        <pre>{JSON.stringify(job.receipt, null, 2)}</pre>
        {job.plan && (
          <details>
            <summary>고정된 요청 구성</summary>
            <pre>{JSON.stringify(job.plan, null, 2)}</pre>
          </details>
        )}
        <div className="study-actions">
          {job.kind === "GENERATE" &&
            ["READY", "PUBLISHED"].includes(job.state) && (
              <button disabled={blocked} onClick={() => void reissue()}>
                동일 문항으로 새 버전 요청
              </button>
            )}
          {!["PUBLISHED", "CANCELLED"].includes(job.state) && (
            <button
              disabled={blocked}
              onClick={() => {
                if (
                  window.confirm(
                    `${jobKindLabel[job.kind]} 작업을 취소할까요? (${job.id})`,
                  )
                )
                  void invoke("cancel");
              }}
            >
              이 작업 취소
            </button>
          )}
        </div>
      </details>
      <p role="status">{message}</p>
    </article>
  );
}

export function EngineJobSummary({
  port,
  jobs,
  blocked,
  action,
  onReview,
  initialWeek,
}: {
  port: StudyDataPort;
  jobs: EngineJob[];
  blocked: boolean;
  action: (action: EngineAction, data?: unknown) => Promise<unknown>;
  onReview?: (job: EngineJob) => void;
  initialWeek?: string;
}) {
  const [filters, setFilters] = useState<HistoryFilters>({ week: initialWeek }),
    [page, setPage] = useState(0),
    [result, setResult] = useState<EngineHistory>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const serial = useRef(0);
  useEffect(() => {
    const token = ++serial.current;
    let active = true;
    const load = Promise.resolve().then(() => {
      if (!active || serial.current !== token) return;
      setLoading(true);
      setError("");
      return port.engine?.history
        ? port.engine.history(page, filters)
        : Promise.resolve({
            jobs: jobs.filter(
              (j) =>
                (!filters.kind || j.kind === filters.kind) &&
                (!filters.state || j.state === filters.state) &&
                (!filters.date || j.date === filters.date) &&
                (!filters.week || j.week === filters.week),
            ),
            page: 0,
            totalPages: 1,
            totalElements: jobs.length,
          });
    });
    void load
      .then((next) => {
        if (active && serial.current === token && next) setResult(next);
      })
      .catch((e) => {
        if (active && serial.current === token) setError(String(e));
      })
      .finally(() => {
        if (active && serial.current === token) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [port, page, filters, jobs]);
  const change = (key: keyof HistoryFilters, value: string) => {
    setPage(0);
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };
  return (
    <section className="study-panel">
      <h2>실행 이력</h2>
      <p>모든 시도와 버전을 보존합니다. 한 페이지에 최대 50개를 표시합니다.</p>
      <div className="study-history-filters">
        <label className="study-field">
          주 시작일
          <input
            type="date"
            value={filters.week ?? ""}
            onChange={(e) => change("week", e.target.value)}
          />
        </label>
        <label className="study-field">
          작업 종류
          <select
            value={filters.kind ?? ""}
            onChange={(e) => change("kind", e.target.value)}
          >
            <option value="">전체 종류</option>
            {Object.entries(jobKindLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="study-field">
          상태
          <select
            value={filters.state ?? ""}
            onChange={(e) => change("state", e.target.value)}
          >
            <option value="">전체 상태</option>
            {[
              "QUEUED",
              "RUNNING",
              "PARTIAL",
              "READY",
              "PUBLISHED",
              "FAILED",
              "BLOCKED",
              "CANCELLED",
            ].map((state) => (
              <option key={state} value={state}>
                {state === "READY"
                  ? "처리됨 / 생성 검토 필요"
                  : jobStateLabel({ state, kind: "GENERATE" } as EngineJob)}
              </option>
            ))}
          </select>
        </label>
        <label className="study-field">
          학습 날짜
          <input
            type="date"
            value={filters.date ?? ""}
            onChange={(e) => change("date", e.target.value)}
          />
        </label>
      </div>
      <button
        onClick={() => {
          setFilters({});
          setPage(0);
        }}
      >
        전체 기간 보기
      </button>
      <p role="status">
        {loading
          ? "이력 확인 중…"
          : `${result?.totalElements ?? 0}개 작업 · ${page + 1}페이지`}{" "}
        {error}
      </p>
      {!loading &&
        result?.jobs.map((job) => (
          <details key={job.id} className="study-history-row">
            <summary>
              {job.date ??
                job.week ??
                job.createdAt?.slice(0, 10) ??
                "날짜 미지정"}{" "}
              · {jobKindLabel[job.kind]} · {jobStateLabel(job)}
              {job.workbookVersion ? ` · v${job.workbookVersion}` : ""}
            </summary>
            <JobDetail {...{ job, port, blocked, action, onReview }} />
          </details>
        ))}
      <div className="study-actions">
        <button
          disabled={loading || page === 0}
          onClick={() => setPage(page - 1)}
        >
          이전 이력
        </button>
        <button
          disabled={loading || !result || page + 1 >= result.totalPages}
          onClick={() => setPage(page + 1)}
        >
          다음 이력
        </button>
      </div>
    </section>
  );
}
