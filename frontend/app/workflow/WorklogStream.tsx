"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { workflowApi, type FixedTab } from '@/lib/api/workflow';
import { today, dateLabel } from '@/lib/notes/model';
import { validLocalDate } from '@/lib/localDateBridge';
import Today from './Today';
import TopicNotePanel from './TopicNotePanel';
import { WorkpadSessions } from './WorkpadSessions';

export default function WorklogStream(){
  const search=useSearchParams(),requested=search.get('date');
  const initial=validLocalDate(requested)?requested:today();
  const [dates,setDates]=useState<string[]>([initial]),[anchor,setAnchor]=useState(initial),[tabs,setTabs]=useState<FixedTab[]>([]),[activeTab,setActiveTab]=useState(''),[collapsed,setCollapsed]=useState(false),[error,setError]=useState('');
  const scroll=useRef<HTMLDivElement>(null),flushers=useRef(new Map<string,{flush:()=>Promise<void>;protectedDraft:()=>boolean}>());
  const [mounted,setMounted]=useState([initial]),mountedRef=useRef([initial]),anchorRef=useRef(initial),pruning=useRef(false);
  const [heights,setHeights]=useState<Record<string,number>>({});
  const sessions=useMemo(()=>({
    register:(id:string,flush:()=>Promise<void>,protectedDraft:()=>boolean=()=>false)=>{flushers.current.set(id,{flush,protectedDraft});return()=>{flushers.current.delete(id);};},
    flush:async()=>{for(const entry of flushers.current.values())await entry.flush();},
    flushOne:async(id:string)=>{await flushers.current.get(id)?.flush();},
    protectedDraft:(id:string)=>flushers.current.get(id)?.protectedDraft()??true,
  }),[]);
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
      if(block)target?.querySelector<HTMLTextAreaElement>('textarea')?.focus({preventScroll:true});
    }));
  },[addDates]);
  useEffect(()=>{if(!validLocalDate(requested))return;const frame=requestAnimationFrame(()=>jump(requested,search.get('block')??undefined));return()=>cancelAnimationFrame(frame);},[requested,search,jump]);
  useEffect(()=>{workflowApi.recordedDates({before:initial}).then(rows=>addDates(rows.slice(0,2))).catch(e=>setError(String(e)));workflowApi.fixedTabs().then(rows=>{setTabs(rows);setActiveTab(rows[0]?.id??'');}).catch(e=>setError(String(e)));},[initial,addDates]);
  async function recorded(direction:'before'|'after',expand=false){try{
    const boundary=expand?(direction==='before'?dates.at(-1)!:dates[0]):anchor;
    const rows=await workflowApi.recordedDates({[direction]:boundary});
    if(!rows.length)return;
    if(expand)addDates(rows.slice(0,3));else jump(rows[0]);
  }catch(e){setError(String(e));}}
  async function createTab(){try{const tab=await workflowApi.saveFixed(null,{title:`Workflow ${tabs.length+1}`,revision:0,blocks:[]});setTabs([...tabs,tab]);setActiveTab(tab.id);setCollapsed(false);}catch(e){setError(String(e));}}
  return <WorkpadSessions.Provider value={sessions}><div className={`wp-stream-layout ${collapsed?'wp-fixed-collapsed':''}`}><section className="wp-date-stream"><nav className="wp-stream-nav"><button onClick={()=>jump(today())}>Today</button><button onClick={()=>void recorded('before')}>Previous recorded</button><button onClick={()=>void recorded('after')}>Next recorded</button><input aria-label="Jump to worklog date" type="date" value={anchor} onChange={e=>{if(validLocalDate(e.target.value))jump(e.target.value);}}/><button onClick={()=>setCollapsed(!collapsed)}>{collapsed?'Show':'Hide'} Fixed Workflow</button></nav>{error&&<p role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></p>}<div className="wp-stream-scroll" ref={scroll}><button className="wp-load-dates" onClick={()=>void recorded('after',true)}>Load newer recorded dates</button>{dates.map(date=><section key={date} id={`worklog-${date}`} style={mounted.includes(date)?undefined:{height:heights[date]??200}} onFocusCapture={()=>{anchorRef.current=date;setAnchor(date);}}>{mounted.includes(date)?<Today embeddedDate={date} onJump={jump}/>:<button className="wp-load-date" onClick={()=>jump(date)}>{dateLabel(date)} · Open worklog</button>}</section>)}<button className="wp-load-dates" onClick={()=>void recorded('before',true)}>Load earlier recorded dates</button></div></section><aside className="wp-fixed-panel" hidden={collapsed}><header><h2>Fixed Workflow</h2><button disabled={tabs.length>=5} onClick={()=>void createTab()}>+ Tab</button></header><div role="tablist" aria-label="Fixed workflows">{tabs.map(tab=><button key={tab.id} role="tab" aria-selected={tab.id===activeTab} onClick={()=>setActiveTab(tab.id)}>{tab.title}</button>)}</div>{tabs.map(tab=><div key={tab.id} hidden={tab.id!==activeTab}><Today fixedTab={tab} onFixedTitle={title=>setTabs(current=>current.map(value=>value.id===tab.id?{...value,title}:value))}/></div>)}{!tabs.length&&<p>Create a reusable workflow. Up to five tabs.</p>}</aside></div>{search.get('note')&&<TopicNotePanel id={search.get('note')!} onClose={()=>{const url=new URL(window.location.href);url.searchParams.delete('note');window.history.replaceState(null,'' ,url);}}/>}</WorkpadSessions.Provider>;
}
