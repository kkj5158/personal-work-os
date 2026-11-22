"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ApiError} from '@/lib/api/client';
import {moneyApi} from '@/lib/money/model';
import {ACCOUNT_LEDGER,ledgerDisplayType,ledgerTypes,type LedgerRow} from '@/lib/money/accountLedger';
import {baseDirection,baseDirectionLabel,protectedMeaning,type BaseDirection} from '@/lib/money/categorySemantics';
import {useMoneyCache,useMoneyViewState} from './MoneyDataProvider';

const labels:Record<string,string>={
 TRANSFER_PAIR_PENDING:'상대 거래 연결 대기', SAVINGS_ROUTE_PENDING:'계좌 연결 대기',
 LOAN_SPLIT_PENDING:'원금·이자 분할 미확정', LOAN_LINK_PENDING:'대출 연결 대기',
 REFUND_ORIGINAL_PENDING:'원거래 연결 대기', RELATION_CORRECTION_REQUIRED:'관계 정정 필요',
 DIRECTION_REVIEW:'입출금 방향 확인 필요',
};
export function relationLabel(row:LedgerRow){
 return row.relationStatus && row.relationStatus!=='NONE' ? labels[row.relationStatus]??'세부정보 미확정' : '';
}
export function directionHint(row:LedgerRow,type:string){
 if(row.from_account_id&&row.to_account_id)return '';
 if(type==='UNRESOLVED'||type==='TRANSFER')return '';
 if(row.direction==='IN'&&['EXPENSE','SAVINGS','LOAN_PAYMENT'].includes(type))return '출금 거래에서 선택 가능';
 if(row.direction==='OUT'&&['INCOME','REFUND','SAVINGS_WITHDRAWAL','LOAN_RECEIPT'].includes(type))return '입금 거래에서 선택 가능';
 return '';
}
type TypeCommand={requestId:string;expectedVersion:number;financialType:string;v4?:boolean};
type Receipt={intentSaved:boolean;meaningApplied:boolean;currentVersion:number;requestId:string;transactionId:string;row:LedgerRow};
type Phase='saving'|'saved'|'unknown'|'conflict'|'failed';
type Decision={id:string;title:string;before:string;command:TypeCommand;phase:Phase;receipt?:Receipt;message?:string};
type Recovery=Pick<Decision,'id'|'before'|'command'>;
function stored(owner:string):Recovery[]{
 try{
  const values:unknown=JSON.parse(window.sessionStorage.getItem('ledger-type-requests:'+owner)??'[]');
  if(!Array.isArray(values))return [];
  return values.filter(({id,before,command})=>typeof id==='string'&&/^[a-zA-Z0-9-]+$/.test(id)
   &&Object.hasOwn(ledgerTypes,before)&&Object.hasOwn(ledgerTypes,command?.financialType)
   &&typeof command.requestId==='string'&&Number.isSafeInteger(command.expectedVersion));
 }catch{return [];}
}
// Retain only the replayable command and prior type. Titles, amounts and receipts stay in memory.
function remember(owner:string,id:string,request?:Recovery){
 try{
  const commands=stored(owner).filter(item=>item.id!==id);
  if(request)commands.push({id,before:request.before,command:request.command});
  const key='ledger-type-requests:'+owner;
  if(commands.length)window.sessionStorage.setItem(key,JSON.stringify(commands));
  else window.sessionStorage.removeItem(key);
 }catch{/* In private storage modes the same request is still available in session view state. */}
}
export function useFinancialDecisions(){
 const cache=useMoneyCache(),owner=cache.preferenceOwner;
 const [entries,setEntries]=useMoneyViewState<Record<string,Decision>>('ledger-financial-decisions',()=>({}));
 const active=useRef(new Set<string>()),restored=useRef(false);
 useEffect(()=>{
  if(restored.current||!owner)return;
  restored.current=true;
  const commands=stored(owner);
  if(commands.length)setEntries(current=>{
   const next={...current};
   for(const request of commands)next[request.id]??={...request,phase:'unknown',title:'거래',message:'원래 요청 결과를 확인하세요.'};
   return next;
  });
 },[owner,setEntries]);
 function put(entry:Decision){setEntries(old=>({...old,[entry.id]:entry}));}
 async function send(entry:Decision,refresh=true){
  if(!owner||cache.preferenceOwner!==owner||active.current.has(entry.id))return 'busy';
  active.current.add(entry.id);
  remember(owner,entry.id,entry);
  put({...entry,phase:'saving'});
  try{
   const receipt=await moneyApi.patch<Receipt>(ACCOUNT_LEDGER+'/rows/'+entry.id+'/financial-type',entry.command,owner);
   if(!receipt?.intentSaved||receipt.requestId!==entry.command.requestId||receipt.transactionId!==entry.id||receipt.row?.id!==entry.id)throw Error('저장 응답을 확인할 수 없습니다.');
   remember(owner,entry.id);
   put({...entry,phase:'saved',receipt});
   if(refresh)cache.mutate('transaction');
   return relationLabel(receipt.row)?'pending':'saved';
  }catch(error){
   const rejected=error instanceof ApiError && error.status>=400 && error.status<500 && error.status!==408;
   const phase=error instanceof ApiError&&error.status===409?'conflict':rejected?'failed':'unknown';
   const message=phase==='conflict'?'거래가 변경되었습니다. 최신 값과 선택을 비교하세요.':rejected?error.message:'응답을 확인하지 못했습니다.';
   if(phase!=='unknown')remember(owner,entry.id);
   put({...entry,phase,message});
   if(refresh&&phase==='conflict')cache.mutate('transaction');
   return phase;
  }finally{active.current.delete(entry.id);}
 }
 function save(row:LedgerRow,type:string,refresh=true){
  const prior=entries[row.id];
  if(prior?.phase==='unknown'||prior?.phase==='saving')return Promise.resolve('busy');
  return send({id:row.id,title:row.title??'거래',before:ledgerDisplayType(row),phase:'saving',command:{requestId:crypto.randomUUID(),expectedVersion:row.version,financialType:type,...(type==='REFUND'?{v4:true}:{})}},refresh);
 }
 function retry(entry:Decision,row?:LedgerRow){
  if(entry.phase==='unknown')return send(entry);
  if(!row)return;
  return save(row,entry.command.financialType);
 }
 function undo(entry:Decision){
  if(!entry.receipt)return;
  return save({...entry.receipt.row,version:entry.receipt.currentVersion},entry.before);
 }
 return {entries,save,retry,undo};
}

