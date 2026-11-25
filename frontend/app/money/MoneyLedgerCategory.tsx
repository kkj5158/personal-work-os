"use client";

import {useEffect,useRef} from 'react';
import type {BookRow} from './MoneyWebData';
import {ApiError} from '@/lib/api/client';
import {ACCOUNT_LEDGER,type LedgerRow} from '@/lib/money/accountLedger';
import {activeCategories,baseDirection,type BaseDirection} from '@/lib/money/categorySemantics';
import {moneyApi as api,type Category} from '@/lib/money/model';
import {UNIFIED,type UnifiedOutcome} from '@/lib/money/unified';
import {CategoryPicker} from './MoneyCategoryPicker';
import {useMoneyCache,useMoneyViewState} from './MoneyDataProvider';
import {relationLabel} from './MoneyLedgerFinancialType';

type CategoryCommand={
 requestId:string;
 expectedVersion:number;
 fingerprint:string;
 categoryId:string;
 expectedClassificationVersion:number;
 thisTransactionOnly:true;
 baseDirection:BaseDirection;
 semanticPolicyVersion?:number;
};
type PendingCategory={id:string;command:CategoryCommand};
type CategoryChange={
 categoryId:string;
 phase:'saving'|'saved'|'unknown'|'conflict'|'failed';
 command?:CategoryCommand;
 receipt?:LedgerRow;
 previousCategoryId?:string;
 message?:string;
};

function pendingRequests(owner:string):PendingCategory[]{
 try{
  const values=JSON.parse(window.sessionStorage.getItem(storageKey(owner))??'[]');
  return Array.isArray(values)?values.filter(item=>typeof item?.id==='string'
   && /^[\w-]+$/.test(item.id) && typeof item.command?.requestId==='string'
   && typeof item.command?.fingerprint==='string' && typeof item.command?.categoryId==='string'
   && Number.isSafeInteger(item.command?.expectedVersion) && Number.isSafeInteger(item.command?.expectedClassificationVersion)):[];
 }catch{return [];}
}
function storageKey(owner:string){return 'ledger-inline-category-requests:'+owner;}
function remember(owner:string,id:string,command?:CategoryCommand){
 try{
  const entries=pendingRequests(owner).filter(item=>item.id!==id);
  if(command)entries.push({id,command});
  if(entries.length)window.sessionStorage.setItem(storageKey(owner),JSON.stringify(entries));
  else window.sessionStorage.removeItem(storageKey(owner));
 }catch{/* View state still retains the request when browser storage is unavailable. */}
}

export function ledgerClassificationVersion(row:LedgerRow){return row.classificationVersion??row.book?.classificationVersion??0;}
function savedCategory(row:LedgerRow){return row.semanticCategoryId??row.book?.categoryId??'';}

export function useLedgerCategories(){
 const cache=useMoneyCache(),owner=cache.preferenceOwner;
 const [entries,setEntries]=useMoneyViewState<Record<string,CategoryChange>>('ledger-inline-category-changes',()=>({}));
 const active=useRef(new Set<string>()),restored=useRef<string|null>(null);
 useEffect(()=>{
  if(!owner||restored.current===owner)return;
  restored.current=owner;
  const pending=pendingRequests(owner);
  if(!pending.length)return;
  setEntries(current=>{
   const next={...current};
   for(const {id,command} of pending)next[id]??={categoryId:command.categoryId,phase:'unknown',command};
   return next;
  });
 },[owner,setEntries]);

 function put(id:string,entry:CategoryChange){setEntries(current=>({...current,[id]:entry}));}
 function refresh(){cache.mutate('transaction');cache.mutate('book');}
 async function write(id:string,categoryId:string,prepare:()=>Promise<CategoryCommand>,recover=false,previousCategoryId?:string){
  if(!owner||active.current.has(id))return;
  active.current.add(id);
  put(id,{categoryId,phase:'saving'});
  let command:CategoryCommand|undefined;
  try{
   const prepared=await prepare();
   command=prepared;
   remember(owner,id,prepared);
   const lookup=()=>api.get<UnifiedOutcome>(UNIFIED+'/outcomes/'+prepared.requestId,owner);
   let outcome:UnifiedOutcome=recover?await lookup():{status:'UNKNOWN'};
   if(outcome.status==='UNKNOWN'){
    try{outcome=await api.post<UnifiedOutcome>(ACCOUNT_LEDGER+'/rows/'+id+'/category',command,owner);}
    catch{outcome=await lookup();}
   }
   if(outcome.status==='NOT_APPLIED'){
    const conflict=outcome.result?.reason==='VERSION_CONFLICT';
    remember(owner,id);
    put(id,{categoryId,phase:conflict?'conflict':'failed',message:outcome.result?.message??'카테고리를 저장하지 못했습니다.'});
    if(conflict)refresh();
    return;
   }
   const receipt=outcome.result?.row as LedgerRow|undefined;
   if(outcome.status!=='APPLIED'||receipt?.id!==id)throw Error('저장 결과를 아직 확인하지 못했습니다.');
   remember(owner,id);
   put(id,{categoryId,phase:'saved',receipt,previousCategoryId});
   refresh();
   return receipt;
  }catch(error){
   const conflict=!command&&error instanceof ApiError&&error.status===409;
   put(id,{categoryId,phase:command?'unknown':conflict?'conflict':'failed',command,previousCategoryId,
    message:command?'원래 요청 결과를 확인하세요.':error instanceof Error?error.message:'카테고리를 저장하지 못했습니다.'});
   if(conflict)refresh();
  }finally{active.current.delete(id);}
 }

 function save(row:LedgerRow,category:Category,direction:BaseDirection=baseDirection(row)){
  if(!owner||entries[row.id]?.phase==='unknown'||!category.id||(savedCategory(row)===category.id&&row.meaning_state==='CONFIRMED'&&row.meaningApplied!==false&&baseDirection(row)===direction))return;
  return write(row.id,category.id,async()=>{
   if(category.semanticCode&&!Number.isSafeInteger(category.semanticPolicyVersion))throw Error('최신 카테고리 정책을 확인하세요.');
   const current=await api.get<LedgerRow>(ACCOUNT_LEDGER+'/rows/'+row.id,owner);
   const classificationVersion=ledgerClassificationVersion(current);
   if(!current.fingerprint||current.version!==row.version||classificationVersion!==ledgerClassificationVersion(row))
    throw new ApiError(409,'거래 또는 분류가 변경되었습니다. 최신 값과 비교하세요.');
   return {requestId:crypto.randomUUID(),expectedVersion:current.version,fingerprint:current.fingerprint,
    categoryId:category.id,expectedClassificationVersion:classificationVersion,thisTransactionOnly:true,baseDirection:direction,
    ...(category.semanticCode?{semanticPolicyVersion:category.semanticPolicyVersion!}:{})};
  },false,!category.semanticCode&&row.meaning_state==='CONFIRMED'&&!row.semanticCategoryId?savedCategory(row):undefined);
 }
 function retry(id:string){
  const entry=entries[id],command=entry?.command;
  if(entry?.phase==='unknown'&&command)return write(id,entry.categoryId,async()=>command,true,entry.previousCategoryId);
 }
 async function saveBook(category:Category,book:BookRow){
  const fact=await api.get<LedgerRow>(ACCOUNT_LEDGER+'/rows/'+book.id);
  if(fact.version!==book.transactionVersion||ledgerClassificationVersion(fact)!==(book.classificationVersion??0))
   throw Error('거래 또는 분류가 변경되었습니다. 최신 값을 확인하세요.');
  return !!await save(fact,category);
 }
 return {entries,save,saveBook,retry};
}

