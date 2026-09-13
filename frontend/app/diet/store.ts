"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { DietData, DietStore, EntityMap, DailyRecord, DailyCheck, DietSettings } from "@/lib/diet/types";
export const emptyData:DietData={days:[],checks:[],items:[],challenges:[],goals:[],milestones:[],settings:{}};
export function useDietStore():DietStore & {loading:boolean;reload:()=>Promise<void>} {
 const [data,setData]=useState<DietData>(emptyData),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const queue=useRef<Promise<void>>(Promise.resolve());
 const reload=useCallback(async()=>{try{setData(await apiClient.get<DietData>("/api/diet"));setError("");}catch(e){setError(e instanceof Error?e.message:"불러오지 못했습니다.");}finally{setLoading(false);}},[]);
 useEffect(()=>{let live=true;apiClient.get<DietData>("/api/diet").then(value=>{if(live)setData(value);}).catch(e=>{if(live)setError(e instanceof Error?e.message:"불러오지 못했습니다.");}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
 const mutate=useCallback((operation:()=>Promise<void>)=>{setBusy(true);const result=queue.current.catch(()=>{}).then(async()=>{setError("");try{await operation();}catch(e){setError(e instanceof Error?e.message:"저장하지 못했습니다. 다시 시도하세요.");throw e;}});queue.current=result;void result.finally(()=>{if(queue.current===result)setBusy(false);}).catch(()=>{});return result;},[]);
 const save= <K extends keyof EntityMap>(kind:K,value:EntityMap[K])=>mutate(async()=>{await apiClient.put(`/api/diet/${kind}/${value.id}`,value);if(kind==="challenges"||kind==="goals")setData(await apiClient.get<DietData>("/api/diet"));else setData(d=>({...d,[kind]:[...d[kind].filter(r=>r.id!==value.id),value]}));});
 const remove=(kind:keyof EntityMap,id:string)=>mutate(async()=>{await apiClient.delete(`/api/diet/${kind}/${id}`);setData(await apiClient.get<DietData>("/api/diet"));});
 const saveDay=(day:DailyRecord)=>mutate(async()=>{await apiClient.put(`/api/diet/days/${day.date}`,day);setData(d=>({...d,days:[...d.days.filter(r=>r.date!==day.date),day]}));});
 const saveCheck=(check:DailyCheck)=>mutate(async()=>{await apiClient.put(`/api/diet/checks/${check.date}/${check.itemId}`,check);setData(d=>({...d,checks:[...d.checks.filter(r=>!(r.date===check.date&&r.itemId===check.itemId)),check]}));});
 const saveSettings=(settings:DietSettings)=>mutate(async()=>{await apiClient.put("/api/diet/settings",settings);setData(d=>({...d,settings}));});
 const reorder=(kind:"items"|"challenges",ids:string[])=>mutate(async()=>{await apiClient.put(`/api/diet/${kind}/order`,{ids});setData(await apiClient.get<DietData>("/api/diet"));});
 return {data,loading,busy,error,save,remove,saveDay,saveCheck,saveSettings,reorder,reload};
}
