"use client";
import { useEffect, useMemo, useState } from "react";
import { ChecklistIcon } from "@/components/checklist-core/icons";
import { addDays, monthStart, seoulToday, weekStart } from "@/lib/checklist-core/dates";
import { formatRate, type RateSummary } from "@/lib/checklist-core/stats";
import { orderedAreas, progressReport } from "@/lib/checklist-sys/model";
import type { ChecklistSysStore } from "./store";

type Period = "month" | "30d" | "12w" | "year" | "all";
const PERIODS: [Period, string][] = [["month", "이번 달"], ["30d", "최근 30일"], ["12w", "최근 12주"], ["year", "올해"], ["all", "전체"]];
type Scope = { identityId: string | null; areaId: string | null };

function periodStart(period: Period, today: string, earliest: string) {
  if (period === "month") return monthStart(today);
  if (period === "30d") return addDays(today, -29);
  if (period === "12w") return addDays(weekStart(today), -77);
  if (period === "year") return `${today.slice(0, 4)}-01-01`;
  return earliest;
}

function heatLevel(summary: RateSummary) {
  if (!summary.eligible || summary.completionRate == null) return 0;
  const rate = summary.completionRate;
  return rate >= 90 ? 4 : rate >= 65 ? 3 : rate >= 35 ? 2 : 1;
}

