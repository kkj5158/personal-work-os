"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { SystemSwitcher } from "@/components/SystemSwitcher";
import { addDays, startOfWeek, toDateKey } from "@/lib/date";
import { categoryAppearance, categoryKey, type CalendarCategory, type CalendarPreferences } from "./appearance";

export function CalendarRail({ date, week, categories, prefs, onPreferences, onDate, stateVisible, onState, onNavigate }: {
  date: Date; week: boolean; categories: CalendarCategory[]; prefs: CalendarPreferences;
  onPreferences: (prefs: CalendarPreferences) => void; onDate: (date: Date) => void;
  stateVisible: boolean; onState: () => void; onNavigate: (href: string) => void;
}) {
  const [monthContext, setMonthContext] = useState(() => ({dateKey:toDateKey(date), month:new Date(date.getFullYear(), date.getMonth(), 1)}));
  const month=monthContext.dateKey === toDateKey(date) ? monthContext.month : new Date(date.getFullYear(),date.getMonth(),1);
  const setMonth=(month:Date)=>setMonthContext({dateKey:toDateKey(date),month});
  const [settings, setSettings] = useState(false);
  const first = startOfWeek(month);
  const weekStart = toDateKey(startOfWeek(date));
  const weekEnd = toDateKey(addDays(startOfWeek(date), 6));
  function visibility(keys: string[], visible: boolean) {
    const hidden = { ...prefs.hidden };
    keys.forEach(key => { hidden[key] = !visible; });
    onPreferences({ ...prefs, hidden });
  }
  function color(category: CalendarCategory, value: string | null) {
    const colors = { ...prefs.colors };
    const key = categoryKey(category.domain, category.id);
    if (value) colors[key] = value; else delete colors[key];
    onPreferences({ ...prefs, colors });
  }
  function colorControl(category: CalendarCategory) {
    const key = categoryKey(category.domain, category.id);
    return <span className="cal-color-control"><input type="color" aria-label={`${category.name} 색상`} value={categoryAppearance(category.domain, category.id, categories, prefs).body} onChange={e => color(category, e.target.value)} />{settings && category.parentId && prefs.colors[key] && <button title="부모 색상 상속" onClick={() => color(category, null)}>↶</button>}</span>;
  }
  const visibleCategories = categories.filter(c => prefs.showInactive || c.isActive);
  return <aside className="calendar-rail app-calendar-accent" aria-label="Calendar 탐색">
    <div className="app-sidebar-identity" title="Calendar"><SystemSwitcher system="Calendar" navigate={onNavigate} /></div>
    <section className="cal-mini-month" aria-label="미니 월 달력">
      <header><strong>{month.getFullYear()}년 {month.getMonth() + 1}월</strong><button aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={15}/></button><button aria-label="다음 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={15}/></button></header>
      <div className="cal-month-grid">{["월", "화", "수", "목", "금", "토", "일"].map(d => <span key={d}>{d}</span>)}{Array.from({length: 42}, (_, i) => {
        const d = addDays(first, i); const key = toDateKey(d); const selected = key === toDateKey(date);
        return <button key={key} aria-label={key} aria-pressed={selected} className={`${selected ? "selected" : ""} ${week && key >= weekStart && key <= weekEnd ? "in-week" : ""} ${d.getMonth() !== month.getMonth() ? "outside" : ""}`} onClick={() => onDate(d)}>{d.getDate()}</button>;
      })}</div>
    </section>
    <section className="cal-category-tree" aria-label="카테고리 표시">
      <h2>{settings ? "색상 및 표시 설정" : "내 캘린더"}</h2>
      {(["WORK", "LIFE"] as const).map(domain => {
        const all = categories.filter(c => c.domain === domain);
        const shown = visibleCategories.filter(c => c.domain === domain);
        const keys = [...all.map(c => categoryKey(domain, c.id)), categoryKey(domain, null)];
        return <div key={domain} className="cal-system-tree"><Check label={`${domain} OS`} keys={keys} prefs={prefs} onChange={visibility}/>
          {shown.filter(c => !c.parentId).map(parent => {
            const children = shown.filter(c => c.parentId === parent.id);
            const descendants = [parent, ...all.filter(c => c.parentId === parent.id)].map(c => categoryKey(domain, c.id));
            return <div key={parent.id} className="cal-parent"><div className="cal-category-line"><Check label={parent.name} keys={descendants} prefs={prefs} onChange={visibility}/>{colorControl(parent)}</div>
              {children.map(child => <div key={child.id} className="cal-child cal-category-line"><Check label={child.name} keys={[categoryKey(domain, child.id)]} prefs={prefs} onChange={visibility}/>{colorControl(child)}</div>)}
            </div>;
          })}<div className="cal-parent"><Check label="카테고리 없음" keys={[categoryKey(domain, null)]} prefs={prefs} onChange={visibility}/></div>
        </div>;
      })}
      <label className="cal-inactive"><input type="checkbox" checked={prefs.showInactive} onChange={e => onPreferences({...prefs, showInactive:e.target.checked})}/>비활성 카테고리 표시</label>
    </section>
    <section className="cal-context"><h2>Context</h2><label><input type="checkbox" checked={stateVisible} onChange={onState}/>State</label></section>
    <button className="cal-settings" aria-pressed={settings} onClick={() => setSettings(!settings)}><Settings2 size={15}/>색상 및 표시 설정</button>
    {settings && <p className="cal-hint">부모 색상이 기본 색상입니다. 자식 색상의 ↶ 버튼으로 상속을 복원합니다.</p>}
  </aside>;
}
function Check({label, keys, prefs, onChange}: {label:string;keys:string[];prefs:CalendarPreferences;onChange:(keys:string[],checked:boolean)=>void}) {
  const ref = useRef<HTMLInputElement>(null);
  const count = keys.filter(key => !prefs.hidden[key]).length;
  useEffect(() => { if(ref.current) ref.current.indeterminate = count > 0 && count < keys.length; }, [count, keys.length]);
  return <label><input ref={ref} type="checkbox" checked={count === keys.length} onChange={e => onChange(keys, e.target.checked)}/><span>{label}</span></label>;
}
