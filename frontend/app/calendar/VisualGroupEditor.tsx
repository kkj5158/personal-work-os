"use client";
import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { validLocalDate } from "@/lib/localDateBridge";
import { CategoryColorPicker } from "./CategoryColorPicker";
import { GROUP_COLOR, GROUP_RULE_LABELS, groupDateDistance, shiftGroupDate, validateVisualGroup, type CalendarVisualGroup, type VisualGroupInput, type VisualGroupRule } from "./visualGroups";

export interface VisualGroupEditorProps {
  value: CalendarVisualGroup; status: string; error: string | null; busy: boolean; guard: boolean; focusDate?: string;
  onChange: (patch: Partial<VisualGroupInput>) => void; onFlush: () => void; onDelete: () => void; onClose: () => void;
  onDiscard: () => void; onContinue: () => void; onRetry: () => void;
}
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
export function VisualGroupEditor({ value, status, error, busy, guard, focusDate, onChange, onFlush, onDelete, onClose, onDiscard, onContinue, onRetry }: VisualGroupEditorProps) {
  const [page, setPage] = useState<{ key: string; date: string } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const key = `${value.id}:${value.startDate}:${value.endDate}:${focusDate ?? ""}`;
  const firstDate = page?.key === key ? page.date : focusDate && focusDate >= value.startDate && focusDate <= value.endDate ? focusDate : value.startDate;
  const count = groupDateDistance(firstDate, value.endDate);
  const dates = Number.isFinite(count) && count >= 0 ? Array.from({ length: Math.min(7, count + 1) }, (_, index) => shiftGroupDate(firstDate, index)) : [];
  const setRange = (patch: Pick<Partial<VisualGroupInput>, "startDate" | "endDate">) => {
    const start = patch.startDate ?? value.startDate, end = patch.endDate ?? value.endDate;
    onChange({ ...patch, days: validLocalDate(start) && validLocalDate(end) && start <= end ? value.days.filter(day => day.date >= start && day.date <= end) : value.days });
  };
  const changeRule = (timeRule: VisualGroupRule) => onChange({ timeRule,
    ...(timeRule === "SAME_TIME_EACH_DAY" || timeRule === "CONTINUOUS" ? { startTime: value.startTime ?? "09:00", endTime: value.endTime ?? "18:00", weekdays: value.weekdays.length ? value.weekdays : [1, 2, 3, 4, 5, 6, 7] } : {}),
    ...(timeRule === "PER_DAY" && !value.days.length ? { days: [{ date: value.startDate, enabled: true, startTime: value.startTime ?? "09:00", endTime: value.endTime ?? "18:00" }] } : {}),
  });
  const invalid = validateVisualGroup(value);
  return <aside className="calendar-editor cal-group-editor" aria-label="그룹 블록 편집기">
    <header><strong>그룹 블록</strong><button aria-label="그룹 편집기 닫기" onClick={onClose}><X size={16}/></button></header>
    <p className="cal-group-description">일정을 감싸는 시각적 맥락입니다. 근무·활동 시간 합계에 포함되지 않습니다.</p>
    <label>제목<input aria-label="그룹 제목" autoFocus={!value.id} maxLength={200} value={value.title} onChange={event => onChange({ title: event.target.value })} onBlur={onFlush} placeholder="예: 스터디카페 근무 기간"/></label>
    <fieldset><legend>기간</legend><div className="cal-group-pair">
      <label>시작일<input type="date" aria-label="그룹 시작일" value={value.startDate} onChange={event => setRange({ startDate: event.target.value })} onBlur={onFlush}/></label>
      <label>종료일<input type="date" aria-label="그룹 종료일" value={value.endDate} onChange={event => setRange({ endDate: event.target.value })} onBlur={onFlush}/></label>
    </div></fieldset>
    <label>시간 규칙<select aria-label="그룹 시간 규칙" value={value.timeRule} onChange={event => changeRule(event.target.value as VisualGroupRule)}>{Object.entries(GROUP_RULE_LABELS).map(([rule, label]) => <option key={rule} value={rule}>{label}</option>)}</select></label>
    {value.timeRule === "ALL_DAY" && <p className="cal-group-description">기간에 포함된 날짜 전체를 표시합니다.</p>}
    {value.timeRule === "SAME_TIME_EACH_DAY" && <div className="cal-group-weekdays" role="group" aria-label="그룹 표시 요일">{weekdays.map((name, index) => <button key={name} aria-pressed={value.weekdays.includes(index + 1)} onClick={() => onChange({ weekdays: value.weekdays.includes(index + 1) ? value.weekdays.filter(day => day !== index + 1) : [...value.weekdays, index + 1] })}>{name}</button>)}</div>}
    {(value.timeRule === "SAME_TIME_EACH_DAY" || value.timeRule === "CONTINUOUS") && <div className="cal-group-pair">
      <label>{value.timeRule === "CONTINUOUS" ? "첫날 시작" : "시작 시간"}<input type="time" step={300} aria-label="그룹 시작 시간" value={value.startTime?.slice(0, 5) ?? ""} onChange={event => onChange({ startTime: event.target.value || null })} onBlur={onFlush}/></label>
      <label>{value.timeRule === "CONTINUOUS" ? "마지막 날 종료" : "종료 시간"}<input type="time" step={300} aria-label="그룹 종료 시간" value={value.endTime?.slice(0, 5) ?? ""} onChange={event => onChange({ endTime: event.target.value || null })} onBlur={onFlush}/></label>
    </div>}
    {value.timeRule === "PER_DAY" && <fieldset className="cal-group-days"><legend>날짜별 시간</legend><p className="cal-group-description">켜진 날짜만 표시합니다.</p>{dates.map(date => {
      const day = value.days.find(row => row.date === date) ?? { date, enabled: false, startTime: null, endTime: null };
      const update = (patch: Partial<typeof day>) => onChange({ days: [...value.days.filter(row => row.date !== date), { ...day, ...patch }].sort((a, b) => a.date.localeCompare(b.date)) });
      return <div key={date} className="cal-group-day"><label><input type="checkbox" aria-label={`${date} 그룹 표시`} checked={day.enabled} onChange={event => update({ enabled: event.target.checked, startTime: day.startTime ?? "09:00", endTime: day.endTime ?? "18:00" })}/>{date.slice(5)}</label>
        <input type="time" step={300} aria-label={`${date} 그룹 시작`} disabled={!day.enabled} value={day.startTime?.slice(0, 5) ?? ""} onChange={event => update({ startTime: event.target.value || null })} onBlur={onFlush}/>
        <input type="time" step={300} aria-label={`${date} 그룹 종료`} disabled={!day.enabled} value={day.endTime?.slice(0, 5) ?? ""} onChange={event => update({ endTime: event.target.value || null })} onBlur={onFlush}/>
      </div>;
    })}<div className="cal-group-pagination"><button disabled={firstDate <= value.startDate} onClick={() => { const previous = shiftGroupDate(firstDate, -7); setPage({ key, date: previous < value.startDate ? value.startDate : previous }); }}>이전 날짜</button><button disabled={dates.at(-1) === value.endDate || !dates.length} onClick={() => setPage({ key, date: shiftGroupDate(firstDate, 7) })}>다음 날짜</button></div></fieldset>}
    <div className="cal-group-color"><span>색상</span><CategoryColorPicker name="그룹 블록" selected={value.color} inherited={false} recent={recent} defaultLabel="기본 색상" onColor={color => { const selected = color ?? GROUP_COLOR; setRecent(old => [selected, ...old.filter(item => item !== selected)].slice(0, 8)); onChange({ color: selected }); }}/></div>
    <div className="cal-group-status" role="status">{status}</div>
    {error && <p className="cal-group-error" role="alert">{error}{status === "저장 실패" && <button disabled={busy || !!invalid} onClick={onRetry}>다시 시도</button>}</p>}
    <button className="cal-group-delete" disabled={busy} onClick={onDelete}><Trash2 size={14}/>삭제</button>
    {guard && <div className="cal-group-guard" role="dialog" aria-modal="true" aria-label="그룹 변경사항 확인"><div><h3>그룹 변경사항을 저장하지 못했습니다.</h3><p>{error ?? invalid ?? "저장 상태를 확인한 뒤 이동하세요."}</p><button onClick={onContinue}>계속 편집</button><button disabled={busy || !!invalid} onClick={onRetry}>다시 저장 후 이동</button><button disabled={busy} onClick={onDiscard}>변경사항 버리고 이동</button></div></div>}
  </aside>;
}
