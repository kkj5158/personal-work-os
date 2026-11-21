"use client";
import { useRef, useState } from "react";
import type { EngineAction, EngineJob } from "@/lib/study/engine";
import {
  validDocumentPair,
  type AnswerKey,
  type DailyStudyPackage,
  type StudyDataPort,
  type StudyPart,
} from "@/lib/study/model";
import {
  jobStateLabel,
  warningSummary,
  workbookIdentity,
} from "@/lib/study/workbench";
import { JobDetail } from "./EngineJobSummary";
import { kindLabel } from "./QuestionRenderer";

function Explanation({ answer }: { answer: AnswerKey }) {
  // Existing generation import appends the verified citations to this private field.
  const marker = answer.explanation.lastIndexOf("\n근거: ");
  let citations: { excerptId?: string; quote: string; label?: string }[] = answer.citations ?? [];
  if (!answer.citations && marker >= 0)
    try {
      const value = JSON.parse(answer.explanation.slice(marker + 5));
      if (Array.isArray(value))
        citations = value.filter((c) => c && typeof c.quote === "string");
    } catch {
      /* Manual keys may contain plain prose. */
    }
  return (
    <section className="study-answer">
      <h3>정답·해설</h3>
      <p className="study-prose">{answer.model}</p>
      <p className="study-prose">
        {!answer.citations && citations.length
          ? answer.explanation.slice(0, marker)
          : answer.explanation}
      </p>
      <h3>판단 기준</h3>
      <ul>
        {answer.rubric.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {citations.length ? (
        <>
          <h3>원문 근거</h3>
          {citations.map((c, i) => (
            <blockquote key={i}>
              {c.label && <small>{c.label}</small>}
              <p>{c.quote}</p>
              {c.excerptId && <details>
                <summary>기술 출처 보기</summary>
                {c.excerptId}
              </details>}
            </blockquote>
          ))}
        </>
      ) : (
        <p>
          별도 원문 인용을 확인할 수 없습니다. 제공된 해설과 출처 표기를 직접
          확인하세요.
        </p>
      )}
      {answer.incorrectReasons && (
        <details>
          <summary>오답 선택지 해설</summary>
          {Object.entries(answer.incorrectReasons).map(([id, reason]) => (
            <p key={id}>
              {id}: {reason}
            </p>
          ))}
        </details>
      )}
      {answer.followUp.length > 0 && <details>
        <summary>{answer.citations ? "오늘 더 생각할 질문 (선택)" : "더 생각하기"}</summary>
        {answer.followUp.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </details>}
    </section>
  );
}
export function WorkbookReview({
  job,
  pkg,
  port,
  jobs,
  blocked,
  action,
  back,
  onOpen,
}: {
  job: EngineJob;
  pkg?: DailyStudyPackage;
  port: StudyDataPort;
  jobs: EngineJob[];
  blocked: boolean;
  action: (action: EngineAction, data?: unknown) => Promise<unknown>;
  back: () => void;
  onOpen: (pkg: DailyStudyPackage) => void;
}) {
  const [keys, setKeys] = useState<AnswerKey[]>([]),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(false);
  const lock = useRef(false),
    render = jobs.find(
      (j) =>
        j.kind === "RENDER" && workbookIdentity(j) === workbookIdentity(job),
    );
  const published = pkg?.status === "published" && validDocumentPair(pkg);
  const review = async () => {
    if (lock.current || !pkg) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const a = await port.readAnswerKeys(pkg.id, pkg.version, "required"),
        b = await port.readAnswerKeys(pkg.id, pkg.version, "extension"),
        all = [...a, ...b];
      for (const part of ["required", "extension"] as StudyPart[])
        for (const q of pkg[part])
          if (
            !all.some(
              (k) =>
                k.binding.workbookId === pkg.id &&
                k.binding.workbookVersion === pkg.version &&
                k.binding.part === part &&
                k.binding.questionId === q.id &&
                k.binding.questionVersion === q.version,
            )
          )
            throw new Error(
              "일부 문항의 정확한 버전 정답을 확인하지 못했습니다.",
            );
      setKeys(all);
      setReviewed(true);
    } catch (e) {
      setMessage(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const approve = async () => {
    if (lock.current || !reviewed || !pkg) return;
    lock.current = true;
    setBusy(true);
    try {
      await action(`jobs/${job.id}/approve`);
      setConfirm(false);
      setMessage(
        "발행 승인을 저장했습니다. 실제 PDF 쌍 제작·검증 결과를 확인하세요.",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="study-review-workspace">
      <header className="study-workspace-header">
        <button onClick={back}>← 주간 목록으로</button>
        <div>
          <h2>문제집 검토</h2>
          <p>
            {pkg?.date ?? job.date} · {pkg?.topic ?? "본문 확인 중"}
          </p>
        </div>
        <span className="study-badge">
          {published
            ? "발행 완료"
            : render
              ? `PDF 제작 · ${jobStateLabel(render)}`
              : jobStateLabel(job)}
        </span>
      </header>
      <section className="study-panel">
        <p>
          {job.workbookId} v{job.workbookVersion} · 정책 v
          {pkg?.policyVersion ?? job.plan?.policy?.version ?? "확인 중"}
        </p>
        <p>
          필수 {pkg?.required.length ?? 0}문항 / 확장{" "}
          {pkg?.extension.length ?? 0}문항 · 문항과 정답은 이 버전에 고정됩니다.
        </p>
        <p>
          구조·인용 검증은 내용의 정확성을 보증하지 않습니다. 사실·난이도·중복
          여부를 확인하세요.
        </p>
        {job.receipt.quality?.learningObjective && <>
          <h3>학습 목표</h3>
          <p>{job.receipt.quality.learningObjective}</p>
          <details>
            <summary>문항별 근거와 출제 범위</summary>
            <ul>{job.receipt.quality.questions?.map(item => (
              <li key={item.part + "/" + item.order}>
                {item.part === "required" ? "필수" : "확장"} {item.order}번 · {item.pageRefs.join(", ")}
                {item.issues.length > 0 && " · 검토 필요"}
              </li>
            ))}</ul>
          </details>
        </>}
        {warningSummary(job).map((w) => (
          <p className="study-notice" key={w}>
            {w}
          </p>
        ))}
        {!reviewed && (
          <button
            className="study-primary"
            disabled={blocked || busy || !pkg}
            onClick={() => void review()}
          >
            {busy ? "정답 확인 중…" : "정답·해설·근거 열기"}
          </button>
        )}
      </section>
      {!pkg && (
        <p role="alert">
          이 버전의 본문을 아직 불러오지 못했습니다. 서버 새로고침 후 다시
          확인하세요.
        </p>
      )}
      {pkg &&
        (["required", "extension"] as const).map((part) => (
          <section key={part}>
            <h2>{part === "required" ? "필수 학습" : "확장 학습"}</h2>
            {pkg[part].map((q) => {
              const answer = keys.find(
                (k) =>
                  k.binding.workbookId === pkg.id &&
                  k.binding.workbookVersion === pkg.version &&
                  k.binding.part === part &&
                  k.binding.questionId === q.id &&
                  k.binding.questionVersion === q.version,
              );
              return (
                <article
                  className="study-review-question study-panel"
                  key={`${part}/${q.id}/${q.version}`}
                >
                  <div>
                    <span className="study-badge">
                      {q.order} · {kindLabel[q.kind]}
                    </span>
                    <h3>{q.prompt}</h3>
                    {q.context && <p className="study-case">{q.context}</p>}
                    {q.options?.map((o) => (
                      <p key={o.id}>
                        {o.id}. {o.text}
                      </p>
                    ))}
                    {q.guidance && <p>{q.guidance}</p>}
                    <p className="study-source">출처: {q.source.section.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "").replace(/[\s/·]+$/, "").trim() || "등록 자료"}</p>
                    <details><summary>출처 식별 정보</summary><p className="study-source">{q.source.materialId} · {q.source.section}</p></details>
                  </div>
                  {answer ? (
                    <Explanation answer={answer} />
                  ) : (
                    <div className="study-review-locked">
                      상단에서 정답·해설·근거를 명시적으로 열면 이곳에
                      표시됩니다.
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      <section className="study-panel">
        {published ? (
          <>
            <p>문제·해설 PDF 쌍의 발행이 확인되었습니다.</p>
            <button className="study-primary" onClick={() => onOpen(pkg!)}>
              문제집 열기
            </button>
          </>
        ) : render ? (
          <>
            <p>
              PDF 쌍 상태: {jobStateLabel(render)} · 두 파일 검증이 끝나기
              전에는 발행 완료가 아닙니다.
            </p>
            <JobDetail job={render} {...{ port, blocked, action }} />
          </>
        ) : (
          <>
            <button
              className="study-primary"
              disabled={blocked || busy || !reviewed || job.state !== "READY"}
              onClick={() => setConfirm(true)}
            >
              검토 후 PDF 발행
            </button>
            {confirm && (
              <div className="study-notice">
                <p>
                  <strong>
                    {job.workbookId} v{job.workbookVersion}
                  </strong>
                  의 문항·정답·근거를 검토했습니다. 이 버전의 PDF 발행을
                  승인할까요?
                </p>
                <div className="study-actions">
                  <button
                    disabled={blocked || busy}
                    onClick={() => void approve()}
                  >
                    이 버전 발행 승인
                  </button>
                  <button onClick={() => setConfirm(false)}>
                    검토 계속하기
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <p role="status">{message}</p>
        <details>
          <summary>이 버전의 추가 작업·기술 정보</summary>
          <JobDetail {...{ job, port, blocked, action }} />
        </details>
      </section>
    </div>
  );
}
