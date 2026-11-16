"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouteState } from "@/components/RouteState";
import type {
  EngineJob,
  EngineStatus,
  SourceExcerpt,
} from "@/lib/study/engine";
import type {
  StudyAsset,
  StudyDataPort,
  StudySnapshot,
  StudySource,
} from "@/lib/study/model";
import {
  materialStateLabel,
  type MaterialAnalysis,
} from "@/lib/study/materials";
import { MaterialsOnboarding } from "./MaterialsOnboarding";
import { openPrivateFile } from "./ServerTools";

function MaterialDetail({
  source,
  port,
  analysis,
  files,
  job,
  changed,
}: {
  source: StudySource;
  port: StudyDataPort;
  analysis?: MaterialAnalysis;
  files: StudyAsset[];
  job?: EngineJob;
  changed: () => Promise<void>;
}) {
  const [draft, setDraft] = useRouteState(
    `study-material-edit:${port.getSnapshot().ownerId ?? port.mode}:${source.id}`,
    source,
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [term, setTerm] = useState(""),
    [page, setPage] = useState(0),
    [excerpts, setExcerpts] = useState<SourceExcerpt[]>([]);
  const lock = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
      await changed();
    } catch (error) {
      setMessage(String(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const index = async (assetId: string, version = source.version) => {
    if (!port.engine || !version)
      throw new Error("현재 자료 버전을 확인할 수 없습니다.");
    const job = (await port.engine.action(`index/${assetId}`, {
      materialVersion: version,
    })) as { id: string; state: string };
    if (["FAILED", "BLOCKED"].includes(job.state))
      await port.engine.action(`jobs/${job.id}/retry`);
    if (["QUEUED", "PARTIAL", "FAILED", "BLOCKED"].includes(job.state))
      await port.engine.action(`jobs/${job.id}/run`);
    setMessage("분석 요청을 확인했습니다. 자료 목록의 실제 결과를 확인하세요.");
  };
  const save = async () => {
    const current = port
      .getSnapshot()
      .sources.find((item) => item.id === source.id);
    if (draft.version !== current?.version)
      throw new Error(
        "다른 화면에서 자료 설정이 바뀌었습니다. 현재 설정 불러오기로 확인한 뒤 다시 저장하세요.",
      );
    if (port.getSnapshot().connection?.state === "error") {
      await port.retry?.();
      return;
    }
    await port.updateSource(draft);
    const next = port
      .getSnapshot()
      .sources.find((item) => item.id === source.id);
    if (next) setDraft(next);
    if (analysis?.assetId && next?.version)
      await index(analysis.assetId, next.version);
    else
      setMessage(
        "자료 설정을 저장했습니다. PDF를 추가하면 분석할 수 있습니다.",
      );
  };
  const search = async (next: number) => {
    if (!port.engine) return;
    setExcerpts(
      await port.engine.search(source.id, term, next, analysis?.jobId),
    );
    setPage(next);
  };
  return (
    <section className="study-panel" aria-label={`${source.title} 상세`}>
      <h2>{source.title}</h2>
      <p>
        {source.domain} · 자료 v{source.version ?? "샘플"} · {source.scope}
      </p>
      <details>
        <summary>자료 설정 변경</summary>
        <label className="study-field">
          자료 제목
          <input
            maxLength={1000}
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </label>
        <label className="study-field">
          분야
          <input
            maxLength={1000}
            value={draft.domain}
            onChange={(event) =>
              setDraft({ ...draft, domain: event.target.value })
            }
          />
        </label>
        <label className="study-field">
          학습 범위
          <textarea
            maxLength={16000}
            value={draft.scope}
            onChange={(event) =>
              setDraft({ ...draft, scope: event.target.value })
            }
          />
        </label>
        <label className="study-field">
          학습 비중
          <input
            type="number"
            min={0}
            max={100}
            value={draft.weight}
            onChange={(event) =>
              setDraft({ ...draft, weight: Number(event.target.value) })
            }
          />
        </label>
        <label className="study-coverage-option">
          <input
            type="checkbox"
            checked={draft.active !== false}
            onChange={(event) =>
              setDraft({ ...draft, active: event.target.checked })
            }
          />
          활성 자료
        </label>
        <div className="study-actions">
          <button
            disabled={
              busy ||
              !draft.title.trim() ||
              !draft.domain.trim() ||
              !draft.scope.trim() ||
              !Number.isInteger(draft.weight) ||
              draft.weight < 0 ||
              draft.weight > 100
            }
            onClick={() => void run(save)}
          >
            자료 설정 저장
          </button>
          <button disabled={busy} onClick={() => setDraft(source)}>
            현재 설정 불러오기
          </button>
        </div>
        <p>
          설정 변경은 새 자료 버전으로 저장됩니다. 연결된 PDF는 새 버전으로
          분석하며 기존 문제집은 유지됩니다.
        </p>
      </details>
      {analysis?.state === "needs_source_check" && (
        <p role="alert">
          사용 가능한 텍스트가 없습니다. 원본의 텍스트층을 확인하세요. 이 자료는
          생성에 사용할 수 없습니다.
        </p>
      )}
      {port.engine &&
        files
          .filter((file) => ["READY", "ATTACHED"].includes(file.state))
          .map((file) => (
            <div key={file.id} className="study-actions">
              <span>{file.name}</span>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await openPrivateFile(port, file.id, file.name);
                  })
                }
              >
                비공개 원본 다운로드
              </button>
              <button
                disabled={
                  busy || port.getSnapshot().connection?.state !== "ready"
                }
                onClick={() => void run(() => index(file.id))}
              >
                {analysis?.state === "failed"
                  ? "분석 재시도"
                  : "현재 버전 분석"}
              </button>
            </div>
          ))}
      {port.engine && (
        <details>
          <summary>원문 검색·기술 정보</summary>
          <p>
            등록된 PDF의 기존 텍스트층만 조회합니다. 재OCR은 수행하지 않습니다.
          </p>
          <label className="study-field">
            원문 검색
            <input
              maxLength={120}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </label>
          <button disabled={busy} onClick={() => void run(() => search(0))}>
            검색·원문 페이지 보기
          </button>
          {excerpts.map((excerpt) => (
            <details key={excerpt.id}>
              <summary>
                PDF {excerpt.pageIndex}쪽
                {excerpt.pageLabel ? ` · 인쇄 라벨 ${excerpt.pageLabel}` : ""} ·
                자료 v{excerpt.materialVersion} ·{" "}
                {excerpt.quality === "usable"
                  ? "분석된 텍스트"
                  : "원문 확인 필요"}
              </summary>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {excerpt.text || "텍스트층이 없습니다."}
              </p>
              <small>
                {excerpt.id} · {excerpt.parserVersion} · {excerpt.quality}
              </small>
            </details>
          ))}
          <div className="study-actions">
            <button
              disabled={busy || page === 0}
              onClick={() => void run(() => search(page - 1))}
            >
              이전
            </button>
            <span>{page + 1}페이지 · 최대 30구절</span>
            <button
              disabled={busy || excerpts.length < 30}
              onClick={() => void run(() => search(page + 1))}
            >
              다음
            </button>
          </div>
          <p>
            분석 작업 {analysis?.jobId ?? "없음"} · 사용 가능한 구절{" "}
            {analysis?.usableExcerptCount ?? 0}개 (현재 계획 조회 한도 내)
          </p>
          {job && (
            <details>
              <summary>분석 작업 기술 정보 보기</summary>
              <p>
                {job.state} · 시도 {job.attempts} · 체크포인트 {job.checkpoint}{" "}
                · {job.updatedAt}
              </p>
              <pre>{JSON.stringify(job.receipt, null, 2)}</pre>
            </details>
          )}
        </details>
      )}
      <p role="status">{message}</p>
    </section>
  );
}

