"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelRightOpen } from "lucide-react";
import { TimeGrid } from "./TimeGrid";
import { CalendarToolbar, type CalendarPlanMode, type CalendarViewMode } from "./CalendarToolbar";
import { CalendarRail } from "./CalendarRail";
import { CalendarEditor } from "./CalendarEditor";
import { WeekUnscheduledActualRow } from "./WeekUnscheduledActualRow";
import { ReflectionModal } from "./ReflectionModal";
import { BatchActualEditor } from "./BatchActualEditor";
import { useCalendarEditor, actualInput, type CalendarToast } from "./useCalendarEditor";
import { blockEditor, editorBlock, newEditor, stateEditor, unscheduledEditor } from "./editorModel";
import { calendarCategories, categoryAppearance, categoryVisible, EMPTY_PREFERENCES, PREFERENCE_KEY, type CalendarPreferences } from "./appearance";
import type { GridBlock } from "./gridTypes";
import type { ActivityCategory, CalendarRangeResponse, CalendarStateBlockDto, LifeCategoryDto } from "@/lib/api/types";
import { getCalendarRange } from "@/lib/api/calendar";
import { apiClient } from "@/lib/api/client";
import { listCategories } from "@/lib/api/categories";
import { listLifeCategories } from "@/lib/api/lifeCategories";
import { reschedulePlannedBlock } from "@/lib/api/plannedBlocks";
import { addDays, formatKoreanDate, formatKoreanDateRange, startOfDay, startOfWeek, toDateKey, toLocalDateTimeString } from "@/lib/date";
import "./calendar.css";

