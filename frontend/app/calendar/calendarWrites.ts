"use client";
import { useCallback,useEffect,useRef } from "react";
import { apiClient } from "@/lib/api/client";
import type { ActualSourceType } from "@/lib/api/types";
import { minuteTime,timeMinutes } from "./editorModel";
import { actualAllowed } from "./actualPolicy";

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
  const oldSpan=saved.startTime && saved.endTime ? timeMinutes(saved.endTime.slice(0,5))-timeMinutes(saved.startTime.slice(0,5)) : null;
  const newSpan=startTime && end ? timeMinutes(end)-timeMinutes(startTime) : null;
  const durationMinutes=newSpan !== null && newSpan !== oldSpan ? newSpan : saved.durationMinutes;
  if(!actualAllowed(date))return apiClient.post<{kind:"PLAN";id:string}>("/api/calendar/state",{kind:"ACTUAL",id,sourceType,targetState:"PLAN",plan:{durationMinutes,preferredActualSourceType:sourceType,date,title:saved.title,domainType:sourceType === "LIFE_TIME_ENTRY" ? "LIFE" : "WORK",activityCategoryId:sourceType === "LIFE_TIME_ENTRY" ? null : saved.categoryId,lifeCategoryId:sourceType === "LIFE_TIME_ENTRY" ? saved.categoryId : null,phaseId:saved.phaseId,memo:saved.memo,startAt:startTime ? `${date}T${startTime}:00` : null,endAt:end ? `${date}T${end}:00` : null}});
  return apiClient.put<ActualRecord>(path,{date,title:saved.title,categoryId:saved.categoryId,memo:saved.memo,phaseId:saved.phaseId,
    durationMinutes,startTime,endTime:end});
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
