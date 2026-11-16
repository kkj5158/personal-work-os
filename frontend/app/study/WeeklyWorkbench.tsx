"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouteState } from "@/components/RouteState";
import {
  addDays,
  weekStart,
  validDocumentPair,
  type DailyStudyPackage,
  type StudyDataPort,
  type StudySnapshot,
} from "@/lib/study/model";
import type { EngineJob } from "@/lib/study/engine";
import {
  jobStateLabel,
  weeklySlots,
  warningSummary,
  workerConnection,
} from "@/lib/study/workbench";
import { useEngine } from "./useEngine";
import { WorkbookCreation } from "./WorkbookCreation";
import { WorkbookReview } from "./WorkbookReview";
import { EngineJobSummary, JobDetail } from "./EngineJobSummary";
import { ManualWorkbookAdmin } from "./ServerTools";

export function WeeklyWorkbench({
  port,
  snapshot,
  onOpen,
  onMaterials,
}: {
  port: StudyDataPort;
  snapshot: StudySnapshot;
  onOpen: (pkg: DailyStudyPackage) => void;
  onMaterials: () => void;
}) {
  const engine = useEngine(port),
    [week, setWeek] = useRouteState("study-selected-week", weekStart());
  const [workspace, setWorkspace] = useState<
      "list" | "create" | "history" | "review"
    >("list"),
    [reviewId, setReviewId] = useState<string>(),
    [detailDate, setDetailDate] = useState<string>();
  const [historyJobs, setHistoryJobs] = useState<EngineJob[]>([]),
    [received, setReceived] = useState<EngineJob[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const recent = engine.status?.jobs;
  const signature = recent
    ?.filter(
      (j) =>
        j.week === week ||
        (j.date && j.date >= week && j.date <= addDays(week, 6)),
    )
    .map((j) => `${j.id}/${j.state}/${j.updatedAt}`)
    .join("|");
  useEffect(() => {
    let live = true;
    const load = async () => {
      await Promise.resolve();
      if (!live) return;
      setLoading(true);
      setLoadError("");
      try {
        if (!port.engine?.history) {
          if (live) setHistoryJobs([]);
          return;
        }
        let page = await port.engine.history(0, { week });
        const jobs = [...page.jobs];
        while (page.page + 1 < page.totalPages) {
          if (!live) return;
          page = await port.engine.history(page.page + 1, { week });
          jobs.push(...page.jobs);
        }
        if (live) setHistoryJobs(jobs);
      } catch (e) {
        if (live) setLoadError(String(e));
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [port, week, signature]);
  const jobs = useMemo(() => {
    const map = new Map<string, EngineJob>();
    for (const j of [...historyJobs, ...received, ...(recent ?? [])]) {
      const prior = map.get(j.id);
      if (!prior || j.updatedAt >= prior.updatedAt) map.set(j.id, j);
    }
    return [...map.values()];
  }, [historyJobs, received, recent]);
  const slots = useMemo(
    () => weeklySlots(week, snapshot, jobs),
    [week, snapshot, jobs],
  );
  const reviewJob = jobs.find((j) => j.id === reviewId),
    reviewPackage = snapshot.packages.find(
      (p) =>
        p.id === reviewJob?.workbookId &&
        p.version === reviewJob.workbookVersion,
    );
  const review = (job: EngineJob) => {
    setReviewId(job.id);
    setWorkspace("review");
  };
  const currentDetail = slots.find((s) => s.date === detailDate);
  const connection = engine.status
    ? workerConnection(engine.status)
    : undefined;
  const counts = (state: string) =>
    slots.filter((s) => s.state === state).length;
  return (
    <div className="study-workbench">
      {workspace !== "review" && (
        <header className="study-toolbar">
          <div>
            <h2>
              {workspace === "create"
                ? "새 문제집 만들기"
                : workspace === "history"
                  ? "학습 생성 관리"
                  : "주간 문제집"}
            </h2>
            <p>
              {week} ~ {addDays(week, 6)} · KST
            </p>
          </div>
          <div className="study-actions">
            {workspace !== "list" && (
              <button onClick={() => setWorkspace("list")}>
                ← 주간 목록으로
              </button>
            )}
            {workspace !== "create" && (
              <button
                className="study-primary"
                onClick={() => setWorkspace("create")}
              >
                새 문제집 만들기
              </button>
            )}
            {workspace === "list" && (
              <button onClick={() => setWorkspace("history")}>
                학습 생성 관리
              </button>
            )}
          </div>
        </header>
      )}
      <div hidden={workspace !== "create"}>
        <WorkbookCreation
          {...{
            port,
            snapshot,
            status: engine.status,
            blocked: engine.blocked,
            onMaterials,
          }}
          saveGoals={async (value) => {
            await engine.action("goals", value);
          }}
          onRequested={(date, newJobs) => {
            setReceived(newJobs);
            const start = weekStart(new Date(`${date}T03:00:00Z`));
            setWeek(start);
            void engine.refresh().catch((e) => engine.setMessage(String(e)));
          }}
        />
        {received.length > 0 && (
          <section className="study-panel">
            <h2>접수한 생성 요청</h2>
            <p>{received.map((j) => j.date).join(" · ")}</p>
            <p>
              실제 날짜별 결과와 누락 날짜는 주간 목록에서 확인하세요. 요청
              접수는 발행 완료가 아닙니다.
            </p>
            <button onClick={() => setWorkspace("list")}>
              날짜별 진행 상태 보기
            </button>
          </section>
        )}
      </div>
      {workspace === "list" && (
        <>
          <section className="study-panel">
            <div className="study-toolbar">
              <button
                onClick={() => {
                  setWeek(addDays(week, -7));
                  setDetailDate(undefined);
                }}
              >
                ← 이전 주
              </button>
              <label>
                선택 주
                <input
                  aria-label="주간 기준 날짜"
                  type="date"
                  value={week}
                  onChange={(e) => {
                    if (e.target.value)
                      setWeek(
                        weekStart(new Date(`${e.target.value}T03:00:00Z`)),
                      );
                  }}
                />
              </label>
              <button
                onClick={() => {
                  setWeek(addDays(week, 7));
                  setDetailDate(undefined);
                }}
              >
                다음 주 →
              </button>
            </div>
            <div className="study-week-counts">
              <span>
                조치 필요 <strong>{counts("action")}</strong>
              </span>
              <span>
                진행·대기 <strong>{counts("progress")}</strong>
              </span>
              <span>
                발행 완료 <strong>{counts("published")}</strong>
              </span>
              <span>
                실패 <strong>{counts("failed")}</strong>
              </span>
            </div>
            <p>
              {loading
                ? "해당 주의 모든 작업을 확인하는 중입니다."
                : loadError
                  ? "일부 이력을 불러오지 못했습니다. 아래 집계는 확인된 작업만 포함합니다."
                  : `발행된 날짜 ${slots.filter((s) => s.packages.some((p) => p.status === "published" && validDocumentPair(p))).length}/7 · 미요청 날짜 ${counts("empty")}개`}
            </p>
            {connection &&
              slots.some((s) =>
                s.jobs.some(
                  (j) => j.kind === "GENERATE" && j.state === "QUEUED",
                ),
              ) && (
                <p className="study-notice">
                  {connection.label} · {connection.detail}
                </p>
              )}
            {loadError && <p role="alert">{loadError}</p>}
          </section>
          <div className="study-week-list">
            {slots.map((slot, index) => (
              <article className="study-panel study-day-row" key={slot.date}>
                <div className="study-date-tile">
                  <span>
                    {["월", "화", "수", "목", "금", "토", "일"][index]}
                  </span>
                  <strong>{Number(slot.date.slice(-2))}</strong>
                </div>
                <div className="study-day-info">
                  <div className="study-row">
                    <h3>{slot.pkg?.topic ?? slot.date}</h3>
                    <span
                      className={`study-badge ${slot.state === "action" ? "study-badge-blue" : ""}`}
                    >
                      {slot.label}
                    </span>
                  </div>
                  <p>
                    {slot.date}
                    {slot.job?.workbookVersion
                      ? ` · v${slot.job.workbookVersion}`
                      : slot.pkg
                        ? ` · v${slot.pkg.version}`
                        : ""}
                  </p>
                  {slot.job &&
                    warningSummary(slot.job).map((w) => <p key={w}>{w}</p>)}
                  <div className="study-actions">
                    {slot.job ? (
                      <button
                        className={
                          slot.state === "action" ? "study-primary" : ""
                        }
                        onClick={() =>
                          slot.job!.kind === "GENERATE" &&
                          slot.job!.state === "READY"
                            ? review(slot.job!)
                            : setDetailDate(slot.date)
                        }
                      >
                        {slot.state === "action" && slot.job.state === "READY"
                          ? "문제집 검토"
                          : slot.state === "failed" || slot.state === "action"
                            ? "원인 확인·재시도"
                            : "진행 상태"}
                      </button>
                    ) : slot.state === "published" && slot.pkg ? (
                      <button onClick={() => onOpen(slot.pkg!)}>
                        문제집 열기
                      </button>
                    ) : (
                      <button onClick={() => setWorkspace("create")}>
                        생성 요청하기
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setDetailDate(
                          detailDate === slot.date ? undefined : slot.date,
                        )
                      }
                    >
                      실행 이력 {slot.jobs.length}건 · 버전{" "}
                      {slot.packages.length}개
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {currentDetail && (
            <section className="study-panel">
              <div className="study-toolbar">
                <h2>{currentDetail.date} · 실행 이력</h2>
                <button onClick={() => setDetailDate(undefined)}>
                  이력 닫기
                </button>
              </div>
              {currentDetail.packages.map((p) => (
                <p key={`${p.id}/${p.version}`}>
                  v{p.version} ·{" "}
                  {p.status === "published" ? "발행된 버전" : "검토 후보"}{" "}
                  <button onClick={() => onOpen(p)}>이 버전 열기</button>
                </p>
              ))}
              {currentDetail.jobs.map((j) => (
                <details key={j.id}>
                  <summary>
                    {j.workbookVersion ? `v${j.workbookVersion} · ` : ""}
                    {jobStateLabel(j)} · {j.createdAt?.slice(0, 10) ?? j.date}
                  </summary>
                  <JobDetail
                    job={j}
                    {...{
                      port,
                      blocked: engine.blocked,
                      action: engine.action,
                    }}
                    onReview={review}
                  />
                </details>
              ))}
              {!currentDetail.jobs.length && (
                <p>해당 날짜에 확인된 작업이 없습니다.</p>
              )}
            </section>
          )}
        </>
      )}
      {workspace === "history" && (
        <>
          <EngineJobSummary
            {...{ port, jobs, blocked: engine.blocked, action: engine.action }}
            initialWeek={week}
            onReview={review}
          />
          <ManualWorkbookAdmin port={port} />
        </>
      )}
      {workspace === "review" &&
        (reviewJob ? (
          <WorkbookReview
            key={reviewJob.id}
            job={reviewJob}
            pkg={reviewPackage}
            {...{
              port,
              jobs,
              blocked: engine.blocked,
              action: engine.action,
              onOpen,
            }}
            back={() => setWorkspace("list")}
          />
        ) : (
          <section className="study-panel">
            <p>선택한 작업을 불러오지 못했습니다.</p>
            <button onClick={() => setWorkspace("list")}>주간 목록으로</button>
          </section>
        ))}
      <p role="status">{engine.message}</p>
    </div>
  );
}
