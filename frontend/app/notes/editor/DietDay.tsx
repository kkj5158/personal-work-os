"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { parseDietDay, dietDayView } from "@/lib/notes/dietDay";
import { challengeProgress, display, today } from "@/lib/diet/model";
import { challengesOn } from "@/lib/diet/day";
import { useDietStore } from "@/app/diet/store";
import { ChallengeDetailModal } from "@/app/diet/ChallengeDetail";
import { DietChecklist } from "./DietChecklist";
import "@/app/diet/Planner.css";

const roles: Record<string, string> = { CURRENT_FOCUS: "CURRENT FOCUS", NEXT_FOCUS: "NEXT FOCUS", FINAL_GOAL: "FINAL GOAL" };
const statuses: Record<string, string> = { ACTIVE: "진행 중", WAITING: "예정", COMPLETED: "완료", STOPPED: "중단" };

/** The managed block is a dashboard. The existing rich-text body follows it. */
export function DietDayView({ node, editor }: NodeViewProps) {
  const store = useDietStore();
  const [selected, setSelected] = useState<string | null>(null);
  const day = parseDietDay(String(node.attrs.payload ?? ""));
  if (!day) return <NodeViewWrapper className="diet-day diet-day-invalid" contentEditable={false}>다이어트 기록을 읽을 수 없습니다.</NodeViewWrapper>;
  const loaded = !store.loading && !store.error;
  const record = store.data.days.find(d => d.date === day.date);
  const view = dietDayView(loaded ? { ...day, measurements: (record ?? {}) as Record<string, number | string> } : day);
  const focus = challengesOn(day.date, store.data.challenges);
  const metrics = [["weight", "체중", "kg"], ["glucose", "혈당", "mg/dL"], ["bloodKetone", "혈중 케톤", "mmol/L"], ["breathKetone", "호흡 케톤", "ppm"]] as const;
  return <NodeViewWrapper className="diet-day diet-day-compact diet-dashboard" contentEditable={false}>
    <header className="diet-day-head"><strong>다이어트 기록</strong><time dateTime={day.date}>{day.date}</time><a href={`/diet/record?date=${day.date}`}>DIET SYS 연동 ↗</a></header>
    {store.loading && <p role="status">최신 기록을 불러오는 중…</p>}
    {store.error && <p role="alert">{store.error} <button onClick={() => void store.reload()}>다시 불러오기</button></p>}
    <section className="diet-day-section" aria-label="진행 중인 챌린지">
      <div className="diet-dashboard-section-title"><h4>진행 중인 챌린지</h4><small>클릭하여 세부 수정</small></div>
      <div className="diet-dashboard-challenges">{focus.map(c => {
        const p = challengeProgress(c, store.data, day.date);
        return <button key={c.id} className={`diet-dashboard-challenge role-${c.role.toLowerCase()}`} disabled={!editor.isEditable} onClick={() => setSelected(c.id)}>
          <span>{roles[c.role]} · {c.startDate > today() && c.status === "ACTIVE" ? "시작 예정" : statuses[c.status]}</span><b>{c.title}</b>{c.keyPoint && <small>{c.keyPoint}</small>}<small>{c.startDate} ~ {c.endDate}</small>
          {p.progress != null ? <><progress aria-label={`${c.title} 진행률`} max={100} value={p.progress}/><span>{display(p.progress)}%</span></> : <small>진행 기록 없음</small>}
        </button>;
      })}</div>
      {!store.loading && !focus.length && <p className="diet-day-muted">이 날짜에 해당하는 챌린지가 없습니다.</p>}
    </section>
    <section className="diet-day-section" aria-label="측정 기록">
      <div className="diet-dashboard-section-title"><h4>오늘의 측정 기록</h4><a href={`/diet/record?date=${day.date}`}>측정 기록 관리 ↗</a></div>
      <div className="diet-dashboard-metrics">{metrics.map(([key, label, unit]) => <div key={key} className={`diet-dashboard-metric metric-${key}`}><strong>{label}</strong>{view.measurements.filter(row => row[key].state !== "unsupported").map(row => <div key={row.slot}><small>{row.label}</small><b>{row[key].state === "missing" ? "미측정" : row[key].value}</b>{row[key].state === "recorded" && <small>{unit}</small>}{row.measuredAt && <time dateTime={row.measuredAt.dateTime} title="해당 측정 구간의 기록 시각">{row.measuredAt.label}</time>}</div>)}</div>)}</div>
    </section>
    <section className="diet-day-section" aria-label="체크리스트">
      {!store.loading && <DietChecklist store={store} date={day.date} readonly={!editor.isEditable || !loaded}/>}
    </section>
    {selected && createPortal(<ChallengeDetailModal challengeId={selected} store={store} onClose={() => setSelected(null)}/>, document.body)}
  </NodeViewWrapper>;
}
