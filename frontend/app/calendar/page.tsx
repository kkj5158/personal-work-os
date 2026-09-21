"use client";
import { apiClient } from "@/lib/api/client";
import { pasteOverlapCount } from "./clipboard";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PanelRightOpen } from "lucide-react";
import { useCalendarClipboard } from "./useCalendarClipboard";
import type { CalendarRef } from "./clipboard";
import { TimeGrid } from "./TimeGrid";
import { CalendarToolbar, type CalendarPlanMode, type CalendarViewMode } from "./CalendarToolbar";
import { CalendarRail } from "./CalendarRail";
import { CalendarEditor } from "./CalendarEditor";
import { ReflectionModal } from "./ReflectionModal";
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
import { actualAllowed, futureActualMessage } from "./actualPolicy";
import { CalendarReview } from "./CalendarReview";
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
  const [mode,setMode]=useState<CalendarPlanMode>("all");
  const [date,setDate]=useState(()=>startOfDay(new Date()));
  const [range,setRange]=useState(EMPTY_RANGE);
  const [categoriesReady,setCategoriesReady]=useState(false);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [work,setWork]=useState<ActivityCategory[]>([]);
  const [life,setLife]=useState<LifeCategoryDto[]>([]);
  const [prefs,setPrefs]=useState<CalendarPreferences>(EMPTY_PREFERENCES);
  const [editorOpen,setEditorOpen]=useState(true);
  const [reflection,setReflection]=useState(false);
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
    void Promise.all([listCategories(),listLifeCategories()]).then(([w,l])=>{setWork(w);setLife(l);setCategoriesReady(true);}).catch(e=>setLoadError(e.message));
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
    const preferred:CalendarPlanMode="all";
    setMode(requestedMode === "all" || requestedMode === "plan" || requestedMode === "review" || requestedMode === "actual" ? requestedMode : requestedMode === "compare" ? "review" : preferred);
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
  const clipboard=useCalendarClipboard({leave,run:writes.run,refresh:async()=>{await Promise.all([refresh(),groups.refresh()]);},notify,ordered:[...range.planBlocks.map(b=>({kind:"PLAN" as const,id:b.id,at:b.startAt})),...range.actualBlocks.map(b=>({kind:"ACTUAL" as const,id:b.sourceId,sourceType:b.sourceType,at:b.startAt})),...range.unscheduledActual.map(b=>({kind:"ACTUAL" as const,id:b.sourceId,sourceType:b.sourceType,at:`${b.date}T23:59:59`})),...(range.unscheduledPlans ?? []).map(b=>({kind:"PLAN" as const,id:b.id,at:`${b.date}T23:59:59`}))].sort((a,b)=>a.at.localeCompare(b.at)),collisions:items=>pasteOverlapCount(items,[...range.planBlocks,...range.actualBlocks]),disabled:reflection || editor.guard || groups.guard});
  const blockRef=(block:GridBlock):CalendarRef=>({kind:block.sourceType ? "ACTUAL" : "PLAN",id:block.id,sourceType:block.sourceType});
  const unscheduledRef=(item:CalendarUnscheduledActualDto):CalendarRef=>({kind:"ACTUAL",id:item.sourceId,sourceType:item.sourceType});
  function pasteTarget(date:string,minute?:number){void leave(()=>{clipboard.clear();clipboard.setTarget({date,minute});});}
  const allActual=useMemo(()=>range.actualBlocks.map(b=>({...b,id:b.sourceId})),[range.actualBlocks]);
  function visible(block:{domainType:"WORK"|"LIFE";activityCategoryId:string|null;lifeCategoryId:string|null}){return categoriesReady && categoryVisible(block.domainType,block.domainType === "WORK" ? block.activityCategoryId : block.lifeCategoryId,categories,prefs);}
  function appearance(block:GridBlock){return categoryAppearance(block.domainType,block.domainType === "WORK" ? block.activityCategoryId : block.lifeCategoryId,categories,prefs);}
  function displayed(kind:"plan"|"actual"):GridBlock[]{
    let blocks:GridBlock[]=kind === "plan" ? range.planBlocks : allActual;
    const selected=editor.value;
    if(selected?.transitionFrom)blocks=blocks.filter(b=>!sameSource(b,selected.transitionFrom!));
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
  async function changeEditorState(kind:"plan"|"actual",targetDate?:string){const ref=await editor.changeState(kind,targetDate);if(ref && editor.isCurrent(ref.id,ref.sourceType ?? undefined))clipboard.select({...ref,sourceType:ref.sourceType ?? undefined});}
  function create(kind:"plan"|"actual"|"state",day:Date,start:number,end:number){if(kind === "actual" && !actualAllowed(toDateKey(day))){kind="plan";notify({message:futureActualMessage});}if(kind === "state" && !observedRange(toDateKey(day),minuteTime(end))){notify({message:"미래의 상태는 기록할 수 없습니다."});return;}void leave(()=>{clipboard.clear();editor.select(newEditor(kind,toDateKey(day),start,end));setEditorOpen(true);});}
  function select(block:GridBlock,additive=false,rangeSelect=false){void leave(()=>{clipboard.select(blockRef(block),additive,rangeSelect);if(!additive && !rangeSelect){editor.select(blockEditor(block));setEditorOpen(true);}});}
  function selectGroup(group:CalendarVisualGroup,slice:VisualGroupSlice,additive=false){void leave(()=>{clipboard.select({kind:"GROUP",id:group.id},additive);if(!additive){groups.select(group);setGroupSlice(slice.date);setEditorOpen(true);}});}
  function createGroup(day:Date,start:number,end:number){void leave(()=>{clipboard.clear();groups.create(toDateKey(day),start,end);setGroupSlice(toDateKey(day));setEditorOpen(true);preferences({...prefs,groupVisibility:{...prefs.groupVisibility,[mode]:true}});});}
  async function changeGroup(group:CalendarVisualGroup,transform:(current:CalendarVisualGroup)=>CalendarVisualGroup){await writes.flush();void editor.leave(()=>{void writes.run(()=>groups.commitMutation(group.id,transform));});}
  async function move(block:GridBlock,start:Date,end:Date){
    await leave(()=>{void writes.run(persistMove);});
    async function persistMove(){
      const moved={...block,startAt:toLocalDateTimeString(start),endAt:toLocalDateTimeString(end)};
      setOptimistic(moved);
      try {
        if(block.sourceType) {await writeActualPlacement(block.sourceType,block.id,toDateKey(start),moved.startAt.slice(11,16),moved.endAt.slice(11,16));if(!actualAllowed(toDateKey(start)))notify({message:futureActualMessage});}
        else await reschedulePlannedBlock(block.id,moved.startAt,moved.endAt);
        await refresh();
      }catch(e){notify({message:e instanceof Error ? e.message : "일정을 이동하지 못했습니다."});}
      finally{setOptimistic(null);}
    }
  }
  async function placePlan(plan:{id:string},date:string,start?:number,end?:number){
    await leave(()=>{void writes.run(async()=>{try {
      const [item]=await apiClient.post<import("./clipboard").ClipboardItem[]>("/api/calendar/clipboard/snapshot",[{kind:"PLAN",id:plan.id}]);
      if(item.kind!=="PLAN")return;
      const before=item.plan;
      await apiClient.put(`/api/planned-blocks/${plan.id}`,{...before,date,startAt:start===undefined ? null : `${date}T${minuteTime(start)}:00`,endAt:end===undefined ? null : `${date}T${minuteTime(end)}:00`});await refresh();
      notify({message:start===undefined ? "시간 미지정으로 이동했습니다." : "계획을 배치했습니다.",undo:async()=>{await apiClient.put(`/api/planned-blocks/${plan.id}`,before);await refresh();}});
    }catch(e){notify({message:e instanceof Error?e.message:"계획을 옮기지 못했습니다."});}});});
  }
  async function schedule(item:CalendarUnscheduledActualDto,start:Date,end:Date){
    await leave(()=>{void writes.run(persist);});
    async function persist(){
      try{await writeActualPlacement(item.sourceType,item.sourceId,toDateKey(start),toLocalDateTimeString(start).slice(11,16),toLocalDateTimeString(end).slice(11,16),true);await refresh();if(!actualAllowed(toDateKey(start)))notify({message:futureActualMessage});}
      catch(e){notify({message:e instanceof Error ? e.message : "시간을 배치하지 못했습니다."});}
    }
  }
  async function unschedule(block:GridBlock,date:string){
    await leave(()=>{void writes.run(persist);});
    async function persist(){
      try{await writeActualPlacement(block.sourceType!,block.id,date,null,null);await refresh();if(!actualAllowed(date))notify({message:futureActualMessage});}
      catch(e){notify({message:e instanceof Error ? e.message : "시간 미지정으로 옮기지 못했습니다."});}
    }
  }
  const workingRanges=useMemo(()=>actualWorkingRanges(range.workRecords),[range.workRecords]);
  const stateVisible=prefs.stateVisible !== false;
  const unscheduledItems=range.unscheduledActual.map(item=>{
    const selected=editor.value;
    if(selected?.kind !== "actual" || !selected.unscheduled || !sameSource(selected,{id:item.sourceId,sourceType:item.sourceType}))return item;
    return {...item,title:selected.title,durationMinutes:selected.duration,date:selected.date,activityCategoryId:selected.domainType === "WORK" ? selected.categoryId : null,lifeCategoryId:selected.domainType === "LIFE" ? selected.categoryId : null,memo:selected.memo};
  }).filter(item=>!editor.value?.transitionFrom || !sameSource({id:item.sourceId,sourceType:item.sourceType},editor.value.transitionFrom)).filter(visible);
  const groupVisible=groupsVisible(prefs,mode);
  const visualGroups=groups.value && !validateVisualGroup(groups.value) ? [...groups.groups.filter(group=>group.id !== groups.value?.id),groups.value] : groups.groups;
  const activeStart=useMemo(()=>activeDayStart([...range.planBlocks,...range.actualBlocks].map(b=>{const start=Number(b.startAt.slice(11,13))*60+Number(b.startAt.slice(14,16));return {start,end:start+(Date.parse(b.endAt)-Date.parse(b.startAt))/60000};})),[range.planBlocks,range.actualBlocks]);
  const common={days,now,colorMode:"ACTIVITY" as const,phases:[],projects:[],appearance,attendanceContext:range.attendanceContext,selectedId:editor.value?.id ?? undefined,isBlockSelected:(block:GridBlock)=>clipboard.isSelected(blockRef(block)),clipboardActive:!!clipboard.clipboard,onPasteTarget:pasteTarget,onBlockClick:select,onBlockTimeChange:move,onInvalidDrop:(message:string)=>notify({message})};
  function grid(kind:"all"|"plan"|"actual",height:number){
    const selected=editor.value;
    return <TimeGrid {...common} overview={false} activeStart={activeStart} blocks={kind === "all" ? [...displayed("plan"),...displayed("actual")] : displayed(kind)} interactionMode={kind === "all" ? "plan" : kind} draft={selected?.kind === kind && !selected.id && !selected.unscheduled && hasValidEditorTiming(selected) ? editorBlock(selected) : null} conflictBlocks={allActual} onCreateRequest={(d,s,e)=>create(kind === "all" ? "plan" : kind,d,s,e)} maxHeightVh={height}
      unscheduledPlans={kind !== "actual" ? (range.unscheduledPlans ?? []).filter(p=>!editor.value?.transitionFrom || !sameSource(p,editor.value.transitionFrom)).filter(visible) : undefined} onPlanPlacement={placePlan} isPlanSelected={p=>clipboard.isSelected({kind:"PLAN",id:p.id})} onUnscheduledPlanClick={(p,additive=false,range=false)=>{void leave(()=>{clipboard.select({kind:"PLAN",id:p.id},additive,range);if(!additive && !range){editor.select({...newEditor("plan",p.date,540,600),id:p.id,key:`plan:${p.id}`,title:p.title,duration:p.durationMinutes ?? 60,preferredActualSourceType:p.preferredActualSourceType,domainType:p.domainType,categoryId:p.domainType==="WORK"?p.activityCategoryId:p.lifeCategoryId,phaseId:p.phaseId,memo:p.memo ?? "",unscheduled:true});setEditorOpen(true);}});}}
      visualGroups={groupVisible ? visualGroups : []} selectedGroupId={groups.value?.id} selectedGroupIds={clipboard.selection.filter(item=>item.kind === "GROUP").map(item=>item.id)} groupCreateMode={groupCreate} onGroupCreate={createGroup} onGroupSelect={selectGroup} onGroupChange={changeGroup}
      workingRanges={kind !== "plan" ? workingRanges : undefined} unscheduledItems={kind !== "plan" ? unscheduledItems : undefined} isUnscheduledSelected={item=>clipboard.isSelected(unscheduledRef(item))} onUnscheduledClick={(item,additive=false,range=false)=>{void leave(()=>{clipboard.select(unscheduledRef(item),additive,range);if(!additive && !range){editor.select(unscheduledEditor(item));setEditorOpen(true);}});}} onScheduleActual={schedule} onUnscheduleActual={unschedule} stateBlocksByDate={states} showWeekStateStrip={stateVisible}
      onStateCreate={(d,s,e)=>create("state",d,s,e)} onStateClick={s=>{if(s.id !== "draft")void leave(()=>{clipboard.clear();editor.select(stateEditor(s));});setEditorOpen(true);}}
      scrollContainerRef={kind === "plan" ? planScroll : actualScroll}/>;
  }
  const label=calendarDateLabel(days);
  return <div className={`calendar-shell ${editorOpen ? "" : "editor-collapsed"}`}>
    <CalendarRail groupVisible={groupVisible} onGroup={()=>preferences({...prefs,groupVisibility:{...prefs.groupVisibility,[mode]:!groupVisible}})} date={date} week={view === "week"} categories={categories} prefs={prefs} onPreferences={preferences} onDate={d=>void leave(()=>{clipboard.setTarget({date:toDateKey(d)});context({date:d});})} stateVisible={stateVisible} onState={()=>preferences({...prefs,stateVisible:!stateVisible})} onNavigate={href=>void leave(()=>router.push(href))}/>
    <section className="calendar-main" aria-label="Calendar">
      <CalendarToolbar viewMode={view} onViewModeChange={v=>void leave(()=>context({view:v}))} planMode={mode} onPlanModeChange={m=>void leave(()=>context({mode:m}))} onPrev={()=>void leave(()=>context({date:addDays(date,view === "day" ? -1 : -7)}))} onNext={()=>void leave(()=>context({date:addDays(date,view === "day" ? 1 : 7)}))} onToday={()=>void leave(()=>context({date:startOfDay(new Date())}))} label={label}/>
      <div className="cal-context-bar">{mode !== "review" && <div className={`cal-group-create ${groupCreate ? "active" : ""}`}>{groupCreate ? <><strong role="status">그룹 생성 중 · 범위를 드래그하세요</strong><button onClick={()=>void leave(()=>setGroupCreate(false))}>취소</button></> : <button onClick={()=>void leave(()=>setGroupCreate(true))}>+ 그룹 만들기</button>}</div>}<span>Asia/Seoul · 입력 5분 · 드래그 15분</span><button onClick={()=>void leave(()=>context({reflection:true}))}>회고 작성 / 열기</button>{!editorOpen && <button aria-label="편집기 펼치기" onClick={()=>setEditorOpen(true)}><PanelRightOpen size={16}/></button>}</div>
      {(clipboard.selection.length>0 || clipboard.clipboard) && <div className="cal-selection-actions" aria-label="Calendar 선택 작업">
        {clipboard.selection.length>0 && <><strong>{clipboard.selection.length}개 선택</strong><button disabled={clipboard.busy} onClick={clipboard.copy}>복사</button><input aria-label="이동 대상 날짜" type="date" value={clipboard.target?.date ?? dateKey} onChange={e=>clipboard.setTarget({...clipboard.target,date:e.target.value})}/><input aria-label="이동 대상 시간" type="time" onChange={e=>{const [h,m]=e.target.value.split(":").map(Number);clipboard.setTarget({date:clipboard.target?.date ?? dateKey,minute:h*60+m});}}/><button disabled={clipboard.busy} onClick={clipboard.move}>이동</button><button disabled={clipboard.busy} onClick={clipboard.duplicate}>복제</button><button disabled={clipboard.busy} onClick={clipboard.remove}>삭제</button></>}
        {clipboard.clipboard && <><span>{clipboard.target ? `붙여넣기 위치 · ${clipboard.target.date}${clipboard.target.minute===undefined ? " · 원래 시간 유지" : ` ${minuteTime(clipboard.target.minute)}`}` : "붙여넣을 날짜/시간을 먼저 선택하세요."}</span><button disabled={clipboard.busy} onClick={clipboard.paste}>붙여넣기</button></>}
      </div>}
      {clipboard.failure && <div className="cal-clipboard-conflict" role="alert"><strong>{clipboard.failure.items.length}개 중 {clipboard.failure.result.results.filter(r=>r.error).length}개를 붙여넣을 수 없습니다. 전체 취소됨.</strong>
        {clipboard.failure.result.results.filter(r=>r.error).map(r=>{const item=clipboard.failure!.items[r.index];return <div key={r.index}>{item.kind === "ACTUAL" ? `${item.actual.title} · ${item.actual.date} ${item.actual.startTime ?? "시간 미지정"}–${item.actual.endTime ?? ""}` : ""} → {r.error}</div>;})}
        {clipboard.failure.result.results.filter(r=>r.error).every(r=>clipboard.failure!.items[r.index].kind === "ACTUAL") && <button disabled={clipboard.busy} onClick={clipboard.exclude}>충돌 항목 제외하고 붙여넣기</button>}
      </div>}
      {groups.loadError && <p className="cal-error" role="alert">{groups.loadError}<button onClick={()=>void groups.refresh()}>그룹 다시 시도</button></p>}{loadError && <p className="cal-error" role="alert">{loadError}<button onClick={()=>void refresh()}>다시 시도</button></p>}
      {mode==="review" && <CalendarReview range={range} categories={categories}/>}
      <div className={`calendar-timelines ${view} ${mode}`}>{grid(mode==="review" ? "actual" : mode,72)}</div>
    </section>
    {editorOpen && groups.value && <VisualGroupEditor value={groups.value} focusDate={groupSlice} status={groups.status} error={groups.error} busy={groups.busy} guard={groups.guard} onChange={groups.change} onFlush={()=>void groups.flush()} onDelete={()=>void groups.remove()} onClose={()=>void leave(()=>setEditorOpen(false))} onDiscard={groups.discard} onContinue={groups.continueEditing} onRetry={()=>void groups.retry()}/>}{editorOpen && !groups.value && <CalendarEditor presentationColor={editor.value ? categoryAppearance(editor.value.domainType,editor.value.categoryId,categories,prefs).body : ""} onPresetColor={(domain,id,color)=>preferences({...prefs,colors:{...prefs.colors,[`${domain}:${id ?? "uncategorized"}`]:color}})} value={editor.value} date={dateKey} categories={categories} status={editor.status} error={editor.error} busy={editor.busy} guard={editor.guard} onChange={patch=>{if(patch.date && editor.value?.kind === "actual" && !actualAllowed(patch.date))void changeEditorState("plan",patch.date);else editor.change(patch);}} onStateChange={kind=>void changeEditorState(kind)} transitioning={editor.transitioning} onSave={()=>void editor.save(true)} onFlush={()=>void editor.save()} onDelete={()=>void editor.remove()} onClose={()=>void leave(()=>setEditorOpen(false))} onDiscard={editor.discard} onContinue={editor.continueEditing}/>}
    {toast && <div className="cal-toast" role="status">{toast.message}{toast.undo && <button disabled={toastBusy} onClick={async()=>{if(toastTimer.current)clearTimeout(toastTimer.current);setToastBusy(true);try{await toast.undo?.();setToast(null);}catch(e){notify({message:e instanceof Error ? e.message : "복원하지 못했습니다.",undo:toast.undo});}finally{setToastBusy(false);}}}>실행 취소</button>}<button aria-label="알림 닫기" onClick={()=>setToast(null)}>×</button></div>}
    <ReflectionModal categories={categories} prefs={prefs} open={reflection} date={dateKey} onClose={()=>context({reflection:false})}/>
  </div>;
}
