"use client";
import { useEffect, useRef, useState } from "react";
import {
  addDays,
  kstDate,
  weekStart,
  type StudyDataPort,
  type StudySnapshot,
} from "@/lib/study/model";
import type { EngineStatus, PlanPreview, EngineJob } from "@/lib/study/engine";
import {
  planIntentKey,
  readPlanIntent,
  savePlanIntent,
  type PlanIntent,
} from "@/lib/study/planIntent";
import { workerConnection } from "@/lib/study/workbench";
import { kindLabel } from "./QuestionRenderer";
import { ApiError } from "@/lib/api/client";
import { useRouteState } from "@/components/RouteState";

export function GoalEditor({
  goals,
  disabled,
  save,
  draftKey = "study-goals-draft",
}: {
  goals: EngineStatus["goals"];
  disabled: boolean;
  save: (goals: EngineStatus["goals"]) => Promise<void>;
  draftKey?: string;
}) {
  const [value, setValue] = useRouteState(draftKey, goals);
  const [message, setMessage] = useState("");
  return (
    <details className="study-panel">
      <summary>학습 구성 변경</summary>
      <label className="study-field">
        학습 목표
        <textarea
          maxLength={2000}
          value={value.goal}
          onChange={(e) => setValue({ ...value, goal: e.target.value })}
        />
      </label>
      <label className="study-field">
        직접 등록한 관심사
        <textarea
          maxLength={2000}
          value={value.interests}
          onChange={(e) => setValue({ ...value, interests: e.target.value })}
        />
      </label>
      {(["new", "review", "application"] as const).map((key) => (
        <label className="study-field" key={key}>
          {key === "new" ? "새 개념" : key === "review" ? "복습" : "통합 적용"}{" "}
          (%)
          <input
            type="number"
            min={0}
            max={100}
            value={value.weeklyTarget[key]}
            onChange={(e) =>
              setValue({
                ...value,
                weeklyTarget: {
                  ...value.weeklyTarget,
                  [key]: Number(e.target.value),
                },
              })
            }
          />
        </label>
      ))}
      <p>
        합계 100% · 제출한 출처의 복습 기록이 없으면 복습 비중을 새 개념에
        배분합니다.
      </p>
      <button
        disabled={
          disabled ||
          !value.goal.trim() ||
          Object.values(value.weeklyTarget).some(
            (v) => !Number.isInteger(v) || v < 0 || v > 100,
          ) ||
          Object.values(value.weeklyTarget).reduce((a, b) => a + b, 0) !== 100
        }
        onClick={async () => {
          try {
            await save(value);
            setMessage("다음 계획에 적용할 구성을 저장했습니다.");
          } catch (e) {
            setMessage(String(e));
          }
        }}
      >
        학습 구성 저장
      </button>
      <p role="status">{message}</p>
    </details>
  );
}

