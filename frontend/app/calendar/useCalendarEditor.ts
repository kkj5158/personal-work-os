"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { createPlannedBlock, deletePlannedBlock, updatePlannedBlock } from "@/lib/api/plannedBlocks";
import { createLifeStateEntry, deleteLifeStateEntry, updateLifeStateEntry } from "@/lib/api/lifeStateEntries";
import { editorDateTime, timeMinutes, validateEditor, type CalendarEditorValue } from "./editorModel";

export function planInput(v: CalendarEditorValue) {
  return {domainType:v.domainType,title:v.title.trim(),startAt:editorDateTime(v.date,v.start),endAt:editorDateTime(v.date,v.end),activityCategoryId:v.domainType === "WORK" ? v.categoryId : null,lifeCategoryId:v.domainType === "LIFE" ? v.categoryId : null,phaseId:v.phaseId,memo:v.memo || null};
}
export function actualInput(v: CalendarEditorValue) {
  return {date:v.date,categoryId:v.categoryId,title:v.title.trim(),durationMinutes:v.unscheduled ? v.duration : timeMinutes(v.end)-timeMinutes(v.start),startTime:v.unscheduled ? null : v.start,endTime:v.unscheduled ? null : v.end,memo:v.memo || null,phaseId:v.phaseId};
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
  const [status,setStatus] = useState("");
  const [error,setError] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [guard,setGuard] = useState(false);
  const [removingId,setRemovingId] = useState<string|null>(null);
  const pendingLeave = useRef<(()=>void)|null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const writer = useRef<Promise<boolean>|null>(null);
  const refreshRef = useRef(refresh);
  const notifyRef = useRef(notify);
  useEffect(()=>{refreshRef.current=refresh;notifyRef.current=notify;},[refresh,notify]);
  const assign = useCallback((v:CalendarEditorValue|null) => { current.current = v; setValue(v); },[]);
  const cancelTimer = useCallback(() => { if(timer.current) clearTimeout(timer.current); timer.current=null; },[]);

  const save = useCallback(async (explicit=false):Promise<boolean> => {
    cancelTimer();
    if(writer.current) { const ok=await writer.current; if(!ok) return false; }
    const initial=current.current;
    if(!initial || (!initial.dirty && initial.id)) return true;
    if(initial.kind !== "plan" && !explicit) return true;
    if(initial.kind === "plan" && !initial.id && !initial.title.trim()) return true;
    const operation = async () => {
      setBusy(true);
      try {
        // Keep draining newer edits to this selection before allowing navigation.
        while(current.current?.key === initial.key) {
          const snapshot=current.current;
          if(!snapshot.dirty && snapshot.id) break;
          const validation=validateEditor(snapshot);
          if(validation) throw new Error(validation);
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
          await refreshRef.current();
          if(snapshot.kind !== "plan") break;
        }
        setStatus(current.current?.dirty ? "변경사항 있음" : "저장됨"); return true;
      } catch(e) {
        const message=e instanceof Error ? e.message : "저장하지 못했습니다. 입력은 유지됩니다.";
        setError(message); setStatus("저장 실패"); return false;
      } finally { setBusy(false); }
    };
    writer.current=operation();
    const result=await writer.current;
    writer.current=null;
    return result;
  },[assign,cancelTimer]);

  const change = useCallback((patch:Partial<CalendarEditorValue>) => {
    const old=current.current; if(!old) return;
    const next={...old,...patch,dirty:true}; assign(next); setError(null); setStatus("");
    if(next.kind === "plan") {
      cancelTimer();
      // First valid title creates immediately, later fields are debounced.
      if(!next.id && next.title.trim()) void save();
      else if(next.id) timer.current=setTimeout(() => { void save(); },550);
    }
  },[assign,cancelTimer,save]);

  const leave = useCallback(async (action:()=>void) => {
    if(current.current?.kind !== "plan" && current.current?.dirty) {
      pendingLeave.current=action; setGuard(true); return;
    }
    if(!await save()) return;
    cancelTimer(); assign(null); setError(null); setStatus(""); action();
  },[assign,cancelTimer,save]);
  const select=useCallback((next:CalendarEditorValue) => { void leave(() => { assign(next); setError(null); setStatus(""); }); },[assign,leave]);
  const discard=useCallback(() => { cancelTimer(); assign(null); setError(null);setStatus("");setGuard(false); const action=pendingLeave.current;pendingLeave.current=null;action?.(); },[assign,cancelTimer]);
  const continueEditing=useCallback(() => { setGuard(false);pendingLeave.current=null; },[]);

  async function remove() {
    if(!await save()) return;
    const old=current.current; if(!old?.id) return;
    assign(null); setRemovingId(old.id); setBusy(true);
    try {
      let undo:()=>Promise<void>;
      if(old.kind === "plan") {
        await deletePlannedBlock(old.id);
        undo=async () => { await createPlannedBlock(planInput(old)); };
      } else if(old.kind === "state") {
        await deleteLifeStateEntry(old.id);
        undo=async () => { await createLifeStateEntry(stateInput(old)); };
      } else {
        const result=await apiClient.delete<{undoToken:string}>(`/api/calendar/actual/${old.sourceType}/${old.id}`);
        undo=async () => { await apiClient.post(`/api/calendar/actual/undo/${result.undoToken}`,{}); };
      }
      await refreshRef.current();
      notifyRef.current({message:"삭제했습니다.",undo:async () => { await undo(); await refreshRef.current(); }});
    } catch(e) {
      assign(old); setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    } finally {setBusy(false);setRemovingId(null);}
  }
  useEffect(() => () => { cancelTimer(); },[cancelTimer]);
  return {value,status,error,busy,guard,removingId,change,save,leave,select,discard,continueEditing,remove,assign};
}
