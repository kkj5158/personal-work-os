"use client";
import { useRef, useState } from "react";
import { useRouteState } from "@/components/RouteState";
import type { StudyDataPort, StudySource } from "@/lib/study/model";
import {
  registerMaterial,
  validateMaterialPdf,
  type MaterialRegistration,
} from "@/lib/study/materials";

export function MaterialsOnboarding({
  port,
  source,
  done,
  close,
  draftKey = "new",
}: {
  port: StudyDataPort;
  source?: StudySource;
  done: (message: string) => void;
  close: () => void;
  draftKey?: string;
}) {
  const cacheKey = `study-material-draft:${port.getSnapshot().ownerId ?? port.mode}:${source?.id ?? "new"}:${draftKey}`;
  const [selected, setSelected] = useRouteState<File | null>(
    `${cacheKey}:file`,
    null,
  );
  const [title, setTitle] = useRouteState(
    `${cacheKey}:title`,
    source?.title ?? "",
  );
  const [scope, setScope] = useRouteState(
    `${cacheKey}:scope`,
    source?.scope ?? "문서 전체",
  );
  const [domain, setDomain] = useRouteState(
    `${cacheKey}:domain`,
    source?.domain ?? "개인 학습",
  );
  const [weight, setWeight] = useRouteState(
    `${cacheKey}:weight`,
    source?.weight ?? 50,
  );
  const [rights, setRights] = useRouteState(`${cacheKey}:rights`, false),
    [note, setNote] = useRouteState(`${cacheKey}:note`, false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const active = useRef(false),
    picker = useRef<HTMLInputElement>(null);
  const [savedRegistration] = useRouteState<MaterialRegistration>(
    `${cacheKey}:registration`,
    () => ({
      materialId: source?.id ?? crypto.randomUUID(),
      metadataSaved: !!source,
      materialVersion: source?.version,
    }),
  );
  const registration = useRef(savedRegistration);
  const [registrationView, setRegistrationView] = useState({
    ...savedRegistration,
  });
  const max = port.capabilities?.materialMaxBytes ?? 0;
  const choose = (file: File | null) => {
    if (
      registration.current.uploadStarted ||
      registration.current.assetId ||
      busy
    )
      return;
    if (file) {
      const error = validateMaterialPdf(file, max);
      if (error) {
        setMessage(error);
        return;
      }
      if (!title || title === selected?.name.replace(/\.pdf$/i, ""))
        setTitle(file.name.replace(/\.pdf$/i, ""));
    }
    setSelected(file);
    setMessage("");
  };
  const submit = async () => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    try {
      const value: StudySource = source ?? {
        id: registration.current.materialId,
        title: title.trim(),
        scope: scope.trim(),
        domain: domain.trim(),
        weight,
        included: true,
        active: true,
        progress: 0,
        rights: "등록자가 본인 소유 또는 이용 허가를 확인함",
        format: note ? "note" : "pdf",
        status: "metadata",
      };
      const result = await registerMaterial(
        port,
        registration.current,
        value,
        selected,
        (value) => {
          setMessage(value);
          setRegistrationView({ ...registration.current });
        },
      );
      done(result);
    } catch (error) {
      setMessage(
        `${registration.current.assetId ? "파일은 저장되었습니다. 분석 단계만 재시도합니다." : registration.current.metadataSaved ? "자료 정보는 저장되었습니다. 같은 자료에 업로드를 재시도합니다." : "자료 저장 확인이 필요합니다. 같은 자료로 재시도합니다."} ${String(error)}`,
      );
    } finally {
      active.current = false;
      setRegistrationView({ ...registration.current });
      setBusy(false);
    }
  };
  return (
    <section
      className="study-panel study-wide-workspace"
      aria-label="교재 등록 작업 공간"
    >
      <button disabled={busy} onClick={close}>
        ← 학습 자료로 돌아가기
      </button>
      <h2>{source ? "자료에 PDF 추가" : "교재 등록"}</h2>
      <p>
        이용 권한이 있는 PDF를 선택하면 저장 후 기존 텍스트층을 자동으로
        분석합니다.
      </p>
      {!note && (
        <div
          className="study-material-drop"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.files.length !== 1)
              setMessage("PDF를 한 개씩 선택하세요.");
            else choose(event.dataTransfer.files[0]);
          }}
        >
          <label className="study-field">
            PDF 선택
            <input
              ref={picker}
              type="file"
              accept="application/pdf,.pdf"
              disabled={
                busy ||
                !!registrationView.uploadStarted ||
                !!registrationView.assetId ||
                port.capabilities?.storage !== "connected"
              }
              onChange={(event) => {
                choose(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          <p>여기에 PDF를 놓거나 파일 선택 버튼을 누르세요.</p>
          {selected && (
            <p>
              {selected.name} · {(selected.size / 1048576).toFixed(2)}MiB{" "}
              <button
                type="button"
                disabled={
                  busy ||
                  !!registrationView.uploadStarted ||
                  !!registrationView.assetId
                }
                onClick={() => {
                  choose(null);
                  picker.current?.focus();
                }}
              >
                선택 지우기
              </button>
            </p>
          )}
        </div>
      )}
      <p>
        비공개 저장소:{" "}
        {port.capabilities?.storage === "connected" ? "사용 가능" : "연결 필요"}{" "}
        · PDF 최대 {Math.floor(max / 1048576)}MiB
      </p>
      {!source && (
        <>
          <label className="study-field">
            자료 제목
            <input
              maxLength={1000}
              disabled={busy || registrationView.metadataSaved}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <details>
            <summary>자료 설정</summary>
            <label className="study-field">
              학습 범위
              <textarea
                maxLength={16000}
                disabled={busy || registrationView.metadataSaved}
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              />
            </label>
            <label className="study-field">
              분야
              <input
                maxLength={1000}
                disabled={busy || registrationView.metadataSaved}
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
              />
            </label>
            <label className="study-field">
              학습 비중
              <input
                type="number"
                min={0}
                max={100}
                disabled={busy || registrationView.metadataSaved}
                value={weight}
                onChange={(event) => setWeight(Number(event.target.value))}
              />
            </label>
            <p>
              새 교재는 활성 상태로 문제집에 포함됩니다. 자료 목록에서 포함
              여부를 바꿀 수 있습니다.
            </p>
          </details>
        </>
      )}
      <label className="study-coverage-option">
        <input
          type="checkbox"
          checked={rights}
          disabled={busy}
          onChange={(event) => setRights(event.target.checked)}
        />
        이 자료를 저장·학습에 사용할 소유권 또는 이용 허가가 있습니다.
      </label>
      <div className="study-actions">
        <button
          className="study-primary"
          disabled={
            busy ||
            !rights ||
            (!source &&
              (!title.trim() ||
                !scope.trim() ||
                !domain.trim() ||
                !Number.isInteger(weight) ||
                weight < 0 ||
                weight > 100)) ||
            (!note && !selected && !registrationView.assetId) ||
            (!note && port.capabilities?.storage !== "connected") ||
            (port.getSnapshot().connection?.state !== "ready" &&
              port.getSnapshot().connection?.state !== "error")
          }
          onClick={() => void submit()}
        >
          {busy
            ? message
            : registrationView.metadataSaved
              ? registrationView.assetId
                ? "분석 재시도"
                : "업로드 재시도"
              : note
                ? "자료 정보 저장"
                : "교재 등록"}
        </button>
        {!source && !registrationView.metadataSaved && (
          <button
            disabled={busy}
            onClick={() => {
              setNote(!note);
              setSelected(null);
            }}
          >
            {note ? "PDF로 등록" : "파일 없이 등록"}
          </button>
        )}
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
