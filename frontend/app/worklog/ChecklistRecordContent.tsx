"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@primer/octicons-react";
import type { ChecklistCategoryDto, ChecklistItemDto, ChecklistMatrixColumnDto, ChecklistMatrixResponseDto } from "@/lib/api/types";
import { getChecklistMatrix, setChecklistEntryAchieved } from "@/lib/api/checklist";
import { addDays, formatKoreanDate, formatKoreanDateRange, formatKoreanWeekday, startOfWeek, toDateKey } from "@/lib/date";
import { seoulToday } from "@/lib/seoulDate";
import { AttendanceBadge } from "./AttendanceBadge";
import { mapStatusFromBackend } from "./mapping";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";

type Mode = "day" | "week" | "month";
type Priority = "ALL" | "CORE" | "SECONDARY";
type Completion = "ALL" | "DONE" | "OPEN";
interface FilterState { priority: Priority; currentActiveOnly: boolean; includeDeleted: boolean; categoryIds: string[]; completion: Completion }

const initialFilters: FilterState = { priority: "ALL", currentActiveOnly: false, includeDeleted: false, categoryIds: [], completion: "ALL" };

function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function parseDateKey(value: string) { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d); }
function period(mode: Mode, anchor: Date) {
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "week") { const from = startOfWeek(anchor); return { from, to: addDays(from, 6) }; }
  return { from: monthStart(anchor), to: monthEnd(anchor) };
}

function PriorityTag({ value }: { value: "CORE" | "SECONDARY" }) {
  return <span className="border-l border-border-muted pl-2 text-[10px] font-medium text-fg-muted">{value}</span>;
}

interface Props { items: ChecklistItemDto[]; categories: ChecklistCategoryDto[] }