export function WorkbookCreation({
  port,
  snapshot,
  status,
  onRequested,
  onMaterials,
  saveGoals,
  blocked,
}: {
  port: StudyDataPort;
  snapshot: StudySnapshot;
  status?: EngineStatus;
  onRequested: (date: string, jobs: EngineJob[]) => void;
  onMaterials: () => void;
  saveGoals: (goals: EngineStatus["goals"]) => Promise<void>;
  blocked: boolean;
}) {
  const [days, setDays] = useRouteState<1 | 7>(
      `study-create-days/${snapshot.ownerId}`,
      7,
    ),
    [day, setDay] = useRouteState(
      `study-create-date/${snapshot.ownerId}`,
      kstDate,
    ),
    [selected, setSelected] = useRouteState<string[] | null>(
      `study-create-sources/${snapshot.ownerId}`,
      null,
    );
  const [pilot, setPilot] = useState(false);
  const [golden, setGolden] = useState<File>();
  const [preview, setPreview] = useState<PlanPreview>(),
    [intent, setIntent] = useState<PlanIntent>(),
    [ranges, setRanges] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const lock = useRef(false),
    date = intent?.date ?? (days === 7 ? addDays(weekStart(), 7) : day),
    owner = snapshot.ownerId ?? "",
    goalsSignature = JSON.stringify(status?.goals);
  const chosen =
    selected ??
    snapshot.sources
      .filter(
        (s) =>
          s.included &&
          status?.sources?.some(
            (i) => i.materialId === s.id && i.state === "ready" && i.active,
          ),
      )
      .map((s) => s.id);
  useEffect(() => {
    if (!owner) return;
    let live = true;
    void Promise.resolve().then(() => {
      if (!live) return;
      try {
        const stored = readPlanIntent(sessionStorage, owner);
        if (stored) {
          setIntent(stored);
          setDays(stored.days);
          setDay(stored.date);
          setSelected(stored.materialIds);
          setRanges(Object.fromEntries(Object.entries(stored.sourceRanges ?? {}).map(([id, range]) =>
            [id, String(range.firstPage) + "-" + range.lastPage])));
        }
      } catch (e) {
        setMessage(String(e));
      } finally {
        setLoaded(true);
      }
    });
    return () => {
      live = false;
    };
  }, [owner, setDay, setDays, setSelected]);
  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() => {
        if (!live) return;
        setPreview(undefined);
        return port.engine?.preview?.(date);
      })
      .then((p) => {
        if (live && p) setPreview(p);
      })
      .catch((e) => {
        if (live) setMessage(String(e));
      });
    return () => {
      live = false;
    };
  }, [port, date, goalsSignature]);
  const request = async () => {
    if (lock.current || !owner || !loaded) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const sourceRanges: NonNullable<PlanIntent["sourceRanges"]> = {};
      if (!intent) for (const id of chosen) {
        const value = ranges[id]?.trim();
        if (!value) continue;
        const match = /^(\d{1,4})\s*[-–]\s*(\d{1,4})$/.exec(value);
        const firstPage = Number(match?.[1]), lastPage = Number(match?.[2]);
        const maxPage = status?.sources?.find(source => source.materialId === id)?.physicalPages || 2000;
        if (!match || firstPage < 1 || firstPage > lastPage || lastPage > maxPage) {
          setMessage("장 범위는 PDF의 실제 페이지 번호로 입력하세요. 예: 26-53");
          return;
        }
        sourceRanges[id] = { firstPage, lastPage };
      }
      const request = intent ?? {
        date,
        days,
        materialIds: [...chosen].sort(),
        ...(Object.keys(sourceRanges).length ? { sourceRanges } : {}),
        ...(pilot && status?.ownerAuthoringPilot && days===1 && chosen.length===1 ? {authoringPolicy:"study-education-v1-golden-v2" as const} : {}),
        operationId: crypto.randomUUID(),
      };
      savePlanIntent(sessionStorage, owner, request);
      setIntent(request);
      const result = (await port.engine!.action(
        "plan",
        request.authoringPolicy && golden ? {...request,goldenJson:await golden.text()} : request,
      )) as EngineJob[];
      setMessage(
        "생성 요청이 접수되었습니다. 각 날짜의 진행 상태를 확인하세요.",
      );
      onRequested(request.date, result);
    } catch (e) {
      if (e instanceof ApiError && e.details.code === "NEEDS_SOURCE_REVIEW") {
        sessionStorage.removeItem(planIntentKey(owner));
        setIntent(undefined);
        setMessage("학습 문제 생성 실패: " + e.message);
        return;
      }
      setMessage(
        `요청 결과를 확인하지 못했습니다. 같은 요청 다시 확인을 누르면 중복 생성 없이 이어집니다. ${String(e)}`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const frozen = !!intent;
  return (
    <div className="study-creation">
      <section className="study-panel">
        <h2>1. 학습 자료 선택</h2>
        <p>현재 버전의 분석이 끝난 자료만 선택할 수 있습니다.</p>
        {snapshot.sources.map((source) => {
          const state = status?.sources?.find(
              (s) => s.materialId === source.id,
            ),
            eligible = state?.state === "ready" && state.active;
          return (
            <div key={source.id}>
            <label className="study-source-choice">
              <input
                type="checkbox"
                checked={chosen.includes(source.id)}
                disabled={frozen || !eligible || busy}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...chosen, source.id]
                      : chosen.filter((id) => id !== source.id),
                  )
                }
              />
              <span>
                <strong>{source.title}</strong>
                <small>
                  {source.scope} · 자료 v{source.version ?? 1}
                </small>
                <small>
                  {eligible
                    ? "사용 가능"
                    : !state
                      ? "분석 상태 확인 중"
                      : state.state === "needs_source_check"
                        ? "원문 확인 필요 · 분석 가능한 텍스트가 부족합니다"
                        : state.state === "failed"
                          ? "분석 실패 · 학습 자료에서 재시도하세요"
                          : !state.active
                            ? "비활성 자료"
                            : "현재 버전의 분석이 필요합니다"}
                </small>
              </span>
            </label>
            {eligible && chosen.includes(source.id) && <label className="study-actions">
              장 범위 (PDF 쪽, 선택)
              <input type="text" size={12} maxLength={12} aria-label={source.title + " PDF 페이지 범위"}
                placeholder="예: 26-53" disabled={frozen || busy} value={ranges[source.id] ?? ""}
                onChange={event => setRanges(previous => ({ ...previous, [source.id]: event.target.value }))} />
              {!!state?.physicalPages && <small>전체 {state.physicalPages}쪽</small>}
            </label>}
            </div>
          );
        })}
        {!chosen.length && (
          <div className="study-notice">
            <p>사용 가능한 자료를 선택하거나 PDF를 등록·분석하세요.</p>
            <button onClick={onMaterials}>학습 자료로 이동</button>
          </div>
        )}
      </section>
      <section className="study-panel">
        <h2>2. 생성 기간</h2>
        <label className="study-coverage-option">
          <input
            type="radio"
            name="creation-period"
            checked={days === 7}
            disabled={frozen || busy}
            onChange={() => setDays(7)}
          />
          다음 주 월~일 7일치
        </label>
        <label className="study-coverage-option">
          <input
            type="radio"
            name="creation-period"
            checked={days === 1}
            disabled={frozen || busy}
            onChange={() => setDays(1)}
          />
          하루치 시험 생성
        </label>
        {days === 1 && (
          <label className="study-field">
            학습 날짜 (KST)
            <input
              type="date"
              min={kstDate()}
              max={addDays(kstDate(), 90)}
              value={day}
              disabled={frozen || busy}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
        )}
        <p>
          {date}
          {days === 7 ? ` ~ ${addDays(date, 6)}` : ""} · 계획할 때 이 기간과
          자료 버전을 고정합니다.
        </p>
        <small>
          일요일 자동 예약:{" "}
          {status?.schedule.enabled ? "켜짐 (저장된 설정)" : "꺼짐"} · 이 요청은
          예약 설정을 바꾸지 않습니다.
        </small>
      </section>
      <section className="study-panel">
        <h2>3. 학습 구성 확인</h2>
        {preview ? (
          <>
            <p>
              승인 정책 v{preview.policy.version} ·{" "}
              {preview.policy.effectiveWeek} 적용
            </p>
            {(["required", "extension"] as const).map((part) => (
              <p key={part}>
                <strong>
                  {part === "required" ? "필수" : "확장"}{" "}
                  {part === "extension" ? "추가 " : ""}
                  {preview.minutes[part]}분
                </strong>{" "}
                ·{" "}
                {Object.entries(preview.questionFormat[part])
                  .map(
                    ([kind, count]) =>
                      `${kindLabel[kind as keyof typeof kindLabel] ?? kind} ${count}문항`,
                  )
                  .join(" + ")}
              </p>
            ))}
            <p>
              새 개념 {preview.goals.weeklyTarget.new}% · 복습{" "}
              {preview.goals.weeklyTarget.review}% · 통합 적용{" "}
              {preview.goals.weeklyTarget.application}%
            </p>
            <p>
              해설:{" "}
              {preview.policy.explanation === "intuitive"
                ? "비유·실제 사례 중심"
                : "기본 개념 설명"}{" "}
              · 하루 출처 구절 최대 {preview.sourceLimit}개
            </p>
          </>
        ) : (
          <p role="status">실제 승인된 학습 구성을 확인하는 중입니다.</p>
        )}
      </section>
      {status && (
        <GoalEditor
          draftKey={`study-goals-draft/${owner}`}
          goals={status.goals}
          disabled={blocked || busy || frozen}
          save={saveGoals}
        />
      )}
      <section className="study-panel">
        <h2>4. 검토 후 생성 요청</h2>
        {status?.ownerAuthoringPilot && days===1 && chosen.length===1 && <label><input type="checkbox" checked={pilot} onChange={e=>setPilot(e.target.checked)} /> 선택한 본문 범위로 문항별 비공개 보정 실행</label>}
        {pilot && status?.ownerAuthoringPilot && <label>보정용 승인 예시 파일 <input type="file" accept=".json" onChange={e=>setGolden(e.target.files?.[0])} /></label>}
        <p>
          {chosen.length}개 자료 · {days}일치 · 정답 검토와 명시적 발행 승인은
          생성 후 별도로 진행합니다.
        </p>
        {status && (
          <p className="study-notice">
            {workerConnection(status).label} · {workerConnection(status).detail}
          </p>
        )}
        <div className="study-actions">
          <button
            className="study-primary"
            disabled={
              blocked ||
              busy ||
              !loaded ||
              !preview ||
              !chosen.length ||
              !date ||
              date < kstDate() ||
              date > addDays(kstDate(), 90)
            }
            onClick={() => void request()}
          >
            {busy
              ? "요청 확인 중…"
              : intent
                ? "같은 요청 다시 확인"
                : "선택한 구성으로 생성 요청"}
          </button>
          {intent && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "기존 요청은 유지됩니다. 별도의 생성 요청을 시작할까요?",
                  )
                ) {
                  sessionStorage.removeItem(planIntentKey(owner));
                  setIntent(undefined);
                  setMessage("");
                }
              }}
            >
              별도 새 요청 시작
            </button>
          )}
        </div>
        <p role="status">{message}</p>
        {intent && (
          <details>
            <summary>요청 기술 정보</summary>
            <pre>{JSON.stringify(intent, null, 2)}</pre>
          </details>
        )}
      </section>
    </div>
  );
}
