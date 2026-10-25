"use client";
import {useState} from 'react';
import {moneyApi as api} from '@/lib/money/model';
import {UNIFIED,type UnifiedOutcome} from '@/lib/money/unified';
import {useMoneyCache,useMoneyViewState} from './MoneyDataProvider';
export function VerifiedCashAdmission({id,version,disabled}:{id:string;version:number;disabled:boolean}){
 const cache=useMoneyCache(),[pending,setPending]=useMoneyViewState<{requestId:string;expectedVersion:number}|null>('verified-cash-admit-'+id,()=>null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function run(){if(busy||disabled)return;setBusy(true);const operation=pending??{requestId:crypto.randomUUID(),expectedVersion:version};setPending(operation);let result:UnifiedOutcome={status:'UNKNOWN'};
  try{try{result=await api.post(UNIFIED+'/admit/'+id,operation);}catch{result=await api.get(UNIFIED+'/outcomes/'+operation.requestId);}if(result.status==='APPLIED'){setPending(null);setMessage('검증된 현금을 가계부에 등록했습니다. 유형은 전체 거래에서 확정하세요.');cache.mutate('reviewItem');}else if(result.status==='NOT_APPLIED'){setPending(null);setMessage(result.result?.message??'금융 사실 확인이 필요합니다.');}else setMessage('결과 확인 필요 · 같은 요청으로 재확인하세요.');}catch{setMessage('결과 확인 필요 · 원래 요청을 보존했습니다.');}finally{setBusy(false);}
 }
 return <><button disabled={disabled||busy} onClick={()=>void run()}>{pending?'원래 현금 등록 확인·재시도':'현금 확인 · 유형 나중에'}</button>{message&&<small role="status">{message}</small>}</>;
}
