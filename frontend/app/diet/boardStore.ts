"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {apiClient} from "@/lib/api/client";
import {useShellNavigationGuard} from "@/components/GlobalTabs";

export type Section={id:string;title:string;description:string;sortOrder:number};
export type Column={id:string;sectionId:string;title:string;sortOrder:number};
export type Block={id:string;columnId:string;type:"IMAGE"|"TEXT";mediaId:string|null;text:string|null;sortOrder:number};
export type Identity={id:string;title:string;body:string;sortOrder:number};
export type Board={sections:Section[];columns:Column[];blocks:Block[];identities:Identity[]};
export type Kind=keyof Board;
export const boardBase="/api/diet/board";
export function useBoard(){
 const [data,setData]=useState<Board>({sections:[],columns:[],blocks:[],identities:[]}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const saving=useRef(false);
 const reload=useCallback(async()=>{try{setData(await apiClient.get<Board>(boardBase));setError("");}catch(e){setError(e instanceof Error?e.message:"불러오지 못했습니다.");}finally{setLoading(false);}},[]);
 useEffect(()=>{let live=true;apiClient.get<Board>(boardBase).then(value=>{if(live)setData(value);}).catch(e=>{if(live)setError(e instanceof Error?e.message:"불러오지 못했습니다.");}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
 useShellNavigationGuard(proceed=>{if(!saving.current)proceed();});
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(saving.current)e.preventDefault();};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[]);
 const mutate=async(operation:()=>Promise<unknown>)=>{
  if(saving.current)return false;saving.current=true;setBusy(true);setError("");
  try{await operation();setData(await apiClient.get<Board>(boardBase));return true;}
  catch(e){setError(e instanceof Error?e.message:"저장하지 못했습니다. 다시 시도하세요.");return false;}
  finally{saving.current=false;setBusy(false);}
 };
 return {data,loading,busy,error,reload,mutate};
}
