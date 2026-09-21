"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { createPlannedBlock, updatePlannedBlock } from "@/lib/api/plannedBlocks";
import { createLifeStateEntry, deleteLifeStateEntry, updateLifeStateEntry } from "@/lib/api/lifeStateEntries";
import { rememberTitle, rememberQuickBlock } from "./creationPresets";
import { actualAllowed, futureActualMessage } from "./actualPolicy";
import { editorDateTime, hasValidEditorTiming, meaningfulEditorDraft, timeMinutes, validateEditor, type CalendarEditorValue } from "./editorModel";

export function planInput(v: CalendarEditorValue) {
  return {durationMinutes:v.duration,preferredActualSourceType:v.preferredActualSourceType ?? null,domainType:v.domainType,title:v.title.trim(),date:v.date,startAt:v.unscheduled ? null : editorDateTime(v.date,v.start),endAt:v.unscheduled ? null : editorDateTime(v.date,v.end),activityCategoryId:v.domainType === "WORK" ? v.categoryId : null,lifeCategoryId:v.domainType === "LIFE" ? v.categoryId : null,phaseId:v.phaseId,memo:v.memo || null};
}
export function actualInput(v: CalendarEditorValue) {
  return {date:v.date,categoryId:v.categoryId,title:v.title.trim(),durationMinutes:v.duration,startTime:v.unscheduled ? null : v.originalStartAt?.slice(11,16)===v.start ? v.originalStartAt.slice(11) : v.start,endTime:v.unscheduled ? null : v.originalEndAt?.slice(11,16)===v.end ? v.originalEndAt.slice(11) : v.end,memo:v.memo || null,phaseId:v.phaseId};
}
function stateInput(v: CalendarEditorValue) {
  return {entryDate:v.date,stateGroup:v.stateGroup,label:v.title.trim(),startTime:v.start,endTime:v.end,memo:v.memo || null};
}
export interface CalendarToast { message:string; undo?:()=>Promise<void> }

/** A single serialized writer keeps first-title creation and subsequent edits
 * ordered even when a user types, blurs and changes selection during a request. */
