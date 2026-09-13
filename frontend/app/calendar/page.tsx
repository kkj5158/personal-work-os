"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PanelRightOpen } from "lucide-react";
import { TimeGrid } from "./TimeGrid";
import { CalendarToolbar, type CalendarPlanMode, type CalendarViewMode } from "./CalendarToolbar";
import { CalendarRail } from "./CalendarRail";
import { CalendarEditor } from "./CalendarEditor";
import { ReflectionModal } from "./ReflectionModal";
import { BatchActualEditor } from "./BatchActualEditor";
import { useCalendarEditor, type CalendarToast } from "./useCalendarEditor";
import { blockEditor, editorBlock, hasValidEditorTiming, newEditor, stateEditor, unscheduledEditor } from "./editorModel";
import { calendarCategories, categoryAppearance, categoryVisible, readPreferences, EMPTY_PREFERENCES, PREFERENCE_KEY, type CalendarPreferences } from "./appearance";
import type { GridBlock } from "./gridTypes";
import type { ActivityCategory, CalendarRangeResponse, CalendarStateBlockDto, CalendarUnscheduledActualDto, LifeCategoryDto } from "@/lib/api/types";
import { getCalendarRange } from "@/lib/api/calendar";
import { listCategories } from "@/lib/api/categories";
import { listLifeCategories } from "@/lib/api/lifeCategories";
import { reschedulePlannedBlock } from "@/lib/api/plannedBlocks";
import { addDays, startOfDay, startOfWeek, toDateKey, toLocalDateTimeString } from "@/lib/date";
import "./calendar.css";
import "./visualGroups.css";
import { useShellNavigationGuard } from "@/components/GlobalTabs";
import { activeDayStart } from "./overview";
import { observedRange } from "./statePolicy";
import { minuteTime } from "./editorModel";
import { actualWorkingRanges, calendarDateLabel } from "./calendarContext";
import { sameSource } from "./actualDrag";
import { groupsVisible } from "./appearance";
import { useVisualGroups } from "./useVisualGroups";
import { VisualGroupEditor } from "./VisualGroupEditor";
import { validateVisualGroup, type CalendarVisualGroup, type VisualGroupSlice } from "./visualGroups";
import { useCalendarWriteQueue,writeActualPlacement } from "./calendarWrites";

