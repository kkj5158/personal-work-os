"use client";

import { useState } from "react";
import type { DietData, ReferenceBand, ReferenceLine, WeightGoal } from "@/lib/diet/types";
import { addDays, goalFor, today } from "@/lib/diet/model";
import "./home-chart.css";

type Series = { name: string; color: string; values: (number | null)[]; dashed?: boolean; connectGaps?: boolean };
type Marker = { id: string; date: string; value: number; label: string; color: string };
const GOAL_NAMES: Record<WeightGoal["kind"], string> = { SHORT_TERM: "단기 목표", WEEKLY: "주 목표", MONTHLY: "월 목표", FINAL: "최종 목표" };
const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("ko-KR");

export function SeriesChart({ dates, series, lines = [], bands = [], unit = "", bar = false, markers = [] }: {
  dates: string[]; series: Series[]; lines?: ReferenceLine[]; bands?: ReferenceBand[]; unit?: string; bar?: boolean; markers?: Marker[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const visibleLines = lines.filter(line => line.visible && Number.isFinite(line.value));
  const visibleBands = bands.filter(band => band.visible && Number.isFinite(band.min) && Number.isFinite(band.max) && band.min < band.max);
  const plottedMarkers = markers.filter(marker => dates.includes(marker.date) && Number.isFinite(marker.value));
  const values = series.flatMap(s => s.values.filter((v): v is number => v != null && Number.isFinite(v)));
  const extent = [...values, ...visibleLines.map(l => l.value), ...visibleBands.flatMap(b => [b.min, b.max]), ...plottedMarkers.map(m => m.value)];
  const rawMin = bar ? Math.min(0, ...extent) : Math.min(...extent);
  const rawMax = Math.max(...extent);
  const padding = Math.max((rawMax - rawMin) * .12, unit === "kg" ? .5 : .1);
  const min = extent.length ? (bar ? rawMin : rawMin - padding) : 0;
  const max = extent.length ? rawMax + padding : 1;
  const width = 1100, height = 310, left = 66, right = 30, top = 26, bottom = 40;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (i: number) => left + (bar ? (i + .5) / Math.max(1, dates.length) : dates.length > 1 ? i / (dates.length - 1) : .5) * plotWidth;
  const y = (value: number) => top + (max - value) / (max - min || 1) * plotHeight;
  const dateTicks = Array.from(new Set(Array.from({ length: Math.min(7, dates.length) }, (_, i) => Math.round(i * (dates.length - 1) / Math.max(1, Math.min(7, dates.length) - 1)))));
  const activeIndex = selected != null && selected < dates.length ? selected : null;
  const makePath = (s: Series) => {
    let open = false;
    return s.values.map((value, i) => {
      if (value == null || !Number.isFinite(value)) { if (!s.connectGaps) open = false; return ""; }
      const command = `${open ? "L" : "M"}${x(i)},${y(value)}`;
      open = true;
      return command;
    }).join(" ");
  };
  return <div className="diet-series-chart">
    <div className="diet-chart-legend">
      {series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
      {visibleLines.map(line => <span key={line.id}><i className="diet-reference-key" />{line.name} {fmt(line.value)} {unit}</span>)}
      {visibleBands.map(band => <span key={band.id}><i style={{ background: band.color, opacity: .35 }} />{band.name} {fmt(band.min)}–{fmt(band.max)} {unit}</span>)}
      {plottedMarkers.length > 0 && <span>◇ 마일스톤</span>}
    </div>
    {dates.length === 0 || (values.length === 0 && plottedMarkers.length === 0) ? <div className="diet-chart-empty">선택한 기간에 표시할 기록이 없습니다.</div> : <>
      <div className="diet-chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.map(s => s.name).join(", ")} 추이 (${unit})`}>
          <text x={left} y={14} className="diet-chart-axis">{unit}</text>
          {visibleBands.map(band => <g key={band.id}>
            <rect x={left} y={y(band.max)} width={plotWidth} height={y(band.min) - y(band.max)} fill={band.color} opacity={.1} />
            {[band.min, band.max].map(boundary => <line key={boundary} x1={left} x2={width - right} y1={y(boundary)} y2={y(boundary)} stroke={band.color} strokeDasharray="4 4" opacity={.65}><title>{band.name}: {fmt(boundary)} {unit}</title></line>)}
          </g>)}
          {Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4).map(value => <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--color-border-muted, #e8ecf1)" />
            <text x={left - 10} y={y(value) + 4} textAnchor="end" className="diet-chart-axis">{fmt(value)}</text>
          </g>)}
          {visibleLines.map(line => <line key={line.id} x1={left} x2={width - right} y1={y(line.value)} y2={y(line.value)} stroke="#8b91a0" strokeDasharray="6 5"><title>{line.name}: {fmt(line.value)} {unit}</title></line>)}
          {series.map((s, si) => <g key={s.name}>
            {!bar && <path d={makePath(s)} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed ? "5 4" : undefined} />}
            {s.values.map((value, i) => value == null || !Number.isFinite(value) ? null : bar ? <rect key={i} x={x(i) + (si - series.length / 2) * Math.min(24, plotWidth / Math.max(1, dates.length) / (series.length + 1))} y={Math.min(y(0), y(value))} width={Math.max(.5, Math.min(24, plotWidth / Math.max(1, dates.length) / (series.length + 1)) - 1)} height={Math.abs(y(value) - y(0))} rx={2} fill={s.color}><title>{dates[i]} · {s.name}: {fmt(value)} {unit}</title></rect> : <circle key={i} cx={x(i)} cy={y(value)} r={s.dashed ? 2 : 3} fill={s.color} stroke="white" strokeWidth={1}><title>{dates[i]} · {s.name}: {fmt(value)} {unit}</title></circle>)}
          </g>)}
          {plottedMarkers.map(marker => <path key={marker.id} d={`M${x(dates.indexOf(marker.date))},${y(marker.value) - 6} l6,6 -6,6 -6,-6 Z`} fill="white" stroke={marker.color} strokeWidth={2}><title>{marker.date} · {marker.label}: {fmt(marker.value)} {unit}</title></path>)}
          {dateTicks.map(i => <text key={i} x={x(i)} y={height - 13} textAnchor="middle" className="diet-chart-axis">{dates[i].slice(5).replaceAll("-", "/")}</text>)}
          {activeIndex != null && <line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={height - bottom} stroke="#a7b2c2" strokeDasharray="3 3" />}
          {dates.map((date, i) => <rect key={date} x={Math.max(left, x(i) - plotWidth / Math.max(1, dates.length - (bar ? 0 : 1)) / 2)} y={top} width={Math.min(plotWidth / Math.max(1, dates.length - (bar ? 0 : 1)), width - right - Math.max(left, x(i) - plotWidth / Math.max(1, dates.length - (bar ? 0 : 1)) / 2))} height={plotHeight} fill="transparent" tabIndex={0} role="button" aria-label={`${date}: ${series.map(s => `${s.name} ${s.values[i] == null ? "미입력" : `${fmt(s.values[i]!)} ${unit}`}`).join(", ")}`} onMouseEnter={() => setSelected(i)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(i)} onBlur={() => setSelected(null)} onClick={() => setSelected(i)} onKeyDown={e => { if (e.key === "Escape") setSelected(null); }} />)}
        </svg>
      </div>
      <div className="diet-chart-readout" aria-live="polite">{activeIndex != null ? <><strong>{dates[activeIndex]}</strong>{series.map(s => <span key={s.name} style={{ color: s.color }}>{s.name} <b>{s.values[activeIndex] == null ? "—" : `${fmt(s.values[activeIndex]!)} ${unit}`}</b></span>)}{plottedMarkers.filter(m => m.date === dates[activeIndex]).map(m => <span key={m.id}>◇ {m.label} {fmt(m.value)} {unit}</span>)}</> : <span>그래프에 마우스를 올리거나 날짜를 선택해 값을 확인하세요.</span>}</div>
    </>}
  </div>;
}

export function WeightChart({ data, start, end }: { data: DietData; start?: string; end?: string }) {
  const allDates = [...data.days.filter(d => d.morningWeight != null || d.targetWeight != null).map(d => d.date), ...data.milestones.map(m => m.date), ...data.goals.map(g => g.date)].sort();
  const from = start ?? allDates[0] ?? addDays(today(), -27);
  const to = end ?? (allDates.at(-1) && allDates.at(-1)! > today() ? allDates.at(-1)! : today());
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  const dayMap = new Map(data.days.map(d => [d.date, d]));
  const targets = new Map([...data.goals.map(g => [g.date, g.value] as const), ...data.milestones.map(m => [m.date, m.value] as const), ...data.days.filter(d => d.targetWeight != null).map(d => [d.date, d.targetWeight!] as const)]);
  const movingAverage = dates.map(date => {
    if (date > today()) return null;
    const values = Array.from({ length: 7 }, (_, i) => dayMap.get(addDays(date, -i))?.morningWeight).filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
  const goalLines = (Object.keys(GOAL_NAMES) as WeightGoal["kind"][]).flatMap(kind => {
    const goal = goalFor(data, kind);
    return goal ? [{ id: `goal-${kind}`, name: GOAL_NAMES[kind], value: goal.value, visible: !(data.settings.hiddenGoalLines ?? []).includes(kind), goalKind: kind }] : [];
  });
  return <SeriesChart dates={dates} unit="kg" series={[
    { name: "실제 체중", color: "#2875dc", values: dates.map(date => dayMap.get(date)?.morningWeight ?? null), connectGaps: true },
    { name: "7일 이동평균", color: "#859cc6", values: movingAverage, dashed: true },
    { name: "목표 체중", color: "#b97d45", values: dates.map(date => targets.get(date) ?? null), connectGaps: true, dashed: true },
  ]} lines={[...goalLines, ...(data.settings.weightLines ?? [])]} markers={data.milestones.map(m => ({ id: m.id, date: m.date, value: m.value, label: m.title || "마일스톤", color: data.challenges.find(c => c.id === m.challengeId)?.color || "#b97d45" }))} />;
}
