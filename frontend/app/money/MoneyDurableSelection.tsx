"use client";
import {useEffect,useRef,useState,type SetStateAction} from 'react';
import {moneyApi as api} from '@/lib/money/model';
import {useMoneyCache} from './MoneyDataProvider';
import {useMoneyData} from './MoneyWebData';
const ROOT='/ai/classification/recommendations/selection';
type Selection={ids:string[]};
export function useDurableMoneySelection(scope:string){
 const cache=useMoneyCache(),path=ROOT+'?scope='+scope,result=useMoneyData<Selection>(path),[local,setLocal]=useState<string[]|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const desired=useRef<string[]|null>(null),running=useRef(false),pending=useRef<{requestId:string;scope:string;ids:string[]}|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function persist(){if(running.current||desired.current===null)return;running.current=true;setSaving(true);setError('');try{
  while(alive.current&&desired.current!==null){
   const command=pending.current??{requestId:crypto.randomUUID(),scope,ids:[...desired.current]};pending.current=command;
   let outcome:{status:string;result?:Selection};try{outcome=await api.put(ROOT,command);}catch{outcome=await api.get('/ai/classification/outcomes/'+command.requestId);}
   if(outcome.status!=='APPLIED'||!outcome.result)throw Error('선택 보관을 확인하지 못했습니다. 현재 선택은 유지했습니다.');
   if(!alive.current)return;pending.current=null;cache.update<Selection>(path,()=>outcome.result!);
   if(JSON.stringify(desired.current)===JSON.stringify(command.ids)){setLocal(outcome.result.ids);desired.current=null;break;}
  }
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'선택 보관 확인 실패');}finally{running.current=false;if(alive.current)setSaving(false);}}
 function update(action:SetStateAction<string[]>){const current=desired.current??local??result.data?.ids??[];const next=typeof action==='function'?action(current):action;desired.current=[...new Set(next)];setLocal(desired.current);void persist();}
 return {selected:local??result.data?.ids??[],setSelected:update,error:error||result.error,loading:result.loading,saving,retry:()=>void persist()};
}
