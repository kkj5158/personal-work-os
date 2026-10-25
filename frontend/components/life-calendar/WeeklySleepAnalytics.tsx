"use client";
import type { CSSProperties } from "react";
import { duration, type Session, type Nap } from "@/lib/sleep/model";
import { weeklyAnalytics } from "@/lib/sleep/weeklyAnalytics";

const compactDuration = (minutes: number | null) => minutes == null ? "—" : Math.round(minutes) < 60 ? `${Math.round(minutes)}분` : duration(minutes);
export default function WeeklySleepAnalytics({date,sessions,naps,serverNow,loading,showNaps,onDay}:{date:string;sessions:Session[];naps:Nap[];serverNow:string;loading:boolean;showNaps:boolean;onDay:(day:string)=>void}) {
  const stats = weeklyAnalytics(date, sessions, naps, serverNow);
  const maximum = Math.max(4, Math.ceil(Math.max(...stats.days.flatMap(d => [d.sleep ?? 0, showNaps ? d.nap ?? 0 : 0])) / 60 / 2) * 2);
  return <div className="sleep-weekly-analytics" aria-busy={loading}>
    <div className="sleep-metrics sleep-weekly-metrics" aria-label="주간 수면 지표">
      <section className="sleep-panel"><h2>주간 평균 수면 시간</h2><strong>{loading ? "—" : compactDuration(stats.meanSleep)}</strong></section>
      <section className="sleep-panel"><h2>주간 평균 낮잠 횟수</h2><strong>{loading || stats.napFrequency == null ? "—" : `${stats.napFrequency.toFixed(1)}회`}</strong></section>
      <section className="sleep-panel"><h2>주간 평균 낮잠 시간</h2><strong>{loading ? "—" : compactDuration(stats.meanNap)}</strong></section>
    </div>
    <section className="sleep-panel sleep-week-chart" aria-label="주간 수면 추이">
      <div className="sleep-chart-heading"><h2>주간 수면 추이</h2><span>{stats.from.slice(5)} – {stats.to.slice(5)}</span><div className="sleep-chart-legend"><span>● 주수면</span>{showNaps && <span>● 낮잠</span>}</div></div>
      <div className="sleep-chart-plot">
        <div className="sleep-chart-axis" aria-label="수면 시간 단위: 시간">{[maximum, maximum/2, 0].map(h => <span key={h}>{h}시간</span>)}</div>
        <div className="sleep-chart-days">{stats.days.map(d => {
          const label = `${d.date} (${new Intl.DateTimeFormat("ko", {timeZone:"UTC",weekday:"short"}).format(new Date(d.date+"T12:00:00Z"))})`;
          const text = `${label} · 주수면 ${d.sleep == null ? d.future ? "예정일" : "미기록" : duration(d.sleep)}${showNaps ? ` · 낮잠 ${d.nap == null ? "미기록" : duration(d.nap)}` : ""}`;
          return <button key={d.date} className="sleep-chart-day" disabled={loading} aria-label={text} title={text} onClick={() => onDay(d.date)}>
            <div className="sleep-chart-bars" style={{"--sleep-bar":`${(loading ? 0 : d.sleep ?? 0)/(maximum*60)*100}%`,"--nap-bar":`${(loading ? 0 : d.nap ?? 0)/(maximum*60)*100}%`} as CSSProperties}>
              {d.sleep != null && !loading ? <span className="sleep-chart-bar"/> : <small>{loading ? "…" : d.future ? "예정" : "미기록"}</small>}
              {showNaps && d.nap != null && !loading && <span className="sleep-chart-bar nap"/>}
            </div><span className="sleep-chart-date">{d.date.slice(5)} <b>{new Intl.DateTimeFormat("ko",{timeZone:"UTC",weekday:"short"}).format(new Date(d.date+"T12:00:00Z"))}</b></span>
          </button>;
        })}</div>
      </div>
      {!loading && stats.days.every(d => d.sleep == null && d.nap == null) && <p className="sleep-chart-empty">이번 주에 집계할 수면 기록이 없습니다.</p>}
    </section>
  </div>;
}
