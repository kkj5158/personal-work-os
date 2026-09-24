"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { workflowApi, type FixedTab } from '@/lib/api/workflow';
import { today, dateLabel } from '@/lib/notes/model';
import { validLocalDate } from '@/lib/localDateBridge';
import { WORKPAD_SHORTCUTS } from '@/lib/workflow/shortcuts';
import Today from './Today';
import TopicNotePanel from './TopicNotePanel';
import { WorkpadSessions } from './WorkpadSessions';
import { WorkpadDock, type DockMode } from './WorkpadDock';

export default function WorklogStream(){
  const search=useSearchParams(),requested=search.get('date');
  const initial=validLocalDate(requested)?requested:today();
  const [dates,setDates]=useState<string[]>([initial]),[anchor,setAnchor]=useState(initial),[tabs,setTabs]=useState<FixedTab[]>([]),[activeTab,setActiveTab]=useState(''),[collapsed,setCollapsed]=useState(false),[error,setError]=useState('');
  const [mode,setMode]=useState<DockMode>(search.get('note')?'linked':'routine');
  const [linkedNote,setLinkedNote]=useState<string|null>(null),[mainNote,setMainNote]=useState<string|null>(null);
  const [recordedDates,setRecordedDates]=useState<string[]>([]);
  const mainRef=useRef<string|null>(null),linkedRef=useRef<string|null>(null),navigation=useRef(Promise.resolve());
  const scroll=useRef<HTMLDivElement>(null),flushers=useRef(new Map<string,{flush:()=>Promise<void>;protectedDraft:()=>boolean}>());
  const [mounted,setMounted]=useState([initial]),mountedRef=useRef([initial]),anchorRef=useRef(initial),pruning=useRef(false);
  const [heights,setHeights]=useState<Record<string,number>>({});
  const sessions=useMemo(()=>({
    register:(id:string,flush:()=>Promise<void>,protectedDraft:()=>boolean=()=>false)=>{flushers.current.set(id,{flush,protectedDraft});return()=>{flushers.current.delete(id);};},
    flush:async()=>{for(const entry of flushers.current.values())await entry.flush();},
    flushOne:async(id:string)=>{await flushers.current.get(id)?.flush();},
    protectedDraft:(id:string)=>flushers.current.get(id)?.protectedDraft()??true,
  }),[]);
  const fail=useCallback((reason:unknown)=>setError(reason instanceof Error?reason.message:String(reason)),[]);
  const setMain=useCallback((id:string|null)=>{
    mainRef.current=id;setMainNote(id);
    const url=new URL(window.location.href);
    if(id)url.searchParams.set('mainNote',id);else url.searchParams.delete('mainNote');
    if(url.href!==window.location.href)window.history.replaceState(null,'',url);
  },[]);
  const openNote=useCallback((id:string,promote=false)=>{
    // Serialize document replacement so rapid clicks cannot bypass a draft guard.
    const next=navigation.current.then(async()=>{
      if(promote){
        await sessions.flush();
        if(linkedRef.current===id){linkedRef.current=null;setLinkedNote(null);}
        setMain(id);
      }else{
        await sessions.flushOne('linked-note');
        setCollapsed(false);setMode('linked');
        // One live editor per note avoids two independent save queues in this window.
        if(mainRef.current===id){
          linkedRef.current=null;setLinkedNote(null);
          document.querySelector<HTMLElement>('.wp-main-note .tiptap')?.focus({preventScroll:true});
          return;
        }
        linkedRef.current=id;setLinkedNote(id);
      }
      setError('');
    });
    navigation.current=next.catch(()=>{});
    return next;
  },[sessions,setMain]);
  const dock=useMemo(()=>({openNote}),[openNote]);
  const closeLinked=useCallback(async()=>{
    await sessions.flushOne('linked-note');linkedRef.current=null;setLinkedNote(null);
    const url=new URL(window.location.href);url.searchParams.delete('note');window.history.replaceState(null,'',url);
  },[sessions]);
  const returnToWorkpad=useCallback(async()=>{await sessions.flushOne('main-note');setMain(null);},[sessions,setMain]);
  const prune=useCallback(async(keep:string[])=>{
    if(pruning.current)return;pruning.current=true;
    try{
      for(const date of [...mountedRef.current]){
        if(mountedRef.current.length<=9)break;
        const section=document.getElementById(`worklog-${date}`),viewport=scroll.current?.getBoundingClientRect(),rect=section?.getBoundingClientRect();
        const visible=rect&&viewport&&rect.bottom>viewport.top&&rect.top<viewport.bottom;
        if(keep.includes(date)||anchorRef.current===date||visible||sessions.protectedDraft(date))continue;
        try{await sessions.flushOne(date);}catch{continue;}
        if(sessions.protectedDraft(date)||anchorRef.current===date)continue;
        setHeights(current=>({...current,[date]:rect?.height||200}));
        mountedRef.current=mountedRef.current.filter(value=>value!==date);setMounted([...mountedRef.current]);
      }
    }finally{pruning.current=false;}
  },[sessions]);
  const addDates=useCallback((incoming:string[])=>{
    setDates(current=>[...new Set([...current,...incoming])].sort().reverse());
    mountedRef.current=[...new Set([...mountedRef.current,...incoming])];setMounted([...mountedRef.current]);
    requestAnimationFrame(()=>{void prune(incoming);});
  },[prune]);
  const jump=useCallback((date:string,block?:string)=>{
    anchorRef.current=date;addDates([date]);setAnchor(date);
    const url=new URL(window.location.href);url.searchParams.set('date',date);
    if(block)url.searchParams.set('block',block);else url.searchParams.delete('block');
    if(url.href!==window.location.href)window.history.replaceState(null,'',url);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const target=document.getElementById(block?`wp-${block}`:`worklog-${date}`);
      target?.scrollIntoView({block:'center'});
      if(block)target?.querySelector<HTMLElement>('.wp-text-input, textarea')?.focus({preventScroll:true});
    }));
  },[addDates]);
  const openDate=useCallback(async(date:string,block?:string)=>{await returnToWorkpad();jump(date,block);},[returnToWorkpad,jump]);
  const fromHistory=useCallback(async(href:string)=>{
    const url=new URL(href,window.location.origin),date=url.searchParams.get('date');
    if(validLocalDate(date))await openDate(date,url.searchParams.get('block')??undefined);
  },[openDate]);
  const requestedBlock=search.get('block'),requestedNote=search.get('note'),requestedMain=search.get('mainNote');
  useEffect(()=>{if(!validLocalDate(requested))return;const frame=requestAnimationFrame(()=>jump(requested,requestedBlock??undefined));return()=>cancelAnimationFrame(frame);},[requested,requestedBlock,jump]);
  useEffect(()=>{if(requestedMain&&requestedMain!==mainRef.current)void openNote(requestedMain,true).catch(fail);},[requestedMain,openNote,fail]);
  useEffect(()=>{if(requestedNote&&requestedNote!==linkedRef.current)void openNote(requestedNote).catch(fail);},[requestedNote,openNote,fail]);
  useEffect(()=>{
    workflowApi.recordedDates({before:initial}).then(rows=>addDates(rows.slice(0,2))).catch(fail);
    workflowApi.recordedDates().then(setRecordedDates).catch(fail);
    workflowApi.fixedTabs().then(rows=>{setTabs(rows);setActiveTab(rows[0]?.id??'');}).catch(fail);
  },[initial,addDates,fail]);
  async function recorded(direction:'before'|'after',expand=false){try{
    const boundary=expand?(direction==='before'?dates.at(-1)!:dates[0]):anchor;
    const rows=await workflowApi.recordedDates({[direction]:boundary});
    if(!rows.length)return;
    if(expand)addDates(rows.slice(0,3));else await openDate(rows[0]);
  }catch(e){fail(e);}}
  async function createTab(){try{const tab=await workflowApi.saveFixed(null,{title:`Workflow ${tabs.length+1}`,revision:0,blocks:[]});setTabs([...tabs,tab]);setActiveTab(tab.id);setCollapsed(false);}catch(e){fail(e);}}
  const fallbackDates=[...new Set([anchor,...recordedDates,...dates])].sort().reverse();
  return <WorkpadSessions.Provider value={sessions}><WorkpadDock.Provider value={dock}>
    <div className={`wp-stream-layout ${collapsed?'wp-fixed-collapsed':''}`}>
      <section className="wp-date-stream">
        <nav className="wp-stream-nav">
          <button onClick={()=>void openDate(today()).catch(fail)}>Today</button>
          <button onClick={()=>void recorded('before')}>Previous recorded</button>
          <button onClick={()=>void recorded('after')}>Next recorded</button>
          <input aria-label="Jump to worklog date" type="date" value={anchor} onChange={e=>{if(validLocalDate(e.target.value))void openDate(e.target.value).catch(fail);}}/>
          <button onClick={()=>setCollapsed(!collapsed)}>{collapsed?'Show':'Hide'} Right Dock</button>
          {mainNote&&<button onClick={()=>void returnToWorkpad().catch(fail)}>← Workpad {dateLabel(anchor)}</button>}
        </nav>
        {error&&<p role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></p>}
        <div className="wp-stream-scroll" ref={scroll} hidden={!!mainNote}>
          <button className="wp-load-dates" onClick={()=>void recorded('after',true)}>Load newer recorded dates</button>
          {dates.map(date=><section key={date} id={`worklog-${date}`} style={mounted.includes(date)?undefined:{height:heights[date]??200}} onFocusCapture={()=>{anchorRef.current=date;setAnchor(date);}}>
            {mounted.includes(date)?<Today embeddedDate={date} onJump={jump}/>:<button className="wp-load-date" onClick={()=>jump(date)}>{dateLabel(date)} · Open worklog</button>}
          </section>)}
          <button className="wp-load-dates" onClick={()=>void recorded('before',true)}>Load earlier recorded dates</button>
        </div>
        {mainNote&&<div className="wp-main-note-scroll"><TopicNotePanel key={mainNote} id={mainNote} main onClose={returnToWorkpad} onNavigate={fromHistory}/></div>}
      </section>
      <aside className="wp-fixed-panel wp-right-dock" aria-label="Right Dock" hidden={collapsed}>
        <div role="tablist" aria-label="Right Dock modes" className="wp-dock-modes">
          {([['routine','Fixed Routine'],['shortcuts','Shortcuts'],['linked','Linked Note']] as const).map(([value,label])=><button key={value} id={`dock-tab-${value}`} role="tab" aria-controls={`dock-panel-${value}`} aria-selected={mode===value} onMouseDown={e=>e.preventDefault()} onClick={()=>setMode(value)}>{label}</button>)}
        </div>
        <div className="wp-dock-pane wp-routine-pane" id="dock-panel-routine" role="tabpanel" aria-labelledby="dock-tab-routine" hidden={mode!=='routine'}>
          <header><h2>Fixed Routine</h2><button disabled={tabs.length>=5} onClick={()=>void createTab()}>+ Tab</button></header>
          <div role="tablist" aria-label="Fixed workflows">{tabs.map(tab=><button key={tab.id} id={`fixed-tab-${tab.id}`} role="tab" aria-controls={`fixed-panel-${tab.id}`} aria-selected={tab.id===activeTab} onMouseDown={e=>e.preventDefault()} onClick={()=>setActiveTab(tab.id)}>{tab.title}</button>)}</div>
          {tabs.map(tab=><div key={tab.id} id={`fixed-panel-${tab.id}`} className="wp-fixed-scroll" role="tabpanel" aria-labelledby={`fixed-tab-${tab.id}`} tabIndex={0} hidden={tab.id!==activeTab}><Today fixedTab={tab} onFixedTitle={title=>setTabs(current=>current.map(value=>value.id===tab.id?{...value,title}:value))}/></div>)}
          {!tabs.length&&<p className="wp-dock-empty">Create a reusable routine. Up to five tabs.</p>}
        </div>
        <div className="wp-dock-pane wp-fixed-scroll wp-shortcuts" id="dock-panel-shortcuts" role="tabpanel" aria-labelledby="dock-tab-shortcuts" tabIndex={0} hidden={mode!=='shortcuts'}>
          <h2>Workpad 단축키</h2><p>본문에서는 텍스트를 선택하고, 핸들로는 블록을 선택합니다. Mac에서는 Ctrl 대신 ⌘를 사용하세요.</p>
          {WORKPAD_SHORTCUTS.map(group=><section key={group.group}><h3>{group.group}</h3><dl>{group.items.map(([keys,description])=><div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>)}</dl></section>)}
        </div>
        <div className="wp-dock-pane wp-fixed-scroll" id="dock-panel-linked" role="tabpanel" aria-labelledby="dock-tab-linked" tabIndex={0} hidden={mode!=='linked'}>
          {linkedNote?<TopicNotePanel key={linkedNote} id={linkedNote} onClose={closeLinked} onNavigate={fromHistory}/>:<section className="wp-dock-dates"><h2>Daily Workpads</h2><p>Open a note link to edit it here, or return to a daily Workpad.</p>{fallbackDates.map(date=><button key={date} onClick={()=>void openDate(date).catch(fail)}><time>{dateLabel(date)}</time>{date===today()&&<span>Today</span>}</button>)}</section>}
        </div>
      </aside>
    </div>
  </WorkpadDock.Provider></WorkpadSessions.Provider>;
}