export function FinancialTypePicker({row,disabled,onChoose}:{row:LedgerRow;disabled:boolean;onChoose:(type:string)=>void}){
 const current=baseDirection(row),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false);
 const [position,setPosition]=useState({top:8,left:8,maxHeight:220});
 const restoreAfterSave=useRef(false);
 useEffect(()=>{if(!disabled&&restoreAfterSave.current){restoreAfterSave.current=false;if(document.activeElement===document.body)trigger.current?.focus();}},[disabled]);
 function close(){setOpen(false);trigger.current?.focus();}
 function choose(next:BaseDirection){
  close();
  if(next!==current || (row.meaning_state==='UNRESOLVED' && (!row.declaredFinancialType||row.declaredFinancialType==='UNRESOLVED'))){restoreAfterSave.current=true;onChoose(next);}
 }
 useLayoutEffect(()=>{
  if(!open)return;
  function place(){
   const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
   const height=window.visualViewport?.height??window.innerHeight,width=window.visualViewport?.width??window.innerWidth;
   const below=height-rect.bottom-12,above=rect.top-12,up=below<240&&above>below;
   const maxHeight=Math.min(420,Math.max(96,up?above:below));
   const menuHeight=Math.min(maxHeight,menu.current?.scrollHeight||420);
   setPosition({top:up?Math.max(4,rect.top-menuHeight-4):rect.bottom+4,left:Math.max(8,Math.min(rect.left,width-288)),maxHeight});
  }
  place();menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  function outside(e:PointerEvent){if(!menu.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setOpen(false);}
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  window.visualViewport?.addEventListener('resize',place);document.addEventListener('pointerdown',outside);
  return ()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);document.removeEventListener('pointerdown',outside);};
 },[open]);
 return <><button type="button" ref={trigger} className="al-type-trigger" aria-label={(row.title??'거래')+' 금융 유형'} aria-haspopup="dialog" aria-expanded={open} disabled={disabled}
 onClick={()=>open?close():setOpen(true)}>{baseDirectionLabel(row)}<span aria-hidden="true">⌄</span></button>
 {open&&createPortal(<div ref={menu} className="al-type-menu" role="dialog" aria-label="금융 유형 편집" style={position}
 onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
 onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();close();return;}
  const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(index<0)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(index+buttons.length+(e.key==='ArrowDown'?1:-1))%buttons.length]?.focus();}
  else if(e.key==='Enter'){e.preventDefault();buttons[index].click();}
 }}>
 <div role="group" aria-label="거래 방향">{(['INCOME','EXPENSE','TRANSFER'] as const).map(type=><button type="button" key={type} aria-pressed={current===type}
 disabled={!!directionHint(row,type)||!!(row.from_account_id&&row.to_account_id)||protectedMeaning(row)} onClick={()=>choose(type)}>{baseDirectionLabel({type})}</button>)}</div>
 {protectedMeaning(row)&&<small>연결된 금융 관계는 상세 편집에서 정정 근거와 영향을 확인하세요.</small>}
 </div>,document.body)}</>;
}

export function DecisionStatus({row,entry,retry,undo}:{row:LedgerRow;entry?:Decision;retry:(entry:Decision,row:LedgerRow)=>void;undo:(entry:Decision)=>void}){
 const relation=relationLabel(row);
 if(entry?.phase==='saving')return <span role="status">저장 중…</span>;
 if(entry&&entry.phase!=='saved')return <div className="al-decision-result" role="status"><span>{ledgerTypes[entry.command.financialType]} · {entry.message}</span><button type="button" onClick={()=>retry(entry,row)}>{entry.phase==='unknown'?'원래 요청 재확인':'선택 다시 적용'}</button></div>;
 const saved=entry?.receipt?.currentVersion===row.version;
 return <div className="al-decision-result" role="status"><span className={'al-status '+(relation||ledgerDisplayType(row)==='UNRESOLVED'?'unresolved':'')}>{relation||(saved?'저장됨':ledgerDisplayType(row)==='UNRESOLVED'?'금융 의미 미확정':row.meaningOrigin==='AUTO'?'자동 확정':row.declaredFinancialType||row.meaningOrigin==='OWNER'?'직접 확정':'확정')}</span>
 {relation&&<small>{row.meaningApplied===false?'유형 선택 저장 · 금융 반영 대기':'유형 저장됨'}</small>}{entry?.receipt&&entry.receipt.currentVersion<row.version&&<small>이후 수정되어 실행 취소할 수 없습니다.</small>}{saved&&entry&&<button type="button" onClick={()=>undo(entry)}>실행 취소</button>}</div>;
}