const EMPTY_RANGE:CalendarRangeResponse={planBlocks:[],actualBlocks:[],unscheduledActual:[],stateBlocks:[],attendanceContext:[],workRecords:[]};
export default function CalendarPage(){return <Suspense fallback={<div>Calendar 불러오는 중…</div>}><CalendarWorkspace/></Suspense>;}
function CalendarWorkspace() {
  const router=useRouter();
  const searchParams=useSearchParams();
  const queryKey=searchParams.toString();
  const [now,setNow]=useState<Date|null>(null);
  useEffect(()=>{
    const tick=()=>setNow(new Date());
    const initial=setTimeout(tick,0);
    const timer=setInterval(tick,15000);
    return ()=>{clearTimeout(initial);clearInterval(timer);};
  },[]);
  const [view,setView]=useState<CalendarViewMode>("day");
  const [mode,setMode]=useState<CalendarPlanMode>("actual");
  const [date,setDate]=useState(()=>startOfDay(new Date()));
  const [range,setRange]=useState(EMPTY_RANGE);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [work,setWork]=useState<ActivityCategory[]>([]);
  const [life,setLife]=useState<LifeCategoryDto[]>([]);
  const [prefs,setPrefs]=useState<CalendarPreferences>(EMPTY_PREFERENCES);
  const [editorOpen,setEditorOpen]=useState(true);
  const [reflection,setReflection]=useState(false);
  const [batch,setBatch]=useState(false);
  const [toast,setToast]=useState<CalendarToast|null>(null);
  const [toastBusy,setToastBusy]=useState(false);
  const [optimistic,setOptimistic]=useState<GridBlock|null>(null);
  const [groupCreate,setGroupCreate]=useState(false);
  const [groupSlice,setGroupSlice]=useState<string|undefined>();
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
  const groups=useVisualGroups(from,to,notify);
  const writes=useCalendarWriteQueue();
  const {leave:leaveEditor}=editor,{leave:leaveGroups}=groups,{flush:flushWrites}=writes;
  const leave=useCallback(async(proceed:()=>void)=>{await flushWrites();await leaveEditor(()=>{void leaveGroups(()=>{setGroupCreate(false);proceed();});});},[leaveEditor,leaveGroups,flushWrites]);
  useShellNavigationGuard(leave);
  const categories=useMemo(()=>calendarCategories(work,life),[work,life]);
  // This effect subscribes the visible date range to asynchronous API data.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    void Promise.all([listCategories(),listLifeCategories()]).then(([w,l])=>{setWork(w);setLife(l);}).catch(e=>setLoadError(e.message));
    // Hydrate browser-only appearance after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try {const saved=readPreferences(localStorage.getItem(PREFERENCE_KEY));setPrefs(saved);} catch { /* storage unavailable */ }
    return ()=>{if(toastTimer.current) clearTimeout(toastTimer.current);};
  },[]);
  useEffect(()=>{
    const query=new URLSearchParams(queryKey);
    const requested=query.get("date");
    // Route context restores when Global Tabs switch between Calendar targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(requested)))setDate(new Date(`${requested}T00:00:00`));
    const requestedMode=query.get("mode");
    let preferred:CalendarPlanMode="actual";try{preferred=readPreferences(localStorage.getItem(PREFERENCE_KEY)).mode ?? "actual";}catch{}
    setMode(requestedMode === "plan" || requestedMode === "compare" || requestedMode === "actual" ? requestedMode : preferred);
    setView(query.get("view") === "week" ? "week" : "day");
    setReflection(query.get("reflection") === "true");
  },[queryKey]);
  function context(next:{date?:Date;view?:CalendarViewMode;mode?:CalendarPlanMode;reflection?:boolean}){
    const query=new URLSearchParams({date:toDateKey(next.date ?? date),view:next.view ?? view,mode:next.mode ?? mode});
    if(next.reflection ?? reflection)query.set("reflection","true");
    if(next.mode)preferences({...prefs,mode:next.mode});
    router.replace(`/calendar?${query}`,{scroll:false});
  }
  function preferences(next:CalendarPreferences){setPrefs(next);try{localStorage.setItem(PREFERENCE_KEY,JSON.stringify(next));}catch{notify({message:"브라우저에서 표시 설정을 저장할 수 없습니다."});}}
  const leaveRef=useRef(leave);
  useEffect(()=>{leaveRef.current=leave;},[leave]);
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
    if(selected?.kind === kind && selected.id && (selected.unscheduled || hasValidEditorTiming(selected))) {
      blocks=blocks.filter(b=>!sameSource(b,selected));
      if(!selected.unscheduled) blocks=[...blocks,editorBlock(selected)];
    }
    if(optimistic && (optimistic.sourceType ? "actual" : "plan") === kind) blocks=blocks.map(b=>sameSource(b,optimistic) ? optimistic : b);
    return blocks.filter(b=>b.id !== editor.removingId && visible(b));
  }
  const states=useMemo(()=>{
    const map=new Map<string,CalendarStateBlockDto[]>();
    for(const state of range.stateBlocks) map.set(state.date,[...(map.get(state.date) ?? []),state]);
    const v=editor.value;
    if(v?.kind === "state" && !v.id) map.set(v.date,[...(map.get(v.date) ?? []),{id:"draft",date:v.date,stateGroup:v.stateGroup,label:v.title || "새 상태",startAt:`${v.date}T${v.start}:00`,endAt:`${v.date}T${v.end}:00`,memo:v.memo}]);
    return map;
  },[range.stateBlocks,editor.value]);
  function create(kind:"plan"|"actual"|"state",day:Date,start:number,end:number){if(kind === "state" && !observedRange(toDateKey(day),minuteTime(end))){notify({message:"미래의 상태는 기록할 수 없습니다."});return;}void leave(()=>{editor.select(newEditor(kind,toDateKey(day),start,end));setEditorOpen(true);});}
  function select(block:GridBlock){if(!editor.value || !sameSource(editor.value,block))void leave(()=>editor.select(blockEditor(block)));setEditorOpen(true);}
  function selectGroup(group:CalendarVisualGroup,slice:VisualGroupSlice){void leave(()=>{groups.select(group);setGroupSlice(slice.date);setEditorOpen(true);});}
  function createGroup(day:Date,start:number,end:number){void leave(()=>{groups.create(toDateKey(day),start,end);setGroupSlice(toDateKey(day));setEditorOpen(true);preferences({...prefs,groupVisibility:{...prefs.groupVisibility,[mode]:true}});});}
  async function changeGroup(group:CalendarVisualGroup,transform:(current:CalendarVisualGroup)=>CalendarVisualGroup){await writes.flush();void editor.leave(()=>{void writes.run(()=>groups.commitMutation(group.id,transform));});}
  async function move(block:GridBlock,start:Date,end:Date){
    await leave(()=>{void writes.run(persistMove);});
    async function persistMove(){
      const moved={...block,startAt:toLocalDateTimeString(start),endAt:toLocalDateTimeString(end)};
      setOptimistic(moved);
      try {
        if(block.sourceType) await writeActualPlacement(block.sourceType,block.id,toDateKey(start),moved.startAt.slice(11,16),moved.endAt.slice(11,16));
        else await reschedulePlannedBlock(block.id,moved.startAt,moved.endAt);
        await refresh();
      }catch(e){notify({message:e instanceof Error ? e.message : "일정을 이동하지 못했습니다."});}
      finally{setOptimistic(null);}
    }
  }
  async function schedule(item:CalendarUnscheduledActualDto,start:Date,end:Date){
    await leave(()=>{void writes.run(persist);});
    async function persist(){
      try{await writeActualPlacement(item.sourceType,item.sourceId,toDateKey(start),toLocalDateTimeString(start).slice(11,16),toLocalDateTimeString(end).slice(11,16),true);await refresh();}
      catch(e){notify({message:e instanceof Error ? e.message : "시간을 배치하지 못했습니다."});}
    }
  }
  async function unschedule(block:GridBlock,date:string){
    await leave(()=>{void writes.run(persist);});
    async function persist(){
      try{await writeActualPlacement(block.sourceType!,block.id,date,null,null);await refresh();}
      catch(e){notify({message:e instanceof Error ? e.message : "시간 미지정으로 옮기지 못했습니다."});}
    }
  }
  const workingRanges=useMemo(()=>actualWorkingRanges(range.workRecords),[range.workRecords]);
  const stateVisible=prefs.stateVisible !== false;
  const unscheduledItems=range.unscheduledActual.map(item=>{
    const selected=editor.value;
    if(selected?.kind !== "actual" || !selected.unscheduled || !sameSource(selected,{id:item.sourceId,sourceType:item.sourceType}))return item;
    return {...item,title:selected.title,durationMinutes:selected.duration,date:selected.date,activityCategoryId:selected.domainType === "WORK" ? selected.categoryId : null,lifeCategoryId:selected.domainType === "LIFE" ? selected.categoryId : null,memo:selected.memo};
  }).filter(visible);
  const groupVisible=groupsVisible(prefs,mode);
  const visualGroups=groups.value && !validateVisualGroup(groups.value) ? [...groups.groups.filter(group=>group.id !== groups.value?.id),groups.value] : groups.groups;
  const activeStart=useMemo(()=>activeDayStart([...range.planBlocks,...range.actualBlocks].map(b=>{const start=Number(b.startAt.slice(11,13))*60+Number(b.startAt.slice(14,16));return {start,end:start+(Date.parse(b.endAt)-Date.parse(b.startAt))/60000};})),[range.planBlocks,range.actualBlocks]);
  const common={days,now,colorMode:"ACTIVITY" as const,phases:[],projects:[],appearance,attendanceContext:range.attendanceContext,selectedId:editor.value?.id ?? undefined,onBlockClick:select,onBlockTimeChange:move,onInvalidDrop:(message:string)=>notify({message})};
  const syncPlanScroll=useCallback((top:number)=>{if(mode === "compare" && actualScroll.current && actualScroll.current.scrollTop !== top)actualScroll.current.scrollTop=top;},[mode]);
  const syncActualScroll=useCallback((top:number)=>{if(mode === "compare" && planScroll.current && planScroll.current.scrollTop !== top)planScroll.current.scrollTop=top;},[mode]);
  function grid(kind:"plan"|"actual",height:number){
    const selected=editor.value;
    return <TimeGrid {...common} overview={mode === "compare"} activeStart={activeStart} blocks={displayed(kind)} interactionMode={kind} draft={selected?.kind === kind && !selected.id && !selected.unscheduled && hasValidEditorTiming(selected) ? editorBlock(selected) : null} conflictBlocks={allActual} onCreateRequest={(d,s,e)=>create(kind,d,s,e)} maxHeightVh={height}
      visualGroups={groupVisible ? visualGroups : []} selectedGroupId={groups.value?.id} groupCreateMode={groupCreate} onGroupCreate={createGroup} onGroupSelect={selectGroup} onGroupChange={changeGroup}
      workingRanges={kind === "actual" ? workingRanges : undefined} unscheduledItems={kind === "actual" && mode !== "compare" ? unscheduledItems : undefined} onUnscheduledClick={item=>{void leave(()=>editor.select(unscheduledEditor(item)));setEditorOpen(true);}} onScheduleActual={schedule} onUnscheduleActual={unschedule} stateBlocksByDate={states} showWeekStateStrip={stateVisible && (mode !== "compare" || kind === "actual")}
      onStateCreate={(d,s,e)=>create("state",d,s,e)} onStateClick={s=>{if(s.id !== "draft")void leave(()=>editor.select(stateEditor(s)));setEditorOpen(true);}}
      scrollContainerRef={kind === "plan" ? planScroll : actualScroll} onScroll={kind === "plan" ? syncPlanScroll : syncActualScroll}/>;
  }
  const label=calendarDateLabel(days);
  return <div className={`calendar-shell ${editorOpen ? "" : "editor-collapsed"}`}>
    <CalendarRail groupVisible={groupVisible} onGroup={()=>preferences({...prefs,groupVisibility:{...prefs.groupVisibility,[mode]:!groupVisible}})} date={date} week={view === "week"} categories={categories} prefs={prefs} onPreferences={preferences} onDate={d=>void leave(()=>context({date:d}))} stateVisible={stateVisible} onState={()=>preferences({...prefs,stateVisible:!stateVisible})} onNavigate={href=>void leave(()=>router.push(href))}/>
    <section className="calendar-main" aria-label="Calendar">
      <CalendarToolbar viewMode={view} onViewModeChange={v=>void leave(()=>context({view:v}))} planMode={mode} onPlanModeChange={m=>void leave(()=>context({mode:m}))} onPrev={()=>void leave(()=>context({date:addDays(date,view === "day" ? -1 : -7)}))} onNext={()=>void leave(()=>context({date:addDays(date,view === "day" ? 1 : 7)}))} onToday={()=>void leave(()=>context({date:startOfDay(new Date())}))} label={label}/>
      <div className="cal-context-bar">{mode !== "compare" && <button aria-pressed={groupCreate} onClick={()=>void leave(()=>setGroupCreate(!groupCreate))}>그룹 블록{groupCreate ? " · 범위를 드래그하세요" : " +"}</button>}<span>Asia/Seoul · 입력 5분 · 드래그 15분</span><button onClick={()=>void leave(()=>context({reflection:true}))}>회고 작성 / 열기</button>{mode !== "plan" && <button onClick={()=>void leave(()=>setBatch(true))}>계획을 실행으로 가져오기</button>}{!editorOpen && <button aria-label="편집기 펼치기" onClick={()=>setEditorOpen(true)}><PanelRightOpen size={16}/></button>}</div>
      {groups.loadError && <p className="cal-error" role="alert">{groups.loadError}<button onClick={()=>void groups.refresh()}>그룹 다시 시도</button></p>}{loadError && <p className="cal-error" role="alert">{loadError}<button onClick={()=>void refresh()}>다시 시도</button></p>}
      <div className={`calendar-timelines ${view} ${mode}`}>
        {mode !== "compare" ? grid(mode,72) : <>
          <section className="cal-compare-plan"><h2>PLAN <span>계획</span></h2>{grid("plan",69)}</section>
          <section className="cal-compare-actual"><h2>ACTUAL <span>실행</span></h2>{grid("actual",69)}</section>
        </>}
      </div>
    </section>
    {editorOpen && groups.value && <VisualGroupEditor value={groups.value} focusDate={groupSlice} status={groups.status} error={groups.error} busy={groups.busy} guard={groups.guard} onChange={groups.change} onFlush={()=>void groups.flush()} onDelete={()=>void groups.remove()} onClose={()=>void leave(()=>setEditorOpen(false))} onDiscard={groups.discard} onContinue={groups.continueEditing} onRetry={()=>void groups.retry()}/>}{editorOpen && !groups.value && <CalendarEditor value={editor.value} date={dateKey} categories={categories} status={editor.status} error={editor.error} busy={editor.busy} guard={editor.guard} onChange={editor.change} onSave={()=>void editor.save(true)} onFlush={()=>void editor.save()} onDelete={()=>void editor.remove()} onClose={()=>void leave(()=>setEditorOpen(false))} onDiscard={editor.discard} onContinue={editor.continueEditing}/>}
    {toast && <div className="cal-toast" role="status">{toast.message}{toast.undo && <button disabled={toastBusy} onClick={async()=>{if(toastTimer.current)clearTimeout(toastTimer.current);setToastBusy(true);try{await toast.undo?.();setToast(null);}catch(e){notify({message:e instanceof Error ? e.message : "복원하지 못했습니다.",undo:toast.undo});}finally{setToastBusy(false);}}}>실행 취소</button>}<button aria-label="알림 닫기" onClick={()=>setToast(null)}>×</button></div>}
    <ReflectionModal categories={categories} prefs={prefs} open={reflection} date={dateKey} onClose={()=>context({reflection:false})}/>
    <BatchActualEditor open={batch} date={date} sourcePlans={range.planBlocks.filter(p=>p.startAt.slice(0,10) === dateKey)} categoryLabelFor={(domain,id)=>categories.find(c=>c.domain === domain && c.id === id)?.name ?? "카테고리 없음"} onClose={()=>setBatch(false)} onCommitted={refresh}/>
  </div>;
}