export function ChecklistRecordContent({ items, categories }: Props) {
  const today = seoulToday();
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(today);
  const [matrix, setMatrix] = useState<ChecklistMatrixResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [draft, setDraft] = useState<FilterState>(initialFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const range = useMemo(() => period(mode, anchor), [mode, anchor]);

  const fromKey = toDateKey(range.from), toKey = toDateKey(range.to);
  useEffect(() => { void (async () => {
    await Promise.resolve(); setLoading(true);
    try { setMatrix(await getChecklistMatrix(fromKey, toKey)); setError(null); }
    catch (e) { setError(describeApiError(e, "체크리스트 기록을 불러오지 못했습니다.")); }
    finally { setLoading(false); }
  })(); }, [fromKey, toKey]);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const rowByDate = new Map((matrix?.rows ?? []).map((r) => [r.date, r]));
  const columns = (matrix?.columns ?? []).filter((c) => {
    const current = itemById.get(c.itemId);
    if (filters.priority !== "ALL" && c.priority !== filters.priority) return false;
    if (filters.currentActiveOnly && !current?.active) return false;
    if (!filters.includeDeleted && c.deleted) return false;
    if (filters.categoryIds.length && !filters.categoryIds.includes(c.categoryId ?? "none")) return false;
    if (filters.completion !== "ALL") {
      const achieved = (matrix?.rows ?? []).some((r) => r.cells.some((cell) => cell.itemId === c.itemId && cell.achieved));
      if (filters.completion === "DONE" ? !achieved : achieved) return false;
    }
    return true;
  });
  const grouped = (() => {
    const map = new Map<string, ChecklistMatrixColumnDto[]>();
    for (const col of columns) { const key = col.categoryId ?? "none"; map.set(key, [...(map.get(key) ?? []), col]); }
    return [...map.entries()].sort(([a], [b]) => (categoryById.get(a)?.position ?? 9999) - (categoryById.get(b)?.position ?? 9999));
  })();

  async function toggle(entryId: string, achieved: boolean) {
    if (!matrix) return; const previous = matrix;
    setMatrix({ ...matrix, rows: matrix.rows.map((r) => ({ ...r, cells: r.cells.map((c) => c.entryId === entryId ? { ...c, achieved } : c) })) });
    try { await setChecklistEntryAchieved(entryId, achieved); } catch (e) { setMatrix(previous); setError(describeApiError(e, "저장하지 못했습니다.")); }
  }
  function move(delta: number) { setAnchor((d) => mode === "day" ? addDays(d, delta) : mode === "week" ? addDays(d, 7 * delta) : addMonths(d, delta)); }
  function label() { return mode === "day" ? `${formatKoreanDate(anchor)} (${formatKoreanWeekday(anchor).slice(0, 1)})` : mode === "week" ? formatKoreanDateRange(range.from, range.to) : `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`; }
  function toggleCollapse(key: string) { setCollapsed((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }

  const quick = (key: keyof FilterState, value: unknown) => setFilters((f) => ({ ...f, [key]: value }));

  return <div className="flex flex-col gap-4">
    {error && <p className="text-sm text-danger-fg">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex h-9 rounded-md border border-control-border bg-control-bg p-0.5 text-xs font-medium">
        {([['day','일'],['week','주'],['month','월']] as [Mode,string][]).map(([m,l]) => <button key={m} onClick={() => setMode(m)} className={`rounded px-3 ${mode===m?'bg-surface-default text-fg-default shadow-sm':'text-fg-muted'}`}>{l}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => move(-1)} className={`h-9 rounded-md border border-control-border px-3 text-sm ${FOCUS_VISIBLE}`}>‹ 이전</button>
        <label className={`relative h-9 min-w-48 cursor-pointer rounded-md border border-control-border px-3 text-center text-sm font-medium leading-9 ${FOCUS_VISIBLE}`}>
          {label()}<input type="date" value={toDateKey(anchor)} onChange={(e)=>setAnchor(parseDateKey(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
        <button onClick={() => move(1)} className={`h-9 rounded-md border border-control-border px-3 text-sm ${FOCUS_VISIBLE}`}>다음 ›</button>
        <button onClick={() => setAnchor(today)} className={`h-9 rounded-md border border-control-border px-3 text-sm ${FOCUS_VISIBLE}`}>{mode==='month'?'이번 달':'오늘'}</button>
      </div>
    </div>
    <div className="relative flex flex-wrap gap-2">
      <button onClick={()=>quick('priority',filters.priority==='CORE'?'ALL':'CORE')} className={`h-8 rounded-md border px-3 text-xs ${filters.priority==='CORE'?'border-primary-emphasis bg-primary-subtle text-primary-fg':'border-control-border'}`}>코어만</button>
      <button onClick={()=>quick('currentActiveOnly',!filters.currentActiveOnly)} className={`h-8 rounded-md border px-3 text-xs ${filters.currentActiveOnly?'border-primary-emphasis bg-primary-subtle text-primary-fg':'border-control-border'}`}>현재 활성만</button>
      {mode==='day'&&<button onClick={()=>quick('completion',filters.completion==='OPEN'?'ALL':'OPEN')} className={`h-8 rounded-md border px-3 text-xs ${filters.completion==='OPEN'?'border-primary-emphasis bg-primary-subtle text-primary-fg':'border-control-border'}`}>미완료만</button>}
      <button onClick={()=>{setDraft(filters);setAdvancedOpen(!advancedOpen)}} className="h-8 rounded-md border border-control-border px-3 text-xs">상세 필터</button>
      {advancedOpen&&<div className="absolute left-0 top-10 z-30 w-80 rounded-md border border-border-default bg-surface-default p-4 shadow-lg">
        <p className="mb-2 text-xs font-semibold">우선순위</p><select value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value as Priority})} className="mb-3 h-8 w-full rounded border border-control-border px-2 text-sm"><option value="ALL">전체</option><option value="CORE">CORE</option><option value="SECONDARY">SECONDARY</option></select>
        <p className="mb-2 text-xs font-semibold">현재 상태</p><label className="mr-3 text-xs"><input type="checkbox" checked={draft.currentActiveOnly} onChange={e=>setDraft({...draft,currentActiveOnly:e.target.checked})}/> 활성만</label><label className="text-xs"><input type="checkbox" checked={draft.includeDeleted} onChange={e=>setDraft({...draft,includeDeleted:e.target.checked})}/> 삭제 포함</label>
        <p className="mb-2 mt-3 text-xs font-semibold">카테고리</p><div className="max-h-28 overflow-auto">{[...categories,{id:'none',name:'미분류',position:9999}].map(c=><label key={c.id} className="block text-xs"><input type="checkbox" checked={draft.categoryIds.includes(c.id)} onChange={e=>setDraft({...draft,categoryIds:e.target.checked?[...draft.categoryIds,c.id]:draft.categoryIds.filter(x=>x!==c.id)})}/> {c.name}</label>)}</div>
        <div className="mt-4 flex justify-end gap-2"><button onClick={()=>{setDraft(initialFilters);setFilters(initialFilters);setAdvancedOpen(false)}} className="h-8 px-2 text-xs">초기화</button><button onClick={()=>{setFilters(draft);setAdvancedOpen(false)}} className="h-8 rounded bg-primary-emphasis px-3 text-xs text-white">적용</button></div>
      </div>}
    </div>
    {loading||!matrix?<p className="py-10 text-center text-sm text-fg-muted">불러오는 중…</p>:mode==='day'?<DayView date={anchor} row={rowByDate.get(toDateKey(anchor))} groups={grouped} categoryById={categoryById} collapsed={collapsed} onCollapse={toggleCollapse} onToggle={toggle}/>:mode==='week'?<WeekView from={range.from} groups={grouped} rows={rowByDate} categoryById={categoryById} collapsed={collapsed} onCollapse={toggleCollapse} onToggle={toggle}/>:<MonthView from={range.from} to={range.to} columns={columns} rows={rowByDate} onToggle={toggle}/>} 
  </div>;
}

type Row = ChecklistMatrixResponseDto['rows'][number];
interface Common { groups: [string,ChecklistMatrixColumnDto[]][]; categoryById: Map<string,ChecklistCategoryDto>; collapsed:Set<string>; onCollapse:(k:string)=>void; onToggle:(id:string,a:boolean)=>void }
function DayView({date,row,groups,categoryById,collapsed,onCollapse,onToggle}:Common&{date:Date;row?:Row}) {
  if(!row?.applicable)return <div className="rounded-md border border-border-default py-12 text-center text-sm text-fg-muted">체크리스트 적용 대상이 아닙니다</div>;
  const cells=new Map(row.cells.map(c=>[c.itemId,c]));const visible=groups.map(([k,cs])=>[k,cs.filter(c=>cells.has(c.itemId))] as [string,ChecklistMatrixColumnDto[]]).filter(([,cs])=>cs.length);
  const total=visible.flatMap(([,c])=>c).length,done=visible.flatMap(([,c])=>c).filter(c=>cells.get(c.itemId)?.achieved).length;
  return <div className="flex flex-col gap-4"><div><p className="font-semibold">{formatKoreanDate(date)} ({formatKoreanWeekday(date).slice(0,1)}) · 근무</p><p className="mt-1 text-sm text-fg-muted">적용 {total}개 · 완료 {done}개 · 미완료 {total-done}개 · 달성률 {total?Math.round(done/total*100):0}%</p></div>{visible.map(([k,cs])=><div key={k} className="rounded-md border border-border-default"><button onClick={()=>onCollapse(k)} className="flex w-full items-center justify-between bg-canvas-subtle px-3 py-2 text-sm font-medium"><span>{collapsed.has(k)?<ChevronRightIcon/>:<ChevronDownIcon/>} {categoryById.get(k)?.name??'미분류'}</span><span>{cs.filter(c=>cells.get(c.itemId)?.achieved).length}/{cs.length} 완료</span></button>{!collapsed.has(k)&&cs.map(c=>{const cell=cells.get(c.itemId)!;return <label key={c.itemId} className="flex items-center gap-3 border-t border-border-default px-4 py-3 text-sm"><input type="checkbox" checked={cell.achieved} onChange={()=>onToggle(cell.entryId,!cell.achieved)}/><span>{c.emoji} {c.name}</span><PriorityTag value={c.priority}/></label>})}</div>)}</div>;
}
function WeekView({from,groups,categoryById,collapsed,onCollapse,onToggle,rows}:Common&{from:Date;rows:Map<string,Row>}) {const days=Array.from({length:7},(_,i)=>addDays(from,i));return <div className="overflow-x-auto rounded-md border border-border-default"><table className="w-full text-sm"><thead><tr className="bg-canvas-subtle"><th className="px-3 py-2 text-left">항목</th>{days.map(d=><th key={toDateKey(d)} className="px-3 py-2">{d.getMonth()+1}/{d.getDate()}</th>)}</tr></thead><tbody>{groups.map(([k,cs])=><>{<tr key={`${k}-h`}><th colSpan={8} className="border-t border-border-default bg-canvas-subtle px-3 py-2 text-left"><button onClick={()=>onCollapse(k)}>{collapsed.has(k)?'▶':'▼'} {categoryById.get(k)?.name??'미분류'}</button></th></tr>}{!collapsed.has(k)&&cs.map(c=><tr key={c.itemId} className="border-t border-border-default"><th className="whitespace-nowrap px-3 py-2 text-left font-normal">{c.emoji} {c.name} <PriorityTag value={c.priority}/></th>{days.map(d=>{const row=rows.get(toDateKey(d)),cell=row?.cells.find(x=>x.itemId===c.itemId);return <td key={toDateKey(d)} className="px-3 py-2 text-center">{!row?.applicable||!cell?'—':<input type="checkbox" checked={cell.achieved} onChange={()=>onToggle(cell.entryId,!cell.achieved)}/>}</td>})}</tr>)}</>)}</tbody></table></div>}
function MonthView({from,to,columns,rows,onToggle}:{from:Date;to:Date;columns:ChecklistMatrixColumnDto[];rows:Map<string,Row>;onToggle:(id:string,a:boolean)=>void}) {const weeks:Date[][]=[];for(let s=startOfWeek(from);s<=to;s=addDays(s,7)){const ds=Array.from({length:7},(_,i)=>addDays(s,i)).filter(d=>d>=from&&d<=to);weeks.push(ds)}return <div className="flex flex-col gap-6">{weeks.map(ds=><div key={toDateKey(ds[0])}><h3 className="mb-2 text-sm font-semibold">{formatKoreanDateRange(ds[0],ds.at(-1)!)}</h3><div className="overflow-x-auto rounded-md border border-border-default"><table className="w-full text-sm"><thead><tr className="bg-canvas-subtle"><th className="px-3 py-2 text-left">요일</th><th className="px-3 py-2 text-left">날짜</th><th className="px-3 py-2 text-left">출결</th>{columns.map(c=><th key={c.itemId} className="min-w-28 px-3 py-2 text-left">{c.emoji} {c.name}</th>)}</tr></thead><tbody>{ds.map(d=>{const row=rows.get(toDateKey(d));return <tr key={toDateKey(d)} className="border-t border-border-default"><td className="px-3 py-2">{formatKoreanWeekday(d)}</td><td className="px-3 py-2">{formatKoreanDate(d)}</td><td className="px-3 py-2">{row?<AttendanceBadge status={mapStatusFromBackend(row.status)}/>:<span className="text-fg-muted">미입력</span>}</td>{columns.map(c=>{const cell=row?.cells.find(x=>x.itemId===c.itemId);return <td key={c.itemId} className="px-3 py-2 text-center">{!row?.applicable||!cell?'—':<input type="checkbox" checked={cell.achieved} onChange={()=>onToggle(cell.entryId,!cell.achieved)}/>}</td>})}</tr>})}</tbody></table></div></div>)}</div>}
