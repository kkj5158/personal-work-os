"use client";
import {useState} from 'react';
import {moneyApi as api} from '@/lib/money/model';
import type {ClassificationUndoPreview} from '@/lib/money/classificationPresentation';
import {useMoneyCache,useMoneyRows,useMoneyViewState} from './MoneyDataProvider';

type Saved={eventIds:string[];transactionIds:string[];text:string};
export function useClassificationUndo(){
 const [saved,setSaved]=useMoneyViewState<Saved|null>('classification-last-save',()=>null);
 return {saved,remember:(eventIds:string[],text='분류를 저장했습니다.',transactionIds:string[]=[])=>{if(eventIds.length)setSaved({eventIds:[...new Set(eventIds)],transactionIds:[...new Set(transactionIds)],text});},clear:()=>setSaved(null)};
}
/** Preview protects later edits before a single atomic undo command. */
export function ClassificationUndo({eventIds,transactionIds=[],onRestored,label='분류 되돌리기'}:{eventIds:string[];transactionIds?:string[];onRestored?:()=>void;label?:string}){
 const cache=useMoneyCache(),coordinator=useMoneyRows();
 const [preview,setPreview]=useState<ClassificationUndoPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 const ids=[...new Set(eventIds)];
 async function inspect(){setBusy(true);setError('');try{await coordinator.flush(transactionIds);setPreview(await api.post('/ai/classification/undo-preview',ids));}catch(e){setError(e instanceof Error?e.message:'복구 가능 여부를 확인하지 못했습니다.');}finally{setBusy(false);}}
 async function restore(){if(!preview)return;setBusy(true);setError('');try{await coordinator.flush(transactionIds);await coordinator.execute('undo:'+preview.eligibleEventIds.join(','),'/ai/classification/undo',{eventIds:preview.eligibleEventIds,fingerprint:preview.fingerprint});cache.mutate('ai');cache.mutate('book');setDone(true);setPreview(null);onRestored?.();}catch(e){setError(e instanceof Error?e.message:'복구하지 못했습니다.');setPreview(null);}finally{setBusy(false);}}
 if(done)return <p role="status">분류를 되돌렸습니다. 제목·메모와 금융 정보는 유지했습니다.</p>;
 return <div className="money-classification-undo"><button disabled={busy||!ids.length} onClick={()=>void inspect()}>{label}</button>{preview&&<div className="money-classification-undo-preview"><p>복구 가능 {preview.eligibleEventIds.length}건 · 제외 {preview.excluded.length}건</p>{preview.excluded.map(item=><p key={item.eventId}>{item.reason}</p>)}<small>제목·메모, 금융 사실과 이후 별도로 바뀐 검토 상태는 보존합니다.</small><div><button className="money-primary" disabled={busy||!preview.eligibleEventIds.length} onClick={()=>void restore()}>{preview.eligibleEventIds.length}건 함께 되돌리기</button><button disabled={busy} onClick={()=>setPreview(null)}>취소</button></div></div>}{busy&&<small role="status">저장 결과 확인 중…</small>}{error&&<p role="alert">{error}</p>}</div>;
}
export function ClassificationUndoNotice(){
 const {saved,clear}=useClassificationUndo();
 if(!saved)return null;
 return <div className="money-classification-save-notice" role="status"><span>{saved.text}</span><ClassificationUndo key={saved.eventIds.join(',')} eventIds={saved.eventIds} transactionIds={saved.transactionIds} label={saved.eventIds.length>1?'묶음 실행 취소':'실행 취소'} onRestored={clear}/><button aria-label="저장 안내 닫기" onClick={clear}>닫기</button></div>;
}