const EMPTY_RANGE:CalendarRangeResponse={planBlocks:[],actualBlocks:[],unscheduledActual:[],stateBlocks:[],attendanceContext:[],workRecords:[]};
export default function CalendarPage() {
  const router=useRouter();
  const [view,setView]=useState<CalendarViewMode>("day");
  const [mode,setMode]=useState<CalendarPlanMode>("plan");
  const [date,setDate]=useState(()=>startOfDay(new Date()));
  const [range,setRange]=useState(EMPTY_RANGE);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [work,setWork]=useState<ActivityCategory[]>([]);
  const [life,setLife]=useState<LifeCategoryDto[]>([]);
  const [prefs,setPrefs]=useState<CalendarPreferences>(EMPTY_PREFERENCES);
  const [stateModes,setStateModes]=useState({plan:false,actual:true,compare:true});
  const [editorOpen,setEditorOpen]=useState(true);
  const [reflection,setReflection]=useState(false);
  const [batch,setBatch]=useState(false);
  const [toast,setToast]=useState<CalendarToast|null>(null);
  const [toastBusy,setToastBusy]=useState(false);
  const [planHeight,setPlanHeight]=useState(30);
  const [optimistic,setOptimistic]=useState<GridBlock|null>(null);
  const planScroll=useRef<HTMLDivElement>(null);
  const actualScroll=useRef<HTMLDivElement>(null);
  const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const requestId=useRef(0);
  const days=useMemo(()=>view === "day" ? [date] : Array.from({length:7},(_,i)=>addDays(startOfWeek(date),i)),[date,view]);
  const from=toDateKey(days[0]),to=toDateKey(days[days.length-1]),dateKey=toDateKey(date);
  const refresh=useCallback(async()=>{
    const id=++requestId.current;
    try { const result=await getCalendarRange(from,to); if(id === requestId.current) {setRange(result);setLoadError(null);} }
    catch(e){if(id === requestId.current) setLoadError(e instanceof Error ? e.message : "캘린더를 불러오지 못했습니다.");}
  },[from,to]);
  const notify=useCallback((next:CalendarToast)=>{
    if(toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);toastTimer.current=setTimeout(()=>setToast(null),8000);
  },[]);
  const editor=useCalendarEditor(refresh,notify);
  const categories=useMemo(()=>calendarCategories(work,life),[work,life]);
  // This effect subscribes the visible date range to asynchronous API data.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    void Promise.all([listCategories(),listLifeCategories()]).then(([w,l])=>{setWork(w);setLife(l);}).catch(e=>setLoadError(e.message));
    const query=new URLSearchParams(window.location.search);
    const requested=query.get("date");
    // Browser-only URL/preferences hydrate after SSR without a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) setDate(new Date(`${requested}T00:00:00`));
    if(query.get("reflection") === "true") setReflection(true);
    try { const saved=JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? "null"); if(saved) setPrefs({...EMPTY_PREFERENCES,...saved}); } catch { /* keep defaults if storage is unavailable */ }
    return ()=>{if(toastTimer.current) clearTimeout(toastTimer.current);};
  },[]);
  function preferences(next:CalendarPreferences){setPrefs(next);try{localStorage.setItem(PREFERENCE_KEY,JSON.stringify(next));}catch{notify({message:"브라우저에서 표시 설정을 저장할 수 없습니다."});}}
  const leaveRef=useRef(editor.leave);
  useEffect(()=>{leaveRef.current=editor.leave;},[editor.leave]);
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key === "Escape" && !reflection && !batch){event.preventDefault();void leaveRef.current(()=>{});}};
    document.addEventListener("keydown",escape);return ()=>document.removeEventListener("keydown",escape);
  },[reflection,batch]);
  const allActual=useMemo(()=>range.actualBlocks.map(b=>({...b,id:b.sourceId})),[range.actualBlocks]);
  function visible(block:{domainType:"WORK"|"LIFE";activityCategoryId:string|null;lifeCategoryId:string|null}){return categoryVisible(block.domainType,block.domainType === "WORK" ? block.activityCategoryId : block.lifeCategoryId,categories,prefs);}
  function appearance(block:GridBlock){return categoryAppearance(block.domainType,block.domainType === "WORK" ? block.activityCategoryId : block.lifeCategoryId,categories,prefs);}
  function displayed(kind:"plan"|"actual"):GridBlock[]{
    let blocks:GridBlock[]=kind === "plan" ? range.planBlocks : allActual;
    const selected=editor.value;
    if(selected?.kind === kind && selected.id) {
      blocks=blocks.filter(b=>b.id !== selected.id);
      if(!selected.unscheduled) blocks=[...blocks,editorBlock(selected)];
    }
    if(optimistic && (optimistic.sourceType ? "actual" : "plan") === kind) blocks=blocks.map(b=>b.id === optimistic.id ? optimistic : b);
    return blocks.filter(b=>b.id !== editor.removingId && visible(b));
  }
  const states=useMemo(()=>{
    const map=new Map<string,CalendarStateBlockDto[]>();
    for(const state of range.stateBlocks) map.set(state.date,[...(map.get(state.date) ?? []),state]);
    const v=editor.value;
    if(v?.kind === "state" && !v.id) map.set(v.date,[...(map.get(v.date) ?? []),{id:"draft",date:v.date,stateGroup:v.stateGroup,label:v.title || "새 상태",startAt:`${v.date}T${v.start}:00`,endAt:`${v.date}T${v.end}:00`,memo:v.memo}]);
    return map;
  },[range.stateBlocks,editor.value]);
  function create(kind:"plan"|"actual"|"state",day:Date,start:number,end:number){editor.select(newEditor(kind,toDateKey(day),start,end));setEditorOpen(true);}
  function select(block:GridBlock){if(editor.value?.id !== block.id)editor.select(blockEditor(block));setEditorOpen(true);}
  async function move(block:GridBlock,start:Date,end:Date){
    const selected=editor.value;
    // Flush pending text before time changes; an unsaved Actual keeps its guard.
    await editor.leave(()=>{void persistMove();});
    async function persistMove(){
      const moved={...block,startAt:toLocalDateTimeString(start),endAt:toLocalDateTimeString(end)};
      setOptimistic(moved);
      try {
        if(block.sourceType) await apiClient.put(`/api/calendar/actual/${block.sourceType}/${block.id}`,actualInput(blockEditor(moved)));
        else await reschedulePlannedBlock(block.id,moved.startAt,moved.endAt);
        await refresh();
        if(selected?.id === block.id) editor.assign(blockEditor(moved));
      }catch(e){notify({message:e instanceof Error ? e.message : "일정을 이동하지 못했습니다."});if(selected?.id === block.id)editor.assign(selected);}
      finally{setOptimistic(null);}
    }
  }
  const stateVisible=stateModes[mode];
  const common={days,colorMode:"ACTIVITY" as const,phases:[],projects:[],appearance,attendanceContext:range.attendanceContext,selectedId:editor.value?.id ?? undefined,onBlockClick:select,onBlockTimeChange:move,onInvalidDrop:()=>notify({message:"이미 기록된 실제 시간이 있습니다."})};
  const syncPlanScroll=useCallback((top:number)=>{if(mode === "compare" && actualScroll.current && actualScroll.current.scrollTop !== top)actualScroll.current.scrollTop=top;},[mode]);
  const syncActualScroll=useCallback((top:number)=>{if(mode === "compare" && planScroll.current && planScroll.current.scrollTop !== top)planScroll.current.scrollTop=top;},[mode]);
  function grid(kind:"plan"|"actual",height:number){
    const selected=editor.value;
    return <TimeGrid {...common} blocks={displayed(kind)} interactionMode={kind} draft={selected?.kind === kind && !selected.id && !selected.unscheduled ? editorBlock(selected) : null} conflictBlocks={allActual} onCreateRequest={(d,s,e)=>create(kind,d,s,e)} maxHeightVh={height}
      footer={kind === "actual" ? unscheduled : undefined} stateBlocksByDate={states} showWeekStateStrip={stateVisible && (mode !== "compare" || kind === "actual")}
      onStateCreate={(d,s,e)=>create("state",d,s,e)} onStateClick={s=>{if(s.id !== "draft")editor.select(stateEditor(s));setEditorOpen(true);}}
      scrollContainerRef={kind === "plan" ? planScroll : actualScroll} onScroll={kind === "plan" ? syncPlanScroll : syncActualScroll}/>;
  }
  const unscheduled=<WeekUnscheduledActualRow days={days} items={range.unscheduledActual.filter(visible)} onScheduleRequest={item=>{editor.select(unscheduledEditor(item));setEditorOpen(true);}}/>;
  const label=view === "day" ? formatKoreanDate(date) : formatKoreanDateRange(days[0],days[6]);
  return <div className={`calendar-shell ${editorOpen ? "" : "editor-collapsed"}`}>
    <CalendarRail date={date} week={view === "week"} categories={categories} prefs={prefs} onPreferences={preferences} onDate={d=>void editor.leave(()=>setDate(d))} stateVisible={stateVisible} onState={()=>setStateModes({...stateModes,[mode]:!stateVisible})} onNavigate={href=>void editor.leave(()=>router.push(href))}/>
    <section className="calendar-main" aria-label="Calendar">
      <CalendarToolbar viewMode={view} onViewModeChange={v=>void editor.leave(()=>setView(v))} planMode={mode} onPlanModeChange={m=>void editor.leave(()=>setMode(m))} colorMode="ACTIVITY" onColorModeChange={()=>{}} onPrev={()=>void editor.leave(()=>setDate(addDays(date,view === "day" ? -1 : -7)))} onNext={()=>void editor.leave(()=>setDate(addDays(date,view === "day" ? 1 : 7)))} onToday={()=>void editor.leave(()=>setDate(startOfDay(new Date())))} label={label}/>
      <div className="cal-context-bar"><span>Asia/Seoul · 15분 단위</span><button onClick={()=>void editor.leave(()=>setReflection(true))}>회고 작성 / 열기</button>{mode !== "plan" && <button onClick={()=>void editor.leave(()=>setBatch(true))}>계획을 실행으로 가져오기</button>}{!editorOpen && <button aria-label="편집기 펼치기" onClick={()=>setEditorOpen(true)}><PanelRightOpen size={16}/></button>}</div>
      {loadError && <p className="cal-error" role="alert">{loadError}<button onClick={()=>void refresh()}>다시 시도</button></p>}
      <div className={`calendar-timelines ${view} ${mode}`}>
        {mode !== "compare" ? grid(mode,72) : <>
          <section className="cal-compare-plan"><h2>PLAN <span>계획</span></h2>{grid("plan",view === "week" ? planHeight : 69)}</section>
          {view === "week" && <div className="cal-divider" role="separator" aria-label="계획 실행 구분선" aria-orientation="horizontal" tabIndex={0} onKeyDown={e=>{if(e.key === "ArrowUp" || e.key === "ArrowDown"){e.preventDefault();setPlanHeight(h=>Math.max(18,Math.min(42,h+(e.key === "ArrowDown" ? 2 : -2))));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.y=String(e.clientY);e.currentTarget.dataset.height=String(planHeight);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){setPlanHeight(Math.max(18,Math.min(42,Number(e.currentTarget.dataset.height)+(e.clientY-Number(e.currentTarget.dataset.y))/window.innerHeight*100)));}}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}>•••</div>}
          <section className="cal-compare-actual"><h2>ACTUAL <span>실행</span></h2>{grid("actual",view === "week" ? 60-planHeight : 69)}</section>
        </>}
      </div>
    </section>
    {editorOpen && <CalendarEditor value={editor.value} date={dateKey} categories={categories} status={editor.status} error={editor.error} busy={editor.busy} guard={editor.guard} onChange={editor.change} onSave={()=>void editor.save(true)} onFlush={()=>void editor.save()} onDelete={()=>void editor.remove()} onClose={()=>void editor.leave(()=>setEditorOpen(false))} onDiscard={editor.discard} onContinue={editor.continueEditing}/>}
    {toast && <div className="cal-toast" role="status">{toast.message}{toast.undo && <button disabled={toastBusy} onClick={async()=>{if(toastTimer.current)clearTimeout(toastTimer.current);setToastBusy(true);try{await toast.undo?.();setToast(null);}catch(e){notify({message:e instanceof Error ? e.message : "복원하지 못했습니다.",undo:toast.undo});}finally{setToastBusy(false);}}}>실행 취소</button>}<button aria-label="알림 닫기" onClick={()=>setToast(null)}>×</button></div>}
    <ReflectionModal open={reflection} date={dateKey} onClose={()=>setReflection(false)}/>
    <BatchActualEditor open={batch} date={date} sourcePlans={range.planBlocks.filter(p=>p.startAt.slice(0,10) === dateKey)} categoryLabelFor={(domain,id)=>categories.find(c=>c.domain === domain && c.id === id)?.name ?? "카테고리 없음"} onClose={()=>setBatch(false)} onCommitted={refresh}/>
  </div>;
}