export function MaterialsExperience({
  port,
  snapshot,
}: {
  port: StudyDataPort;
  snapshot: StudySnapshot;
}) {
  const [status, setStatus] = useState<EngineStatus>(),
    [files, setFiles] = useState<StudyAsset[]>([]);
  const [message, setMessage] = useState(""),
    [selected, setSelected] = useRouteState<string | undefined>(
      "study-material-selected",
      undefined,
    );
  const [creating, setCreating] = useRouteState(
    "study-material-creating",
    false,
  );
  const [uploadFor, setUploadFor] = useRouteState<string | undefined>(
    "study-material-upload-for",
    undefined,
  );
  const [serial, setSerial] = useRouteState("study-material-create-serial", 0);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const locked = useRef(false),
    live = useRef(true),
    loading = useRef(false);
  const load = useCallback(async () => {
    if (!port.engine || loading.current) return;
    loading.current = true;
    try {
      const [next, assets] = await Promise.all([
        port.engine.status(),
        port.listAssets?.() ?? Promise.resolve([]),
      ]);
      if (live.current) {
        setStatus(next);
        setFiles(assets);
        setFailure("");
      }
    } catch (error) {
      if (live.current) setFailure(String(error));
    } finally {
      loading.current = false;
    }
  }, [port]);
  useEffect(() => {
    live.current = true;
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live.current = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);
  const analyses = (status as { sources?: MaterialAnalysis[] } | undefined)
    ?.sources;
  const source = snapshot.sources.find((item) => item.id === selected);
  const uploadSource = snapshot.sources.find((item) => item.id === uploadFor);
  const done = (result: string) => {
    setCreating(false);
    setUploadFor(undefined);
    setSerial((value) => value + 1);
    setMessage(result);
    void load();
  };
  const include = async (item: StudySource, included: boolean) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      await port.updateSource({ ...item, included });
      const current = port
        .getSnapshot()
        .sources.find((value) => value.id === item.id);
      const analysis = analyses?.find((value) => value.materialId === item.id);
      if (port.engine && analysis?.assetId && current?.version) {
        const job = (await port.engine.action(`index/${analysis.assetId}`, {
          materialVersion: current.version,
        })) as { id: string; state: string };
        if (["QUEUED", "PARTIAL"].includes(job.state))
          await port.engine.action(`jobs/${job.id}/run`);
      }
      setMessage(
        "문제집 포함 설정을 저장했습니다. 분석 결과는 아래에서 확인하세요.",
      );
      await load();
    } catch (error) {
      setMessage(
        `설정 또는 분석 확인이 필요합니다. 자료 상세에서 다시 확인하세요. ${String(error)}`,
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  if (creating || uploadSource)
    return (
      <MaterialsOnboarding
        key={`${uploadSource?.id ?? "new"}/${serial}`}
        draftKey={String(serial)}
        port={port}
        source={uploadSource}
        done={done}
        close={() => {
          setCreating(false);
          setUploadFor(undefined);
        }}
      />
    );
  return (
    <>
      <div className="study-toolbar">
        <div>
          <h2>학습 자료</h2>
          <p>PDF 등록부터 분석까지 한 번에 진행합니다.</p>
        </div>
        {port.mode === "server" && (
          <button className="study-primary" onClick={() => setCreating(true)}>
            교재 등록
          </button>
        )}
      </div>
      {port.mode === "demo" && (
        <p className="study-notice">
          공개 샘플 · 자료 메타데이터만 메모리에 저장합니다. PDF 업로드·분석은
          실행하지 않습니다.
        </p>
      )}
      <p role="status">{message}</p>
      {failure && (
        <p className="study-error" role="alert">
          자료 분석 상태를 확인하지 못했습니다. {failure}{" "}
          <button onClick={() => void load()}>상태 다시 확인</button>
        </p>
      )}
      <div className="study-material-library">
        {snapshot.sources.length === 0 && (
          <div className="study-empty">
            <h3>첫 교재를 등록하세요</h3>
            <p>분석된 텍스트가 있는 자료로 문제집을 만들 수 있습니다.</p>
          </div>
        )}
        {snapshot.sources.map((item) => {
          const analysis = analyses?.find(
            (value) =>
              value.materialId === item.id &&
              value.materialVersion === item.version,
          );
          const uploading = files.some(
            (file) => file.materialId === item.id && file.state === "UPLOADING",
          );
          return (
            <article className="study-panel study-material-card" key={item.id}>
              <div>
                <h3>{item.title}</h3>
                <p>
                  {item.domain} · {item.scope}
                </p>
                <span className="study-badge">
                  {port.mode === "demo"
                    ? "메타데이터 샘플"
                    : uploading
                      ? "업로드 중"
                      : analysis
                        ? materialStateLabel[analysis.state]
                        : "분석 상태 확인 중"}
                </span>
                {item.active === false && (
                  <span className="study-badge">비활성</span>
                )}
              </div>
              <div className="study-actions">
                <label className="study-coverage-option">
                  <input
                    type="checkbox"
                    checked={item.included}
                    disabled={
                      busy ||
                      (port.mode === "server" &&
                        snapshot.connection?.state !== "ready")
                    }
                    onChange={(event) =>
                      void include(item, event.target.checked)
                    }
                  />
                  문제집에 포함
                </label>
                <button
                  aria-expanded={selected === item.id}
                  onClick={() =>
                    setSelected(selected === item.id ? undefined : item.id)
                  }
                >
                  상세·설정
                </button>
                {port.mode === "server" && (
                  <button
                    onClick={() => {
                      setUploadFor(item.id);
                      setSelected(item.id);
                    }}
                  >
                    PDF 추가
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {source && (
        <MaterialDetail
          key={source.id}
          source={source}
          port={port}
          analysis={analyses?.find((value) => value.materialId === source.id)}
          job={status?.jobs.find(
            (job) =>
              job.id ===
              analyses?.find((value) => value.materialId === source.id)?.jobId,
          )}
          files={files.filter((file) => file.materialId === source.id)}
          changed={load}
        />
      )}
      {port.mode === "server" && (
        <details className="study-panel">
          <summary>업로드 정리</summary>
          <p>
            만료된 미완료 업로드만 정리합니다. 저장된 원본과 문제집은
            보존됩니다.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void port
                .reconcileFiles?.()
                .then(() => {
                  setMessage("만료된 미완료 업로드를 정리했습니다.");
                  void load();
                })
                .catch((error) => setMessage(String(error)))
            }
          >
            미완료 업로드 정리
          </button>
        </details>
      )}
    </>
  );
}
