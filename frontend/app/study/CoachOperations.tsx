"use client";
import { useEffect, useState } from "react";
import type { StudyDataPort } from "@/lib/study/model";
import { workerConnection } from "@/lib/study/workbench";
import { useEngine } from "./useEngine";
import { EngineJobSummary } from "./EngineJobSummary";

export function FeedbackAnalysis({
  port,
  id,
}: {
  port: StudyDataPort;
  id: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!port.engine) return null;
  return (
    <>
      <button
        disabled={busy || port.getSnapshot().connection?.state !== "ready"}
        onClick={async () => {
          setBusy(true);
          try {
            await port.engine!.action(`feedback/${id}/analyze`);
            setMessage(
              "피드백 분석을 요청했습니다. 워커가 처리하면 제안과 결과를 확인할 수 있습니다.",
            );
          } catch (e) {
            setMessage(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        피드백 분석 요청
      </button>
      <small role="status">{message}</small>
    </>
  );
}
export function CoachOperations({ port }: { port: StudyDataPort }) {
  const engine = useEngine(port),
    [time, setTime] = useState<string>(),
    [connectionUrl, setConnectionUrl] = useState<string>(),
    [opened, setOpened] = useState(false);
  const status = engine.status,
    clock = time ?? status?.schedule.time ?? "20:00";
  useEffect(
    () => () => {
      if (connectionUrl) URL.revokeObjectURL(connectionUrl);
    },
    [connectionUrl],
  );
  if (!port.engine) return null;
  const connection = status
    ? workerConnection(status, engine.observedAt)
    : undefined;
  return (
    <details
      className="study-panel study-coach-operations"
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>에이전트 운영 설정</summary>
      <p>워커 연결, 일요일 예약, 토큰, 실행 이력을 관리합니다.</p>
      {connection && (
        <p className="study-notice">
          {connection.label} · {connection.detail}
        </p>
      )}
      <section>
        <h2>일요일 자동 예약</h2>
        <label className="study-field">
          실행 시각 (KST)
          <input
            type="time"
            min="18:00"
            max="23:59"
            value={clock}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <button
          disabled={
            engine.blocked ||
            !status?.engineEnabled ||
            clock < "18:00" ||
            clock > "23:59"
          }
          onClick={async () => {
            try {
              await port.configureAutomation(status!.schedule.enabled, clock);
              await engine.refresh();
              engine.setMessage("예약 시각을 저장했습니다.");
            } catch (e) {
              engine.setMessage(String(e));
            }
          }}
        >
          시각 저장
        </button>
        <label className="study-coverage-option">
          <input
            type="checkbox"
            disabled={engine.blocked || !status?.engineEnabled}
            checked={status?.schedule.enabled ?? false}
            onChange={async (e) => {
              try {
                await port.configureAutomation(e.target.checked, clock);
                await engine.refresh();
              } catch (error) {
                engine.setMessage(String(error));
              }
            }}
          />
          일요일 자동 예약 {status?.schedule.enabled ? "켜짐" : "꺼짐"}
        </label>
        <p>
          {status?.schedule.enabled
            ? `다음 실행: ${new Date(status.schedule.nextRun).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST`
            : "예약이 꺼져 있습니다. 수동 생성 요청은 문제집에서 할 수 있습니다."}
        </p>
        <p>
          유료 AI·자동 메일은 비활성입니다. 예약을 켜도 워커가 연결되어야 생성을
          처리합니다.
        </p>
      </section>
      <section>
        <h2>로컬 워커 연결</h2>
        <button
          disabled={engine.blocked}
          onClick={async () => {
            try {
              const result = (await engine.action("workers", {
                label: "Windows local STUDY worker",
              })) as { token: string };
              if (!/^[A-Za-z0-9_-]{43}$/.test(result.token))
                throw new Error("연결 파일 발급 결과를 확인하지 못했습니다.");
              setConnectionUrl(
                URL.createObjectURL(
                  new Blob([result.token], { type: "text/plain" }),
                ),
              );
              engine.setMessage(
                "연결 파일이 준비되었습니다. 개인 폴더에 안전하게 보관하세요.",
              );
            } catch (e) {
              engine.setMessage(String(e));
            }
          }}
        >
          7일 워커 연결 파일 발급
        </button>
        {connectionUrl && (
          <p>
            <a href={connectionUrl} download="study-worker-token.txt">
              워커 연결 파일 다운로드
            </a>
          </p>
        )}
        <p>
          토큰은 한 번만 제공됩니다. 채팅·로그에 붙여넣지 말고 운영 문서의 로컬
          실행 절차를 따르세요.
        </p>
        {status?.workers.map((w) => (
          <article key={w.id} className="study-job-detail">
            <h3>{w.label}</h3>
            <p>
              {w.revoked
                ? "폐기됨"
                : Date.parse(w.expiresAt) < engine.observedAt
                  ? "만료됨"
                  : w.online
                    ? "최근 응답 확인"
                    : "다음 응답 대기"}
            </p>
            <p>
              연결 기한:{" "}
              {new Date(w.expiresAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}{" "}
              KST
            </p>
            <p>
              마지막 응답:{" "}
              {w.lastSeenAt
                ? new Date(w.lastSeenAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })
                : "아직 확인되지 않음"}
            </p>
            <p>
              다음 예상 확인:{" "}
              {w.lastSeenAt
                ? new Date(Date.parse(w.lastSeenAt) + 300_000).toLocaleString(
                    "ko-KR",
                    { timeZone: "Asia/Seoul" },
                  )
                : "첫 응답 후 예상 가능"}{" "}
              · 설치된 워커의 약 5분 주기 기준
            </p>
            <p>
              마지막 성공 작업:{" "}
              {status.jobs.find(
                (j) =>
                  ["GENERATE", "COACH"].includes(j.kind) &&
                  ["READY", "PUBLISHED"].includes(j.state),
              )?.updatedAt ?? "최근 작업에서 확인되지 않음"}{" "}
              (특정 워커와의 연결은 확인되지 않음)
            </p>
            <button
              disabled={engine.blocked || w.revoked}
              onClick={() => {
                if (window.confirm(`${w.label} 연결을 폐기할까요?`))
                  void engine.action(`workers/${w.id}/revoke`).catch(() => {});
              }}
            >
              연결 폐기
            </button>
          </article>
        ))}
      </section>
      {opened && (
        <EngineJobSummary
          port={port}
          jobs={status?.jobs ?? []}
          blocked={engine.blocked}
          action={engine.action}
        />
      )}
      <p role="status">{engine.message}</p>
    </details>
  );
}
