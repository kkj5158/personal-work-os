"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Category} from '@/lib/money/model';
import {categoryIndex} from '@/lib/money/categories';
import {useMoneyRows} from './MoneyDataProvider';

/** Root selection is a draft. Only a final child or explicit root-only action persists. */
export function ClassificationCells({id,value,proposal,categories,onSave,disabled=false}:{id:string;value:string|null;proposal?:string|null;categories:Category[];onSave:(id:string)=>Promise<void>;disabled?:boolean}){
 const index=categoryIndex(categories),current=value?index.byId.get(value):undefined;
 const suggested=proposal?index.byId.get(proposal):undefined,suggestedRoot=suggested?.parentId?index.byId.get(suggested.parentId):suggested;
 const coordinator=useMoneyRows();
 const [root,setRoot]=useState<string|undefined>(()=>coordinator.draft<string>(id,'category-root')),[phase,setPhase]=useState<'root'|'child'|null>(null),[search,setSearch]=useState(''),[highlight,setHighlight]=useState(0),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const staged=root!==undefined,rootId=root??current?.parentId??current?.id??'',parent=index.byId.get(rootId);
 const rows=(phase==='root'?index.roots:(index.children.get(rootId)??[])).filter(c=>index.active(c)&&c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const host=useRef<HTMLDivElement>(null),child=useRef<HTMLButtonElement>(null),rootButton=useRef<HTMLButtonElement>(null),revision=useRef(0);
 const [position,setPosition]=useState({top:0,left:0});
 useEffect(()=>{if(!phase)return;const locate=()=>{const node=phase==='root'?rootButton.current:child.current;if(!node)return;const rect=node.getBoundingClientRect();setPosition({top:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-370)),left:Math.max(8,Math.min(rect.left,window.innerWidth-276))});};locate();window.addEventListener('resize',locate);window.addEventListener('scroll',locate,true);return()=>{window.removeEventListener('resize',locate);window.removeEventListener('scroll',locate,true);};},[phase]);
 useEffect(()=>coordinator.registerDraft(id,'classification-stage',async()=>{if(staged||error)throw Error('분류 선택 초안이 있습니다. 소분류 또는 중분류만 적용을 먼저 선택해 주세요.');}),[coordinator,id,staged,error]);
 function cancel(){coordinator.discardDraft(id,'category-root');revision.current++;setRoot(undefined);setPhase(null);setSearch('');setError('');}
 async function final(next:string){if(saving||disabled)return;const attempt=revision.current;setSaving(true);setError('');try{await onSave(next);if(attempt===revision.current){coordinator.discardDraft(id,'category-root');setRoot(undefined);setPhase(null);setSearch('');}}catch(e){setError(e instanceof Error?e.message:'분류를 저장하지 못했습니다.');}finally{setSaving(false);}}
 function choose(next:Category){if(phase==='root'){revision.current++;coordinator.keepDraft(id,'category-root',next.id);setRoot(next.id);setPhase('child');setSearch('');setHighlight(0);child.current?.focus();}else void final(next.id);}
 const popup=phase&&createPortal(<div className="money-classification-popup" style={{position:"fixed",top:position.top,left:position.left,zIndex:1000}} onClick={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Tab'){e.preventDefault();setPhase(null);if(!e.shiftKey)child.current?.focus();else if(phase==='child')rootButton.current?.focus();else {const fields=Array.from(document.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href]')).filter(el=>!el.closest('.money-classification-popup')&&!el.hasAttribute('disabled')&&el.getClientRects().length);const base=phase==='root'?rootButton.current:child.current;const offset=base?fields.indexOf(base):-1;fields[offset+(e.shiftKey?-1:1)]?.focus();}}else if(e.key==='Escape'){e.preventDefault();cancel();rootButton.current?.focus();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setHighlight(old=>Math.max(0,Math.min(rows.length-1,old+(e.key==='ArrowDown'?1:-1))));}else if(e.key==='Enter'){e.preventDefault();if(rows[highlight])choose(rows[highlight]);}else if(e.key==='ArrowLeft'){e.preventDefault();setPhase('root');setSearch('');rootButton.current?.focus();}else if(e.key==='ArrowRight'&&rootId){e.preventDefault();setPhase('child');setSearch('');child.current?.focus();}}}>
  <input autoFocus aria-label={`${phase==='root'?'중분류':'소분류'} 검색`} value={search} onChange={e=>{setSearch(e.target.value);setHighlight(0);}} />
  <div role="listbox" aria-label={phase==='root'?'중분류 선택':'소분류 최종 선택'}>{rows.map((c,i)=><button type="button" role="option" aria-selected={highlight===i} key={c.id} onClick={()=>choose(c)}>{c.name}</button>)}</div>
  {!rows.length&&<p>검색 결과가 없습니다. 현재값과 검색 입력을 유지합니다.</p>}
  {phase==='child'&&parent&&<button type="button" disabled={saving} onClick={()=>void final(parent.id)}>중분류만 적용 · {parent.name}</button>}
  <button type="button" onClick={cancel}>초안 취소</button><small>↑↓ 선택 · ←→ 단계 · Enter 적용 · Escape 취소 · Tab 다음 필드</small>
 </div>,document.body);
 return <><td onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} className="money-classification-cell"><div ref={host}><button ref={rootButton} type="button" disabled={disabled} aria-label={`${id} 중분류`} aria-expanded={phase==='root'} onClick={()=>{setPhase(phase==='root'?null:'root');setSearch('');setHighlight(0);}}>{parent?.name??(value?'현재 분류 확인 필요':'미분류')}{staged&&' · 입력 중'}</button>{phase==='root'&&popup}</div>{suggestedRoot&&<small>제안: {suggestedRoot.name}</small>}</td>
 <td onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} className="money-classification-cell"><button ref={child} type="button" disabled={disabled||!rootId} aria-label={`${id} 소분류`} aria-expanded={phase==='child'} onClick={()=>{setPhase(phase==='child'?null:'child');setSearch('');setHighlight(0);}}>{!staged&&current?current.parentId?current.name:'소분류 없음':'소분류 선택'}</button>{suggested&&<small>제안: {suggested.parentId?suggested.name:'소분류 없음'}</small>}{phase==='child'&&popup}{saving&&<small role="status">저장 결과 확인 중…</small>}{error&&<small role="alert">{error} · 선택 초안을 유지했습니다.</small>}</td></>;
}