export function LedgerCategory({row,categories,disabled,entry,save,retry,onDetails}:{
 row:LedgerRow;categories:Category[];disabled:boolean;entry?:CategoryChange;
 save:(row:LedgerRow,category:Category)=>void;retry:(id:string)=>void;onDetails:()=>void;
}){
 const direction=baseDirection(row);
 const available=categories.filter(category=>(category.kind??'EXPENSE')===direction);
 const options=activeCategories(available,direction);
 const choice=options.find(category=>category.id===entry?.categoryId);
 const focus=useRef<HTMLDivElement>(null),restore=useRef(false);
 useEffect(()=>{
  if(!disabled&&restore.current){
   restore.current=false;
   if(document.activeElement===document.body)focus.current?.querySelector('button')?.focus();
  }
 },[disabled]);
 function select(id:string){
  const option=options.find(category=>category.id===id);
  if(!option)return;
  restore.current=true;
  save(row,option);
 }
 const relation=relationLabel(row);
 const saved=entry?.phase==='saved'&&entry.receipt?.version===row.version
  &&ledgerClassificationVersion(entry.receipt)===ledgerClassificationVersion(row);
 const previous=options.find(category=>category.id===entry?.previousCategoryId&&!category.semanticCode);
 return <div ref={focus} className="al-category-result">
  <CategoryPicker disabled={disabled} allowUncategorized={false} label={(row.title??'거래')+' 생활 카테고리'}
   value={savedCategory(row)} categories={available} onChange={select}/>
  {entry?.phase==='saving'&&<small role="status">저장 중…</small>}
  {saved&&<small role="status">{entry.receipt?.meaningApplied===false?'카테고리 저장됨 · 금융 반영 대기':'저장됨'}</small>}
  {saved&&previous&&<button type="button" disabled={disabled} onClick={()=>save(row,previous)}>카테고리 실행 취소</button>}
  {row.semanticCategoryId&&relation&&<><small>{relation}</small><button type="button" onClick={onDetails}>관계 확인</button></>}
  {entry&&entry.phase!=='saving'&&entry.phase!=='saved'&&<>
   <small role="status">{choice?.name??'선택한 카테고리'} · {entry.phase==='conflict'?'저장 충돌 · ':entry.phase==='failed'?'저장 실패 · ':''}{entry.message}</small>
   {entry.phase==='unknown'?<button type="button" onClick={()=>retry(row.id)}>원래 요청 재확인</button>:
    <>{choice&&<button type="button" disabled={disabled} onClick={()=>save(row,choice)}>선택 다시 적용</button>}
     {entry.phase==='failed'&&<button type="button" onClick={onDetails}>상세 편집</button>}</>}
  </>}
  {row.classificationInScope===false&&<small>가계부 추적 대상 밖 · 통계 범위 유지</small>}
 </div>;
}