/** Progress — completion / recording / failure / not-recorded, never weighted by importance. */
export default function Progress({ store, scope, onScope }: { store: ChecklistSysStore; scope: Scope; onScope: (identity: string | null, area: string | null) => void }) {
  const today = seoulToday();
  const { catalog, records, ensureRange } = store;
  const [period, setPeriod] = useState<Period>("month");
  const [breakdown, setBreakdown] = useState<"area" | "identity">("area");
  const earliest = catalog.items.reduce((min, item) => (item.startDate < min ? item.startDate : min), today);
  const from = periodStart(period, today, earliest);
  // Streaks look back up to 400 days, independent of the selected period.
  const loadFrom = from < addDays(today, -400) ? from : addDays(today, -400);
  useEffect(() => { void ensureRange(loadFrom, today); }, [ensureRange, loadFrom, today]);
  const report = useMemo(() => progressReport(catalog, records, from, today, today, scope), [catalog, records, from, today, scope]);
  const areas = orderedAreas(catalog, scope.identityId);

  const cards: [string, string, number | null][] = [
    ["전체 수행률", "success", report.total.completionRate],
    ["기록률", "record", report.total.recordingRate],
    ["실패율", "failure", report.total.failureRate],
    ["기록 못함", "nr", report.total.notRecordedRate],
  ];
  // Heatmap: Monday-first week columns across the period.
  const weeks: { date: string; summary: RateSummary | null }[][] = [];
  const dayMap = new Map(report.days.map(d => [d.date, d.summary]));
  for (let week = weekStart(from); week <= today; week = addDays(week, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDays(week, i);
      return { date, summary: date < from || date > today ? null : dayMap.get(date) ?? null };
    }));
  }

  return (
    <>
      <header className="cks-header">
        <div>
          <h1>진행 상황</h1>
          <p>기록률과 수행 패턴을 한눈에 확인합니다.</p>
        </div>
      </header>
      <div className="cks-filters">
        <label>기간<select value={period} onChange={e => setPeriod(e.target.value as Period)}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Identity<select value={scope.identityId ?? ""} onChange={e => onScope(e.target.value || null, null)}><option value="">전체</option>{[...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        <label>Area<select value={scope.areaId ?? ""} onChange={e => onScope(scope.identityId ?? catalog.areas.find(a => a.id === e.target.value)?.identityId ?? null, e.target.value || null)}><option value="">전체</option>{areas.map(({ area, identity }) => <option key={area.id} value={area.id}>{scope.identityId ? area.name : `${identity.name} · ${area.name}`}</option>)}</select></label>
        <small>{from} – {today}</small>
      </div>

      <div className="cks-kpis">
        {cards.map(([label, tone, value]) => (
          <div key={label} className={`cks-kpi cks-kpi-${tone}`}><span>{label}</span><strong>{formatRate(value)}</strong></div>
        ))}
      </div>
      <p className="cks-hint">수행률·실패율 = 기록 못함을 제외한 활성 항목-일 기준 · 기록률 = 성공+실패 / 활성 항목-일 · 보관 기간과 시작일 이전은 제외 · 중요도는 가중치 없음</p>

      <div className="cks-progress-row">
        <section className="cks-card cks-heatmap-card" aria-label="일별 수행 히트맵">
          <h2>일별 수행 히트맵</h2>
          <div className="cks-heatmap">
            {weeks.map(week => (
              <div key={week[0].date} className="cks-heat-week">
                {week.map(({ date, summary }) => (
                  <span key={date} className={`cks-heat cks-heat-${summary ? heatLevel(summary) : "none"}`} title={summary ? `${date} · 수행률 ${formatRate(summary.completionRate)} · 성공 ${summary.success} / 실패 ${summary.failure} / 기록 못함 ${summary.notRecorded}` : date} />
                ))}
              </div>
            ))}
          </div>
          <div className="cks-heat-legend"><span>낮음</span>{[1, 2, 3, 4].map(level => <span key={level} className={`cks-heat cks-heat-${level}`} />)}<span>높음</span><span className="cks-heat cks-heat-0" /><span>기록 대상 없음</span></div>
        </section>
        <section className="cks-card cks-breakdown-card">
          <div className="cks-card-head">
            <h2>{breakdown === "area" ? "Area별 수행률" : "Identity별 수행률"}</h2>
            <div className="cks-segment" role="group" aria-label="요약 기준">
              <button type="button" aria-pressed={breakdown === "area"} onClick={() => setBreakdown("area")}>Area</button>
              <button type="button" aria-pressed={breakdown === "identity"} onClick={() => setBreakdown("identity")}>Identity</button>
            </div>
          </div>
          <ul className="cks-bars">
            {(breakdown === "area" ? report.byArea.map(r => ({ id: r.area.id, name: r.area.name, color: r.area.color, summary: r.summary })) : report.byIdentity.map(r => ({ id: r.identity.id, name: r.identity.name, color: r.identity.color, summary: r.summary }))).map(row => (
              <li key={row.id}>
                <span className="cks-bar-name">{row.name}</span>
                <span className="cks-bar-track"><span style={{ width: `${row.summary.completionRate ?? 0}%`, background: row.color }} /></span>
                <span className="cks-bar-value">{formatRate(row.summary.completionRate)}</span>
              </li>
            ))}
            {!report.byArea.length && <li className="cks-muted">기록 대상이 없습니다.</li>}
          </ul>
        </section>
      </div>

      <section className="cks-card" aria-label="항목별 상세 통계">
        <h2>항목별 상세 통계</h2>
        <table className="cks-table">
          <thead><tr><th>항목</th><th>Area</th><th>성공률</th><th>실패</th><th>기록 못함</th><th>현재 연속</th><th>기록 수</th></tr></thead>
          <tbody>
            {report.items.filter(row => row.summary.eligible > 0 || !row.item.archivedOn).map(row => (
              <tr key={row.item.id}>
                <td><span className="cks-cell-icon"><ChecklistIcon name={row.item.icon} size={14} /></span>{row.item.name}{row.item.archivedOn && <small className="cks-muted"> · 보관됨</small>}</td>
                <td>{row.area?.name}</td>
                <td className="cks-rate">{formatRate(row.summary.completionRate)}</td>
                <td>{row.summary.failure}</td>
                <td>{row.summary.notRecorded}</td>
                <td>{row.streak}일</td>
                <td>{row.recorded}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.items.length && <p className="cks-muted">표시할 항목이 없습니다.</p>}
      </section>
    </>
  );
}
