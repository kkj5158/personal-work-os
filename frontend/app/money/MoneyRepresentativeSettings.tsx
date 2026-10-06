"use client";
import {useState} from 'react';
import {ApiError} from '@/lib/api/client';
import {moneyApi as api} from '@/lib/money/model';
import {groupedWebAccounts} from '@/lib/money/accounts';
import {legacyRows,layoutError,relocate,type RepresentativePreferences,type RepresentativeRow} from '@/lib/money/layout';
import {MoneyDialog} from './MoneyDialog';
import {useMoneyCache} from './MoneyDataProvider';
import type {Props} from './MoneyWebViews';

export function RepresentativeSettings(p:Props&{initial:RepresentativePreferences;onClose:()=>void}){
  const [rows,setRows]=useState<RepresentativeRow[]>(()=>p.initial.layout?.rows??legacyRows(p.initial.accountIds));
  const [version,setVersion]=useState(p.initial.version),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [conflict,setConflict]=useState<RepresentativePreferences|null>(null);
  const cache=useMoneyCache(),ids=rows.flatMap(r=>r.accountIds),available=new Set(p.accounts.map(a=>a.id));
  const validation=layoutError(rows,available);
  const newRow=()=>({id:crypto.randomUUID(),name:null,accountIds:[]});
  function toggle(id:string){
    if(ids.includes(id)){setRows(rows.map(r=>({...r,accountIds:r.accountIds.filter(value=>value!==id)})));return;}
    const target=rows.find(r=>r.accountIds.length<3);
    if(target)setRows(rows.map(r=>r.id===target.id?{...r,accountIds:[...r.accountIds,id]}:r));
    else if(rows.length<5)setRows([...rows,{...newRow(),accountIds:[id]}]);
  }
  function move(id:string,delta:number){
    const index=ids.indexOf(id),other=ids[index+delta];if(!other)return;
    // Swap across full rows so every movement respects capacity.
    setRows(rows.map(row=>({...row,accountIds:row.accountIds.map(value=>value===id?other:value===other?id:value)})));
    setError(`${p.accounts.find(a=>a.id===id)?.displayName??'계좌'} 위치를 변경했습니다.`);
  }
  async function save(){
    if(busy||validation||conflict)return;setBusy(true);setError('');
    const payload={accountIds:ids,expectedVersion:version,layout:{layoutVersion:1,rows}};
    try{await api.put('/overview/preferences',payload);cache.invalidate(key=>key==='/overview/preferences');p.onClose();}
    catch(e){
      const latest=await api.get<RepresentativePreferences>('/overview/preferences').catch(()=>null);
      // A lost response is resolved by re-reading the persisted exact layout before offering another save.
      if(latest&&latest.version===version+1&&JSON.stringify(latest.layout)===JSON.stringify(payload.layout)){cache.invalidate(key=>key==='/overview/preferences');p.onClose();return;}
      if(latest&&latest.version!==version)setConflict(latest);
      setError(e instanceof ApiError&&e.status===409?'다른 기기에서 배치가 변경되었습니다. 작성 중인 배치는 유지했습니다. 최신 배치와 비교해 주세요.':'저장 결과를 확인하지 못했습니다. 작성 중인 배치를 유지했습니다. 다시 확인해 주세요.');
    }finally{setBusy(false);}
  }
  return <MoneyDialog title="대표 계좌 배치" onClose={()=>{if(!busy)p.onClose();}}>
    <p className="money-muted">최대 10개 · 다섯 행 · 행마다 세 계좌. 행 이름은 선택 사항입니다. 표시 배치는 가계부 추적·자금 구역·자산 포함과 독립적입니다.</p>
    <p id="representative-movement">계좌를 끌어 원하는 행이나 계좌 앞에 놓으세요. 키보드에서는 이동 버튼 또는 Alt + 방향키로 순서를 변경할 수 있습니다.</p>
    {groupedWebAccounts(p.accounts).filter(g=>g.accounts.length).map(g=><fieldset key={g.id}><legend>{g.label}</legend>{g.accounts.filter(a=>!a.archived||ids.includes(a.id)).map(a=><label className="money-check" key={a.id}><input type="checkbox" disabled={busy||!ids.includes(a.id)&&ids.length>=10} checked={ids.includes(a.id)} onChange={()=>toggle(a.id)}/>{a.displayName}{a.archived?' · 보관':''}</label>)}</fieldset>)}
    <div className="money-layout-editor">{rows.map((row,ri)=><section key={row.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)setRows(relocate(rows,e.dataTransfer.getData('text/plain'),row.id));}}>
      <div className="money-section-heading"><input disabled={busy} aria-label={`${ri+1}행 이름 (선택)`} placeholder="행 이름 (선택)" maxLength={80} value={row.name??''} onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,name:e.target.value||null}:r))}/><span>{row.accountIds.length} / 3</span><button disabled={busy||ri===0} aria-label={`${ri+1}행 위로`} onClick={()=>{const next=[...rows];[next[ri-1],next[ri]]=[next[ri],next[ri-1]];setRows(next);}}>↑</button><button disabled={busy||ri===rows.length-1} aria-label={`${ri+1}행 아래로`} onClick={()=>{const next=[...rows];[next[ri+1],next[ri]]=[next[ri],next[ri+1]];setRows(next);}}>↓</button><button disabled={busy} onClick={()=>setRows(rows.filter(r=>r.id!==row.id))}>행 제거</button></div>
      <ul className="money-representative-order">{row.accountIds.map(id=><li key={id} draggable={!busy} tabIndex={0} aria-describedby="representative-movement" onDragStart={e=>e.dataTransfer.setData('text/plain',id)} onDrop={e=>{e.preventDefault();e.stopPropagation();if(!busy)setRows(relocate(rows,e.dataTransfer.getData('text/plain'),row.id,id));}} onKeyDown={e=>{if(!busy&&e.altKey&&['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.key)){e.preventDefault();move(id,['ArrowUp','ArrowLeft'].includes(e.key)?-1:1);}}}><span>{p.accounts.find(a=>a.id===id)?.displayName??'사용 불가 계좌'}</span><button disabled={busy||ids[0]===id} aria-label="계좌 앞으로 이동" onClick={()=>move(id,-1)}>←</button><button disabled={busy||ids.at(-1)===id} aria-label="계좌 뒤로 이동" onClick={()=>move(id,1)}>→</button><button disabled={busy} onClick={()=>toggle(id)}>제거</button></li>)}</ul>
      {!row.accountIds.length&&<p className="money-muted">계좌를 여기로 옮길 수 있습니다. 빈 행은 개요에서 숨깁니다.</p>}
    </section>)}</div><button disabled={busy||rows.length>=5} onClick={()=>setRows([...rows,newRow()])}>행 추가</button>
    {conflict&&<section className="money-financial-notice"><h3>최신 저장 배치</h3>{(conflict.layout?.rows??legacyRows(conflict.accountIds)).map(r=><p key={r.id}>{r.name??'이름 없는 행'} · {r.accountIds.map(id=>p.accounts.find(a=>a.id===id)?.displayName??'사용 불가 계좌').join(', ')}</p>)}<button onClick={()=>{setVersion(conflict.version);setConflict(null);setError('최신 배치를 확인했습니다. 현재 초안을 저장하려면 설정 저장을 선택해 주세요.');}}>최신 배치 확인 · 내 초안 유지</button><button onClick={()=>{setRows(conflict.layout?.rows??legacyRows(conflict.accountIds));setVersion(conflict.version);setConflict(null);setError('최신 배치를 불러왔습니다.');}}>최신 배치로 초안 교체</button></section>}
    <p role={validation?'alert':'status'}>{validation||error}</p><footer><button disabled={busy} onClick={p.onClose}>취소</button><button className="money-primary" disabled={busy||!!validation||!!conflict} onClick={()=>void save()}>{busy?'저장 중…':'설정 저장'}</button></footer>
  </MoneyDialog>;
}
