"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckPersistence, checkKey } from "@/lib/diet/checkPersistence";
import { apiClient } from "@/lib/api/client";
import type { DietData, DietStore, EntityMap, DailyRecord, DailyCheck, DietSettings } from "@/lib/diet/types";
export const emptyData:DietData={days:[],checks:[],items:[],challenges:[],goals:[],milestones:[],settings:{}};
export function useDietStore():DietStore & {loading:boolean;reload:()=>Promise<void>} {
 const [data,setData]=useState<DietData>(emptyData),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[pendingChecks,setPendingChecks]=useState(0);
 const [checkPersistence]=useState(()=>new CheckPersistence(
   check=>apiClient.put(`/api/diet/checks/${check.date}/${check.itemId}`,check),
   check=>setData(d=>({...d,checks:[...d.checks.filter(r=>checkKey(r)!==checkKey(check)),check]})),
   setError, setPendingChecks,
 ));
 const readRemote=useCallback(async()=>{const checkpoint=checkPersistence.checkpoint();const remote=await apiClient.get<DietData>("/api/diet");return {...remote,checks:checkPersistence.overlay(remote.checks,checkpoint)};},[checkPersistence]);
 const queue=useRef<Promise<void>>(Promise.resolve());
 const reload=useCallback(async()=>{try{setData(await readRemote());setError("");}catch(e){setError(e instanceof Error?e.message:"불러오지 못했습니다.");}finally{setLoading(false);}},[readRemote]);
 useEffect(()=>{let live=true;readRemote().then(value=>{if(live)setData(value);}).catch(e=>{if(live)setError(e instanceof Error?e.message:"불러오지 못했습니다.");}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[readRemote]);
 const mutate=useCallback((operation:()=>Promise<void>)=>{setBusy(true);const result=queue.current.catch(()=>{}).then(async()=>{setError("");try{await operation();}catch(e){setError(e instanceof Error?e.message:"저장하지 못했습니다. 다시 시도하세요.");throw e;}});queue.current=result;void result.finally(()=>{if(queue.current===result)setBusy(false);}).catch(()=>{});return result;},[]);
 const save= <K extends keyof EntityMap>(kind:K,value:EntityMap[K])=>mutate(async()=>{await apiClient.put(`/api/diet/${kind}/${value.id}`,value);if(kind==="challenges"||kind==="goals")setData(await readRemote());else setData(d=>({...d,[kind]:[...d[kind].filter(r=>r.id!==value.id),value]}));});
 const remove=(kind:keyof EntityMap,id:string)=>mutate(async()=>{await apiClient.delete(`/api/diet/${kind}/${id}`);if(kind==="items")setData(d=>({...d,items:d.items.map(i=>i.id===id?{...i,active:false}:i)}));else setData(await readRemote());});
 const saveDay=(day:DailyRecord)=>mutate(async()=>{await apiClient.put(`/api/diet/days/${day.date}`,day);setData(d=>({...d,days:[...d.days.filter(r=>r.date!==day.date),day]}));});
 const saveCheck=(check:DailyCheck)=>{setError("");return checkPersistence.save(check,data.checks.find(r=>checkKey(r)===checkKey(check)));};
 const saveSettings=(settings:DietSettings)=>mutate(async()=>{await apiClient.put("/api/diet/settings",settings);setData(d=>({...d,settings}));});
 const reorder=(kind:"items"|"challenges",ids:string[])=>mutate(async()=>{await apiClient.put(`/api/diet/${kind}/order`,{ids});setData(await readRemote());});
 const reorderHome=(type:"WEIGHT"|"CHECKLIST",ids:string[])=>mutate(async()=>{await apiClient.put("/api/diet/challenges/home-order",{type,ids});setData(await readRemote());});
 return {data,loading,busy,pendingChecks,error,save,remove,saveDay,saveCheck,saveSettings,reorder,reorderHome,reload};
}