export function useCalendarEditor(refresh:()=>Promise<void>, notify:(toast:CalendarToast)=>void) {
  const [value, setValue] = useState<CalendarEditorValue|null>(null);
  const current = useRef(value);
  const baseline = useRef(value);
  const remembered=useRef("");
  const [status,setStatus] = useState("");
  const [error,setError] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [transitioning,setTransitioning] = useState(false);
  const transitionLock=useRef(false);
  const [guard,setGuard] = useState(false);
  const [removingId,setRemovingId] = useState<string|null>(null);
  const failed = useRef(false);
  const pendingLeave = useRef<(()=>void)|null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const writer = useRef<Promise<boolean>|null>(null);
  const refreshRef = useRef(refresh);
  const notifyRef = useRef(notify);
  useEffect(()=>{refreshRef.current=refresh;notifyRef.current=notify;},[refresh,notify]);
  const assign = useCallback((v:CalendarEditorValue|null) => {
    if(!v || v.key !== current.current?.key || !v.dirty) baseline.current=v;
    current.current = v; setValue(v);
  },[]);
  const hasMeaningfulDraft = useCallback(() => {
    const draft=current.current, original=baseline.current;
    if(meaningfulEditorDraft(draft)) return true;
    return !!draft?.dirty && !!original && ["date","start","end","duration","unscheduled"].some(key => draft[key as keyof CalendarEditorValue] !== original[key as keyof CalendarEditorValue]);
  },[]);
  const cancelTimer = useCallback(() => { if(timer.current) clearTimeout(timer.current); timer.current=null; },[]);

  const save = useCallback(async (explicit=false):Promise<boolean> => {
    cancelTimer();
    while(writer.current) { const ok=await writer.current; if(!ok) return false; }
    const initial=current.current;
    if(!initial || (!initial.dirty && initial.id)) return true;
    if(!initial.dirty && !(initial.kind === "state" && explicit)) return true;
    const validation = validateEditor(initial);
    if(validation) { if(explicit) setError(validation); setStatus("입력 중"); return false; }
    const operation = async () => {
      setBusy(true);
      try {
        // Keep draining newer edits to this selection before allowing navigation.
        while(current.current?.key === initial.key) {
          const snapshot=current.current;
          if(!snapshot.dirty && snapshot.id) break;
          const validation=validateEditor(snapshot);
          if(validation) { setStatus("입력 중"); return false; }
          setStatus("저장 중…"); setError(null);
          let id=snapshot.id;
          let sourceType=snapshot.sourceType;
          if(snapshot.kind === "plan") {
            const result=id ? await updatePlannedBlock(id,planInput(snapshot)) : await createPlannedBlock(planInput(snapshot));
            id=result.id;
          } else if(snapshot.kind === "state") {
            const result=id ? await updateLifeStateEntry(id,stateInput(snapshot)) : await createLifeStateEntry(stateInput(snapshot));
            id=result.id;
          } else {
            sourceType=snapshot.domainType === "LIFE" ? "LIFE_TIME_ENTRY" : sourceType ?? "WORK_TIME_ENTRY";
            const path=`/api/calendar/actual/${sourceType}${id ? `/${id}` : ""}`;
            const result=id ? await apiClient.put<{id:string}>(path,actualInput(snapshot)) : await apiClient.post<{id:string}>(path,actualInput(snapshot));
            id=result.id;
          }
          const latest=current.current;
          if(latest?.key === snapshot.key) assign({...latest,id,sourceType,dirty:latest !== snapshot});
          if(snapshot.kind!=="state") rememberQuickBlock(snapshot);
          if(snapshot.kind!=="state" && remembered.current!==`${id}:${snapshot.title}`){rememberTitle(snapshot.title);remembered.current=`${id}:${snapshot.title}`;}
          failed.current=false;
          try { await refreshRef.current(); }
          catch { notifyRef.current({message:"저장되었지만 Calendar를 새로고침하지 못했습니다."}); }
        }
        setStatus(current.current?.dirty ? "변경사항 있음" : "저장됨"); return true;
      } catch(e) {
        const message=e instanceof Error ? e.message : "저장하지 못했습니다. 입력은 유지됩니다.";
        failed.current=true; setError(message); setStatus("저장 실패"); return false;
      } finally { setBusy(false); }
    };
    writer.current=operation();
    const result=await writer.current;
    writer.current=null;
    return result;
  },[assign,cancelTimer]);

  const change = useCallback((patch:Partial<CalendarEditorValue>) => {
    const old=current.current; if(!old) return;
    // An Actual's source identity cannot change after its first request starts.
    const safePatch={...patch};
    if(old.kind === "actual" && (old.id || writer.current)) {
      delete safePatch.domainType; delete safePatch.sourceType;
    }
    if(safePatch.domainType && safePatch.domainType !== old.domainType) {
      safePatch.categoryId=patch.categoryId ?? null;
      safePatch.phaseId=null;
      if(old.kind === "actual") safePatch.sourceType=safePatch.domainType === "LIFE" ? "LIFE_TIME_ENTRY" : "WORK_TIME_ENTRY";
    }
    if((safePatch.kind ?? old.kind) !== "actual") safePatch.sourceType=undefined;
    const next={...old,...safePatch,dirty:true};
    if(next.kind !== "state" && hasValidEditorTiming(next) && (safePatch.start !== undefined || safePatch.end !== undefined || safePatch.unscheduled === false)) next.duration=timeMinutes(next.end)-timeMinutes(next.start);
    assign(next); failed.current=false; setError(null); setStatus("");
    cancelTimer();
    {
      // Invalid intermediate fields stay local and never enter the writer.
      if(validateEditor(next)) { setStatus("입력 중"); return; }
      if(!next.id) void save();
      else timer.current=setTimeout(() => { void save(); },550);
    }
  },[assign,cancelTimer,save]);

  async function changeState(kind:"plan"|"actual",targetDate?:string) {
    cancelTimer();
    const initial=current.current;
    if(!initial || initial.kind === "state" || initial.kind === kind || transitionLock.current)return;
    if(kind === "actual" && !actualAllowed(initial.date)){setError(futureActualMessage);return;}
    if(!initial.id){change({kind,...(targetDate ? {date:targetDate} : {}),sourceType:kind === "actual" ? initial.domainType === "LIFE" ? "LIFE_TIME_ENTRY" : "WORK_TIME_ENTRY" : undefined});return;}
    transitionLock.current=true;
    if(!await save(true)){transitionLock.current=false;return;}
    const before=current.current!;
    const next={...before,kind,date:targetDate ?? before.date,sourceType:kind === "actual" ? before.domainType === "LIFE" ? "LIFE_TIME_ENTRY" as const : before.preferredActualSourceType ?? "WORK_TIME_ENTRY" as const : undefined,dirty:false,transitionFrom:{id:before.id!,sourceType:before.sourceType}};
    const validation=kind === "actual" ? validateEditor(next) : null;if(validation){setError(validation);transitionLock.current=false;return;}
    setTransitioning(true);setBusy(true);setStatus("저장 중…");assign(next);
    let converted:{kind:"PLAN"|"ACTUAL";id:string;sourceType?:CalendarEditorValue["sourceType"]}|undefined;
    const operation=async()=>{
      try {
        const result=await apiClient.post<{kind:"PLAN"|"ACTUAL";id:string;sourceType?:CalendarEditorValue["sourceType"]}>("/api/calendar/state",{kind:before.kind.toUpperCase(),id:before.id,sourceType:before.sourceType,targetState:kind.toUpperCase(),...(targetDate ? {plan:planInput(next)} : {})});
        converted=result;
        assign({...next,id:result.id,sourceType:result.sourceType ?? undefined,preferredActualSourceType:kind === "plan" ? before.sourceType : before.preferredActualSourceType});
        try{await refreshRef.current();}catch{notifyRef.current({message:"저장되었지만 Calendar를 새로고침하지 못했습니다."});}
        if(current.current?.key===next.key)assign({...current.current,transitionFrom:undefined});
        if(targetDate)notifyRef.current({message:futureActualMessage});
        setStatus("저장됨");setError(null);return true;
      } catch(e){assign(before);setStatus("변경 실패");setError(e instanceof Error ? e.message : "상태를 변경하지 못했습니다.");return false;}
      finally{transitionLock.current=false;setTransitioning(false);setBusy(false);}
    };
    writer.current=operation();await writer.current;writer.current=null;return converted;
  }

  const leave = useCallback(async (action:()=>void) => {
    const draft=current.current;
    const validation=draft ? validateEditor(draft) : null;
    if(hasMeaningfulDraft() && (failed.current || validation)) {
      if(validation) setError(validation);
      cancelTimer(); pendingLeave.current=action; setGuard(true); return;
    }
    if(hasMeaningfulDraft() || writer.current) {
      if(!await save()) { pendingLeave.current=action; setGuard(true); return; }
    }
    cancelTimer(); assign(null); failed.current=false; setError(null); setStatus(""); action();
  },[assign,cancelTimer,hasMeaningfulDraft,save]);
  const select=useCallback((next:CalendarEditorValue) => { void leave(() => { assign(next.kind === "state" && !next.id ? {...next,dirty:true} : next); setError(null); setStatus(""); if(next.kind === "state" && !next.id)void save(); }); },[assign,leave,save]);
  const discard=useCallback(() => { cancelTimer(); assign(null); failed.current=false; setError(null);setStatus("");setGuard(false); const action=pendingLeave.current;pendingLeave.current=null;action?.(); },[assign,cancelTimer]);
  const continueEditing=useCallback(() => { setGuard(false);pendingLeave.current=null; },[]);

  async function remove() {
    cancelTimer();
    // Deleting an Actual discards local edits; do not POST invalid intermediate
    // fields just to delete the existing source. Finish any request already sent.
    if(current.current?.kind === "plan") { if(!await save()) return; }
    else if(writer.current) await writer.current;
    cancelTimer();
    const old=current.current; if(!old?.id) return;
    assign(null); setRemovingId(old.id); setBusy(true);
    try {
      let undo:()=>Promise<void>;
      if(old.kind === "plan") {
        const result=await apiClient.post<{undoToken:string}>("/api/calendar/clipboard/delete",[{kind:"PLAN",id:old.id}]);
        undo=async()=>{await apiClient.post(`/api/calendar/clipboard/undo/${result.undoToken}`,{});};
      } else if(old.kind === "state") {
        await deleteLifeStateEntry(old.id);
        undo=async () => { await createLifeStateEntry(stateInput(old)); };
      } else {
        const result=await apiClient.post<{undoToken:string}>("/api/calendar/clipboard/delete",[{kind:"ACTUAL",id:old.id,sourceType:old.sourceType}]);
        undo=async () => { await apiClient.post(`/api/calendar/clipboard/undo/${result.undoToken}`,{}); };
      }
      await refreshRef.current();
      notifyRef.current({message:"삭제했습니다.",undo:async () => { await undo(); await refreshRef.current(); }});
    } catch(e) {
      assign(old); setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    } finally {setBusy(false);setRemovingId(null);}
  }
  useEffect(() => {
    const beforeUnload=(event:BeforeUnloadEvent) => {
      if(hasMeaningfulDraft() || writer.current) { event.preventDefault(); event.returnValue=""; }
    };
    window.addEventListener("beforeunload",beforeUnload);
    return () => { cancelTimer(); window.removeEventListener("beforeunload",beforeUnload); };
  },[cancelTimer,hasMeaningfulDraft]);
  return {value,status,error,busy,transitioning,guard,removingId,change,changeState,save,leave,select,discard,continueEditing,remove,assign};
}
