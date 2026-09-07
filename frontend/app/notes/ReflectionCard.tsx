"use client";
import { useState } from "react";
import {
  DISPLAY_MODES,
  minutes,
  snapshotBounds,
  type DisplayMode,
  type ReflectionEntry,
} from "@/lib/notes/reflection";
export function ReflectionCard({
  entry,
  mode,
  onMode,
  onText,
  onUnlink,
}: {
  entry: ReflectionEntry;
  mode: DisplayMode;
  onMode: (mode: DisplayMode) => void;
  onText: (text: string) => Promise<void>;
  onUnlink: () => void;
}) {
  const [status, setStatus] = useState("");
  const s = entry.snapshot;
  const { start, end } = snapshotBounds(s);
  const columns =
    mode === "COMPARE"
      ? ["PLAN", "ACTUAL"]
      : mode === "PLAN_ONLY"
        ? ["PLAN"]
        : mode === "ACTUAL_ONLY"
          ? ["ACTUAL"]
          : [];
  return (
    <section className="reflection-card" aria-label="Reflection">
      <header>
        <strong>▣ Reflection</strong>
        <span>{entry.date} · Frozen snapshot</span>
        <a href={entry.workOsRoute}>WORK_OS에서 열기 ↗</a>
        <button onClick={onUnlink} title="노트에서 연결만 해제">
          연결 해제
        </button>
      </header>
      {!!columns.length && (
        <>
          <div className="reflection-stats">
            <div>
              계획<strong>{s.workSummary.plannedMinutes}분</strong>
            </div>
            <div>
              실제<strong>{s.workSummary.actualMinutes}분</strong>
            </div>
            <div>
              차이
              <strong>
                {s.workSummary.actualMinutes - s.workSummary.plannedMinutes}분
              </strong>
            </div>
            <div>
              체크리스트
              <strong>
                {s.checklistSummary.completed} / {s.checklistSummary.total}
              </strong>
            </div>
          </div>
          <div className="reflection-grid">
            <div className="time-axis">
              {Array.from(
                { length: Math.floor((end - start) / 180) + 1 },
                (_, i) => (
                  <span
                    key={i}
                    style={{ top: `${((i * 180) / (end - start)) * 100}%` }}
                  >
                    {String(Math.floor((start + i * 180) / 60)).padStart(
                      2,
                      "0",
                    )}
                    :{String(start % 60).padStart(2, "0")}
                  </span>
                ),
              )}
            </div>
            {columns.map((column) => (
              <div className="time-column" key={column}>
                <b>{column === "PLAN" ? "계획" : "실제"}</b>
                {(column === "PLAN" ? s.plannedBlocks : s.actualBlocks).map(
                  (b, i) => (
                    <div
                      key={b.sourceId}
                      className={`time-block block-${i % 5}`}
                      style={{
                        top: `${((minutes(b.startTime) - start) / (end - start)) * 100}%`,
                        height: `${(Math.max(b.durationMinutes, 25) / (end - start)) * 100}%`,
                      }}
                    >
                      <small>
                        {b.startTime.slice(0, 5)}–{b.endTime.slice(0, 5)}
                      </small>
                      <strong>{b.label}</strong>
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <label>
        오늘의 회고
        <textarea
          defaultValue={entry.content}
          onBlur={async (e) => {
            if (e.target.value === entry.content) return;
            try {
              setStatus("저장 중…");
              await onText(e.target.value);
              setStatus("저장됨");
            } catch {
              setStatus("저장 실패 — 입력한 내용이 유지됩니다.");
            }
          }}
        />
      </label>
      <small role="status">{status}</small>
      <select
        aria-label="Reflection 표시 방식"
        value={mode}
        onChange={(e) => onMode(e.target.value as DisplayMode)}
      >
        {Object.entries(DISPLAY_MODES).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </section>
  );
}
export function ReflectionPopover({ close }: { close: () => void }) {
  const [mode, setMode] = useState<DisplayMode>("COMPARE");
  return (
    <div
      className="note-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="note-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Reflection 추가"
      >
        <header>
          <h2>Reflection 추가</h2>
          <button onClick={close} aria-label="닫기">
            ×
          </button>
        </header>
        {Object.entries(DISPLAY_MODES).map(([key, label]) => (
          <button
            className={`reflection-option ${mode === key ? "selected" : ""}`}
            key={key}
            onClick={() => setMode(key as DisplayMode)}
          >
            {label}
            <small>
              표시 방식만 바뀌며 계획과 실제 Snapshot은 함께 보존됩니다.
            </small>
          </button>
        ))}
        <p className="note-muted">
          WORK_OS Reflection API가 아직 연결되지 않았습니다. 제공자가 연결되면
          이 날짜의 회고를 추가할 수 있습니다.
        </p>
        <footer>
          <button onClick={close}>닫기</button>
          <button className="primary" disabled>
            추가 — WORK_OS 연결 대기
          </button>
        </footer>
      </section>
    </div>
  );
}
