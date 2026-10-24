"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Maximize2, Minimize2 } from "lucide-react";
import { useShellNavigationGuard } from "@/components/GlobalTabs";
import { NoteContext, type NoteEnvironment } from "@/app/notes/NoteContext";
import { DEFAULT_SETTINGS } from "@/lib/notes/types";
import { timetablesApi as api, type Timetable, type TimetableInput, type TimetableBlock, type BlockInput, type Philosophy } from "@/lib/api/timetables";
import { CategoryColorPicker } from "../CategoryColorPicker";
import { PREFERENCE_KEY, readPreferences, recentColor } from "../appearance";
import { BlockDialog, type BlockDraft } from "./BlockDialog";
import { PhilosophyEditor } from "./PhilosophyEditor";
import { TimetableGrid } from "./TimetableGrid";
import { blockColor, readLayout, type Layout } from "./model";
import "@/app/notes/notes.css";
import "./timetable.css";

const empty:TimetableInput={title:"",description:"",goal:"",memo:"",defaultColor:null,checklist:[]};
type Registration={flush:()=>Promise<void>;dirty:()=>boolean};
type Undo={label:string;run:()=>Promise<void>};
const message=(e:unknown)=>e instanceof Error?e.message:"작업에 실패했습니다. 다시 시도하세요.";
export function TimetableWorkspace() {
  const router=useRouter(),params=useSearchParams();
  const [tables,setTables]=useState<Timetable[]>([]),[owner,setOwner]=useState(""),[loaded,setLoaded]=useState(false),[error,setError]=useState("");
  const [layout,setLayout]=useState<Layout>({left:false,right:false}),[drafts,setDrafts]=useState<Record<string,TimetableInput>>({}),[blocks,setBlocks]=useState<Record<string,TimetableBlock[]>>({}),[philosophies,setPhilosophies]=useState<Record<string,Philosophy>>({});
  const [archive,setArchive]=useState(false),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[undo,setUndo]=useState<Undo|null>(null),[form,setForm]=useState<BlockDraft|null>(null),[creating,setCreating]=useState(false),[newTitle,setNewTitle]=useState("");
  const [recent,setRecent]=useState<string[]>([]),[expandedCards,setExpandedCards]=useState<string[]>([]),[checkTitles,setCheckTitles]=useState<Record<string,string>>({});
  const registrations=useRef(new Map<string,Registration>()),draftRef=useRef(drafts),layoutRef=useRef(layout),busyRef=useRef(false),newKey=useRef("");
  const duplicateKeys=useRef(new Map<string,{version:number;key:string}>());
  useLayoutEffect(()=>{draftRef.current=drafts;layoutRef.current=layout;},[drafts,layout]);
  const active=tables.filter(t=>!t.archivedAt),queryId=params.get("timetable");
  const selected=active.find(t=>t.id===(queryId??layout.selected))??(!queryId?active[0]:undefined);
  const selectedId=selected?.id;
  const checkTitle=selectedId?checkTitles[selectedId]??"":"";
  const setCheckTitle=(value:string)=>{if(selectedId)setCheckTitles(rows=>({...rows,[selectedId]:value}));};
  const leftToggle=useRef<HTMLButtonElement>(null),rightToggle=useRef<HTMLButtonElement>(null),expandToggle=useRef<HTMLButtonElement>(null);
  const preferenceKey=`calendar.timetable.layout.v1:${owner}`;
  const notify=useCallback((e:unknown)=>setError(message(e)),[]);
  const updateTable=useCallback((t:Timetable)=>setTables(rows=>rows.some(r=>r.id===t.id)?rows.map(r=>r.id===t.id?t:r):[...rows,t]),[]);
  const flush=useCallback(async(id?:string)=>{for(const [key,r] of registrations.current)if(!id||key===id)await r.flush();},[]);
  const environment=useMemo<NoteEnvironment>(()=>({workspace:`timetable:${owner}`,settings:{...DEFAULT_SETTINGS,wikiAutocomplete:false},openWiki:()=>{},error:notify,changed:()=>{},register:(id,save,dirty)=>{const value={flush:save,dirty};registrations.current.set(id,value);return()=>{if(registrations.current.get(id)===value)registrations.current.delete(id);};}}),[owner,notify]);
  const leave=useCallback(async(proceed:()=>void)=>{try{await flush();if(Object.keys(draftRef.current).length||form||creating){setError("저장하지 않은 정보가 있습니다. 저장 또는 취소한 뒤 이동하세요.");return;}if(busyRef.current){setError("저장 완료 후 이동하세요.");return;}proceed();}catch(e){notify(e);}},[flush,form,creating,notify]);
  useShellNavigationGuard(leave);
  useEffect(()=>{let live=true;void Promise.all([api.context(),api.list()]).then(([context,rows])=>{if(!live)return;setOwner(context.ownerId);setTables(rows);try{setLayout(readLayout(localStorage.getItem(`calendar.timetable.layout.v1:${context.ownerId}`)));setRecent(readPreferences(localStorage.getItem(PREFERENCE_KEY)).recentColors??[]);}catch{}setLoaded(true);}).catch(e=>{if(live)notify(e);});return()=>{live=false;};},[notify]);
  useEffect(()=>{if(!selectedId)return;let live=true;void Promise.all([api.blocks(selectedId),api.philosophy(selectedId)]).then(([b,p])=>{if(!live)return;setBlocks(rows=>({...rows,[selectedId]:b}));setPhilosophies(rows=>rows[selectedId]?rows:{...rows,[selectedId]:p});}).catch(e=>{if(live)notify(e);});return()=>{live=false;};},[selectedId,notify]);
  useEffect(()=>{const listener=(e:BeforeUnloadEvent)=>{if(busyRef.current||Object.keys(draftRef.current).length||form||creating||[...registrations.current.values()].some(r=>r.dirty()))e.preventDefault();};window.addEventListener("beforeunload",listener);return()=>window.removeEventListener("beforeunload",listener);},[form,creating]);
  const preferences=(next:Layout)=>{setLayout(next);try{localStorage.setItem(preferenceKey,JSON.stringify(next));}catch{}};
  const choose=(id:string)=>{preferences({...layoutRef.current,selected:id});const next=new URLSearchParams(params);next.set("tab","timetable");next.set("timetable",id);router.push(`/calendar?${next}`,{scroll:false});setExpanded(false);};
  const collapse=(side:"left"|"right",value:boolean)=>{preferences({...layoutRef.current,[side]:value});if(side==="right")setExpanded(false);requestAnimationFrame(()=> (side==="left"?leftToggle:rightToggle).current?.focus());};
  const addRecent=(color:string)=>{setRecent(old=>recentColor(old,color));try{const p=readPreferences(localStorage.getItem(PREFERENCE_KEY));localStorage.setItem(PREFERENCE_KEY,JSON.stringify({...p,recentColors:recentColor(p.recentColors,color)}));}catch{}};
  const run=async(fn:()=>Promise<void>)=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError("");try{await fn();}catch(e){notify(e);}finally{busyRef.current=false;setBusy(false);}};
  const savedInfo=async(t:Timetable)=>{const draft=draftRef.current[t.id];if(!draft)return;const saved=await api.update(t.id,{...draft,version:t.version});updateTable(saved);setDrafts(rows=>{const next={...rows};delete next[t.id];return next;});if(saved.defaultColor)addRecent(saved.defaultColor);};
  const ensureSaved=async(t:Timetable)=>{await flush(t.id);await savedInfo(t);return api.get(t.id);};
  const change=(t:Timetable,patch:Partial<TimetableInput>)=>setDrafts(rows=>({...rows,[t.id]:{...(rows[t.id]??t),...patch}}));
  const moveCheck=(t:Timetable,index:number,delta:number)=>{const checklist=[...(draftRef.current[t.id]??t).checklist];[checklist[index],checklist[index+delta]]=[checklist[index+delta],checklist[index]];change(t,{checklist});};
  const discard=(id:string)=>setDrafts(rows=>{const next={...rows};delete next[id];return next;});
  const addBlock=(day=1,start=540,length=60)=>{if(!selected)return;setForm({timetableId:selected.id,key:crypto.randomUUID(),block:{title:"",weekday:day,startMinute:start,durationMinutes:length,memo:"",color:null}});};
  const setBlock=(timetableId:string,b:TimetableBlock)=>setBlocks(rows=>({...rows,[timetableId]:b.deletedAt?(rows[timetableId]??[]).filter(x=>x.id!==b.id):(rows[timetableId]??[]).some(x=>x.id===b.id)?rows[timetableId].map(x=>x.id===b.id?b:x):[...(rows[timetableId]??[]),b]}));
  const moveBlock=(before:TimetableBlock,after:TimetableBlock)=>{void run(async()=>{setBlock(before.timetableId,after);try{const saved=await api.updateBlock(before.timetableId,after);setBlock(before.timetableId,saved);setUndo({label:"블록 변경",run:async()=>{setBlock(before.timetableId,await api.updateBlock(before.timetableId,{...before,version:saved.version}));}});}catch(e){setBlock(before.timetableId,before);try{setBlocks(rows=>({...rows,[before.timetableId]:rows[before.timetableId]}));const fresh=await api.blocks(before.timetableId);setBlocks(rows=>({...rows,[before.timetableId]:fresh}));}catch{}throw e;}});};
  const saveBlock=async(value:BlockInput,days:number[],key:string)=>{if(!form)return;const parent=form.timetableId;
    if(form.original){const saved=await api.updateBlock(parent,{...form.original,...value});setBlock(parent,saved);}else{const result=await api.createBlocks(parent,value,days,key);for(const b of result.blocks)setBlock(parent,b);}setForm(null);};
  const deleteBlock=async()=>{if(!form?.original)return;const b=await api.deleteBlock(form.timetableId,form.original);setBlock(form.timetableId,b);setUndo({label:"블록 삭제",run:async()=>setBlock(b.timetableId,await api.restoreBlock(b.timetableId,b))});setForm(null);};
  const returnToCalendar=()=>{const next=new URLSearchParams(params);next.delete("tab");next.delete("timetable");void leave(()=>router.push(`/calendar${next.size?`?${next}`:""}`));};
  return <NoteContext.Provider value={environment}><div className="tt-workspace">
    <nav className="tt-navigation" aria-label="캘린더 보기"><button onClick={returnToCalendar}>일 / 주 캘린더</button><button aria-current="page">시간표</button><span>날짜 없는 나의 한 주</span></nav>
    {error&&<div role="alert" className="tt-error">{error}<button onClick={()=>setError("")}>닫기</button>{!loaded&&<button onClick={()=>location.reload()}>다시 시도</button>}</div>}
    <div className={`tt-layout ${layout.left?"tt-left-collapsed":""} ${layout.right?"tt-right-collapsed":""}`}>
      <aside id="tt-list" className="tt-left" hidden={layout.left} aria-label="내 시간표"><header><h2>내 시간표</h2><button aria-label="시간표 목록 접기" aria-controls="tt-list" aria-expanded={!layout.left} onClick={()=>collapse("left",true)}><PanelLeftClose size={18}/></button></header>
        <button className="tt-primary tt-create" disabled={busy} onClick={()=>{newKey.current=crypto.randomUUID();setCreating(true);}}>＋ 시간표 만들기</button>
        {creating&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{const t=await api.create({...empty,title:newTitle},newKey.current);updateTable(t);setNewTitle("");setCreating(false);choose(t.id);});}}><label>시간표 이름<input autoFocus maxLength={200} required value={newTitle} onChange={e=>setNewTitle(e.target.value)}/></label><button disabled={busy} type="submit">만들기</button><button type="button" disabled={busy} onClick={()=>setCreating(false)}>취소</button></form>}
        <div className="tt-card-list">{(archive?tables.filter(t=>t.archivedAt):active).map(t=>{const data=drafts[t.id]??t,full=expandedCards.includes(t.id);return <article key={t.id} className={`tt-card ${selectedId===t.id?"selected":""}`}>
          <header><button className="tt-card-select" disabled={!!t.archivedAt} aria-pressed={selectedId===t.id} onClick={()=>choose(t.id)}><CalendarDays size={18}/><strong>{data.title}</strong></button><details><summary aria-label={`${t.title} 더보기`}>···</summary><div className="tt-card-menu">
            {!t.archivedAt&&<><button onClick={()=>{choose(t.id);collapse("right",false);requestAnimationFrame(()=>document.getElementById(`tt-title-${t.id}`)?.focus());}}>정보 수정</button><button disabled={busy} onClick={()=>void run(async()=>{const fresh=await ensureSaved(t);let receipt=duplicateKeys.current.get(t.id);if(!receipt||receipt.version!==fresh.version){receipt={version:fresh.version,key:crypto.randomUUID()};duplicateKeys.current.set(t.id,receipt);}const copy=await api.duplicate(fresh,receipt.key);duplicateKeys.current.delete(t.id);updateTable(copy);choose(copy.id);})}>전체 복제</button>
            {[-1,1].map(delta=><button key={delta} disabled={busy||active.findIndex(a=>a.id===t.id)+delta<0||active.findIndex(a=>a.id===t.id)+delta>=active.length} onClick={()=>void run(async()=>{const ids=active.map(a=>a.id),index=ids.indexOf(t.id);[ids[index],ids[index+delta]]=[ids[index+delta],ids[index]];setTables(await api.reorder(ids));})}>{delta<0?"위로 이동":"아래로 이동"}</button>)}</>}
            <button disabled={busy} onClick={()=>void run(async()=>{const fresh=t.archivedAt?t:await ensureSaved(t);const saved=await api.archive(fresh,!t.archivedAt);updateTable(saved);if(selectedId===t.id){const next=active.find(a=>a.id!==t.id);if(next)choose(next.id);else{const query=new URLSearchParams(params);query.delete("timetable");router.replace(`/calendar?${query}`,{scroll:false});}}})}>{t.archivedAt?"복원":"보관"}</button>
          </div></details></header>
          <div className={`tt-card-content ${full?"expanded":""}`}><p>{data.description||"설명을 작성해 시간표를 구별하세요."}</p>{data.goal&&<section><small>목표</small><p>{data.goal}</p></section>}{data.memo&&<section><small>메모</small><p>{data.memo}</p></section>}</div>
          {(data.description.length+data.goal.length+data.memo.length>280||`${data.description}\n${data.goal}\n${data.memo}`.split("\n").length>8)&&<button className="tt-more" aria-expanded={full} onClick={()=>setExpandedCards(rows=>full?rows.filter(x=>x!==t.id):[...rows,t.id])}>{full?"내용 접기":"내용 펼치기"}</button>}
        </article>;})}{loaded&&!(archive?tables.filter(t=>t.archivedAt):active).length&&<p className="tt-muted">{archive?"보관된 시간표가 없습니다.":"첫 시간표를 만들어 한 주를 설계하세요."}</p>}</div>
        <button aria-pressed={archive} onClick={()=>setArchive(!archive)}>{archive?"← 내 시간표":"보관함"}</button>
      </aside>
      <main className="tt-center"><header className="tt-toolbar"><div className="tt-layout-buttons"><button ref={leftToggle} aria-label={layout.left?"시간표 목록 펼치기":"시간표 목록 접기"} aria-expanded={!layout.left} aria-controls="tt-list" onClick={()=>collapse("left",!layout.left)}><PanelLeftOpen size={17}/></button><button ref={rightToggle} aria-label={layout.right?"운영 철학 펼치기":"운영 철학 접기"} aria-expanded={!layout.right} aria-controls="tt-information" onClick={()=>collapse("right",!layout.right)}><PanelRightOpen size={17}/></button></div><div className="tt-heading"><h1>{(selected&&drafts[selected.id]?.title)||selected?.title||"시간표"}</h1><small>월–일 주간 시간표</small></div><button disabled={!selected||busy} onClick={()=>addBlock()}>＋ 블록 추가</button><button className="tt-reset" onClick={()=>{preferences({...layout,left:false,right:false});setExpanded(false);}}>기본 배치로 복원</button></header>
        {undo&&<div className="tt-undo" role="status">{undo.label}<button disabled={busy} onClick={()=>void run(async()=>{await undo.run();setUndo(null);})}>실행 취소</button><button aria-label="실행 취소 알림 닫기" onClick={()=>setUndo(null)}>×</button></div>}
        {!loaded?<p className="tt-empty">시간표 불러오는 중…</p>:selected?blocks[selected.id]?<TimetableGrid id={selected.id} blocks={blocks[selected.id]} defaultColor={(drafts[selected.id]??selected).defaultColor} busy={busy} onCreate={addBlock} onEdit={block=>setForm({timetableId:selected.id,key:crypto.randomUUID(),block,original:block})} onMove={moveBlock}/>:<p className="tt-empty">블록 불러오는 중…</p>:<div className="tt-empty"><h2>{queryId?"선택한 시간표를 사용할 수 없습니다.":"나의 한 주를 그려보세요"}</h2><p>{queryId?"다른 시간표를 선택하거나 보관함에서 복원하세요.":"내 시간표에서 첫 시간표를 만들어보세요."}</p><button onClick={()=>collapse("left",false)}>시간표 목록 펼치기</button></div>}
        {selected&&blocks[selected.id]?.length===0&&<p className="tt-grid-hint">빈 칸을 클릭하거나 드래그해 블록을 추가하세요 · 15분 스냅 · 상세 입력은 1분 단위</p>}
      </main>
      <aside id="tt-information" className={`tt-right ${expanded?"tt-expanded":""}`} hidden={layout.right} aria-label="운영 철학과 시간표 정보"><header><h2>운영 철학</h2><button ref={expandToggle} disabled={!selected} aria-label={expanded?"운영 철학 축소":"운영 철학 확대"} aria-expanded={expanded} onClick={()=>{setExpanded(!expanded);requestAnimationFrame(()=>expandToggle.current?.focus());}}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button><button aria-label="운영 철학 접기" aria-controls="tt-information" aria-expanded={!layout.right} onClick={()=>collapse("right",true)}><PanelRightClose size={18}/></button></header>
        <div className="tt-information-body">{tables.filter(t=>philosophies[t.id]).map(t=><div key={t.id} hidden={selectedId!==t.id} className="tt-philosophy"><PhilosophyEditor timetable={t} initial={philosophies[t.id]} owner={owner}/></div>)}
          {selected&&!philosophies[selected.id]&&<p className="tt-muted">운영 철학 불러오는 중…</p>}
          {selected&&<div className="tt-metadata"><label>이름<input id={`tt-title-${selected.id}`} maxLength={200} value={(drafts[selected.id]??selected).title} onChange={e=>change(selected,{title:e.target.value})}/></label>
            <label className="tt-inline">시간표 기본색<CategoryColorPicker name="시간표 기본" selected={blockColor(null,(drafts[selected.id]??selected).defaultColor)} inherited={!(drafts[selected.id]??selected).defaultColor} recent={recent} onColor={defaultColor=>change(selected,{defaultColor})}/></label>
            {([ ["goal","목표"],["description","시간표 설명"] ] as const).map(([field,label])=><details key={field} open><summary>{label}</summary><textarea aria-label={label} rows={3} maxLength={20000} value={(drafts[selected.id]??selected)[field]} onChange={e=>change(selected,{[field]:e.target.value})}/></details>)}
            <details open><summary>체크리스트</summary>{(drafts[selected.id]??selected).checklist.map((c,index)=><div key={c.id} className="tt-check">
              <input type="checkbox" aria-label={c.title} checked={c.checked} onChange={e=>change(selected,{checklist:(drafts[selected.id]??selected).checklist.map(i=>i.id===c.id?{...i,checked:e.target.checked}:i)})}/>
              <input aria-label={`체크리스트 ${index+1} 제목`} maxLength={200} value={c.title} onChange={e=>change(selected,{checklist:(drafts[selected.id]??selected).checklist.map(i=>i.id===c.id?{...i,title:e.target.value}:i)})}/>
              <button aria-label={`${c.title} 위로`} disabled={index===0} onClick={()=>moveCheck(selected,index,-1)}>↑</button><button aria-label={`${c.title} 아래로`} disabled={index===(drafts[selected.id]??selected).checklist.length-1} onClick={()=>moveCheck(selected,index,1)}>↓</button>
              <button aria-label={`${c.title} 제거`} onClick={()=>change(selected,{checklist:(drafts[selected.id]??selected).checklist.filter(i=>i.id!==c.id)})}>×</button>
            </div>)}<form onSubmit={e=>{e.preventDefault();if(!checkTitle.trim())return;change(selected,{checklist:[...(drafts[selected.id]??selected).checklist,{id:crypto.randomUUID(),title:checkTitle.trim(),checked:false}]});setCheckTitle("");}}><input aria-label="체크리스트 항목" placeholder="항목 추가" maxLength={200} value={checkTitle} onChange={e=>setCheckTitle(e.target.value)}/><button type="submit">추가</button></form></details>
            <details open><summary>메모</summary><textarea aria-label="메모" rows={3} maxLength={20000} value={(drafts[selected.id]??selected).memo} onChange={e=>change(selected,{memo:e.target.value})}/></details>
            {drafts[selected.id]&&<footer><span>정보 변경됨</span><button disabled={busy} onClick={()=>discard(selected.id)}>정보 취소</button><button className="tt-primary" disabled={busy} onClick={()=>void run(()=>savedInfo(selected))}>정보 저장</button><button disabled={busy} onClick={()=>void run(async()=>{const fresh=await api.get(selected.id);updateTable(fresh);})}>최신 버전 확인</button></footer>}
          </div>}
        </div>
      </aside>
    </div>
    {form&&<BlockDialog key={form.key} draft={form} defaultColor={tables.find(t=>t.id===form.timetableId)?.defaultColor??null} recent={recent} onRecent={addRecent} onSave={saveBlock} onDelete={deleteBlock} onDuplicate={()=>setForm({...form,original:undefined,key:crypto.randomUUID(),block:{...form.block,title:`${form.block.title} (복사)`}})} onClose={()=>setForm(null)}/>}
  </div></NoteContext.Provider>;
}
