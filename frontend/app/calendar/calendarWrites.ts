"use client";
import { useCallback,useEffect,useRef } from "react";
import { apiClient } from "@/lib/api/client";
import type { ActualSourceType } from "@/lib/api/types";
import { minuteTime,timeMinutes } from "./editorModel";

export interface ActualRecord {
  id:string;sourceType:ActualSourceType;date:string;categoryId:string|null;title:string;
  durationMinutes:number;startTime:string|null;endTime:string|null;memo:string|null;phaseId:string|null;
}
/** Read after editor flush/discard: a captured visual draft is never a source
 * record. Only timing changes; saved content and source identity survive. */
export async function writeActualPlacement(sourceType:ActualSourceType,id:string,date:string,startTime:string|null,endTime:string|null,preserveDuration=false) {
  const path=`/api/calendar/actual/${sourceType}/${id}`;
  const saved=await apiClient.get<ActualRecord>(path);
  const end=startTime && preserveDuration ? minuteTime(timeMinutes(startTime)+saved.durationMinutes) : endTime;
  return apiClient.put<ActualRecord>(path,{date,title:saved.title,categoryId:saved.categoryId,memo:saved.memo,phaseId:saved.phaseId,
    durationMinutes:startTime && end ? timeMinutes(end)-timeMinutes(startTime) : saved.durationMinutes,startTime,endTime:end});
}

/** Shared by direct grid writes and navigation, preventing late responses from
 * racing a newly selected editor. No timer or background mutation survives a leave. */
export function useCalendarWriteQueue() {
  const pending=useRef<Promise<unknown>|null>(null);
  const flush=useCallback(async()=>{while(pending.current)await pending.current;},[]);
  const run=useCallback((operation:()=>Promise<unknown>)=>{
    const next=(pending.current ?? Promise.resolve()).then(operation);
    pending.current=next;
    void next.finally(()=>{if(pending.current === next)pending.current=null;}).catch(()=>{});
    return next;
  },[]);
  useEffect(()=>{
    const guard=(event:BeforeUnloadEvent)=>{if(pending.current){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);
  },[]);
  return {run,flush};
}
