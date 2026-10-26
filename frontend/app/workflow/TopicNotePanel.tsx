"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalTabs, useShellNavigationGuard } from '@/components/GlobalTabs';
import { type NoteEditorSource } from '@/app/notes/editor/NoteEditor';
import {WorkpadNoteEditor} from './WorkpadNoteEditor';
import { NoteContext } from '@/app/notes/NoteContext';
import { DEFAULT_SETTINGS, type Note } from '@/lib/notes/types';
import { notesApi } from '@/lib/api/notes';
import { useWorkpadSessions } from './WorkpadSessions';
import { useWorkpadDock } from './WorkpadDock';
import { workflowApi, type TopicNote, type WorklogBacklink, type BacklinkContext } from '@/lib/api/workflow';
import '@/app/notes/notes.css';
import './topic-note.css';
import {subscribeEntityChanges} from '@/lib/windowSync';
import {textStyle} from '@/lib/workflow/workpad';

function BacklinkOccurrence({id,row,onNavigate,initialOpen=false}:{id:string;row:WorklogBacklink;onNavigate:(href:string)=>void;initialOpen?:boolean}) {
  const [context,setContext]=useState<BacklinkContext|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const busy=useRef(false),live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const load=useCallback(async(offset=0)=>{
    if(busy.current)return;busy.current=true;setLoading(true);
    try{const next=await workflowApi.backlinkContext(id,row.date,row.blockId,offset);if(live.current){setContext(current=>({...next,blocks:offset?[...(current?.blocks??[]),...next.blocks]:next.blocks}));setError('');}}
    catch(e){if(live.current)setError(String(e));}finally{busy.current=false;if(live.current)setLoading(false);}
  },[id,row.date,row.blockId]);
  useEffect(()=>{if(initialOpen)queueMicrotask(()=>void load());},[initialOpen,load]);
  const href='/workflow/today?date='+row.date+'&block='+row.blockId;
  return <details className="wp-backlink" open={initialOpen} onToggle={e=>{if(e.currentTarget.open&&!context&&!busy.current)void load();}}>
    <summary>{row.excerpt}</summary>
    {loading&&!context&&<p role="status">Loading source blocks…</p>}
    {error&&<p role="alert">{error}<button onClick={()=>void load()}>Retry</button></p>}
    {context&&<div className="wp-backlink-context" aria-label="Source block context">{context.blocks.map(({block,depth})=><div key={block.id} className={`wp-backlink-row wp-${textStyle(block).toLowerCase()} ${block.checked?'wp-checked':''} ${block.metadata.strike?'wp-strike':''}`} style={{paddingLeft:Math.min(depth,12)*20}}>
      <span aria-hidden="true">{block.type==='CHECKLIST'?(block.checked?'☑':'☐'):block.type==='BULLET'?'•':block.type==='NUMBERED'?'1.':block.type==='DIVIDER'?'—':''}</span><span>{block.content}{block.metadata.images?.map(image=><span key={image.id}> [Image: {image.caption||'attachment'}]</span>)}</span>
    </div>)}</div>}
    {context&&context.blocks.length<context.total&&<button disabled={loading} onClick={()=>void load(context.blocks.length)}>Load more source blocks ({context.total-context.blocks.length})</button>}
    <button className="wp-backlink-open" onClick={()=>onNavigate(href)}>Open source block ↗</button>
  </details>;
}
export function WorklogHistory({id,onNavigate}:{id:string;onNavigate?:(href:string)=>void}) {
  const [rows,setRows]=useState<WorklogBacklink[]>([]),[error,setError]=useState(''),[more,setMore]=useState(false),[generation,setGeneration]=useState(0),[loading,setLoading]=useState(false);
  const shell=useGlobalTabs(),sequence=useRef(0),busy=useRef(false);
  const refresh=useCallback(async()=>{
    const request=++sequence.current;
    try{const next=await workflowApi.backlinks(id);if(request===sequence.current){setRows(next);setMore(next.length===50);setGeneration(value=>value+1);setError('');}}
    catch(e){if(request===sequence.current)setError(String(e));}
  },[id]);
  useEffect(()=>{
    queueMicrotask(()=>void refresh());window.addEventListener('focus',refresh);
    const off=subscribeEntityChanges(event=>{if(event.entityType==='workpad')void refresh();});
    return()=>{sequence.current++;window.removeEventListener('focus',refresh);off();};
  },[refresh]);
  async function loadMore(){
    if(busy.current)return;busy.current=true;setLoading(true);const request=sequence.current;
    try{const next=await workflowApi.backlinks(id,rows.length);if(request===sequence.current){setRows(current=>[...current,...next]);setMore(next.length===50);setError('');}}
    catch(e){setError(String(e));}finally{busy.current=false;setLoading(false);}
  }
  const unique=rows.filter((row,index)=>rows.findIndex(other=>other.date===row.date&&other.blockId===row.blockId)===index);
  const dates=[...new Set(unique.map(row=>row.date))];
  const navigate=(href:string)=>{if(onNavigate)onNavigate(href);else shell?.navigate(href);};
  return <section className="wp-history"><h3>WORK FLOW history</h3>{error&&<p role="alert">{error}<button onClick={()=>void refresh()}>Refresh history</button></p>}{dates.map(date=><section className="wp-history-date" key={date}><button onClick={()=>navigate('/workflow/today?date='+date)}><time>{date}</time></button>{unique.filter(row=>row.date===date).map(row=><BacklinkOccurrence key={row.blockId+':'+generation} id={id} row={row} initialOpen={row===unique[0]} onNavigate={navigate}/>)}</section>)}{more&&<button disabled={loading} onClick={()=>void loadMore()}>Load earlier references</button>}{!unique.length&&!error&&<p>No linked worklog entries.</p>}</section>;
}

/** View adapter only: canonical Topics retain null workspaceId on every API write. */
export function topicEditorNote(note:TopicNote):Note {
  return {...note,workspaceId:note.workspaceId??'',type:'NOTE',journalDate:null,pinnedAt:null,deletedAt:null,createdAt:'',updatedAt:'',aliases:[],tags:[]};
}

type EditorProps = {
  note: TopicNote;
  initial: Note;
  slot: string;
  main: boolean;
  onOpen: (note: TopicNote, promote: boolean) => Promise<void>;
  onClose: () => void | Promise<void>;
  onNavigate?: (href: string) => void | Promise<void>;
};

function TopicEditor({note,initial,slot,main,onOpen,onClose,onNavigate}:EditorProps) {
  const [error,setError]=useState(''),[choices,setChoices]=useState<{notes:TopicNote[];promote:boolean}|null>(null);
  const handles=useRef(new Map<string,{flush:()=>Promise<void>;dirty:()=>boolean}>());
  const shell=useGlobalTabs(),sessions=useWorkpadSessions(),dock=useWorkpadDock();
  const flush=useCallback(async()=>{for(const entry of handles.current.values())await entry.flush();},[]);
  const dirty=useCallback(()=>[...handles.current.values()].some(entry=>entry.dirty()),[]);
  const fail=useCallback((e:unknown)=>setError(e instanceof Error?e.message:String(e)),[]);
  const open=useCallback(async(target:TopicNote,promote=false)=>{
    // Always flush after asynchronous resolution: the user may have typed while it ran.
    await flush();await onOpen(target,promote);setChoices(null);
  },[flush,onOpen]);
  const openWiki=useCallback(async(title:string,promote=false)=>{
    try{
      const notes=await workflowApi.resolveNote(title);
      if(notes.length===1)await open(notes[0],promote);else setChoices({notes,promote});
    }catch(e){fail(e);}
  },[open,fail]);
  const topicSource:NoteEditorSource & {load:()=>Promise<Note>}={
    load:async()=>topicEditorNote(await workflowApi.getNote(note.id)),
    save:async n=>topicEditorNote(await workflowApi.saveNote({...note,title:n.title,content:n.content,version:n.version})),
    rename:async(n,title)=>topicEditorNote(await workflowApi.saveNote({...note,title,content:n.content,version:n.version})),
    suggestions:async q=>(await workflowApi.searchNotes(q)).map(n=>({id:n.id,type:'NOTE',title:n.title,excerpt:n.scope})),
    href:'/workflow/today?note='+note.id,
  };
  const source=note.workspaceId?undefined:topicSource;
  const env=useMemo(()=>({workspace:initial.workspaceId,settings:{...DEFAULT_SETTINGS,imagePaste:!!note.workspaceId},openWiki:(title:string)=>void openWiki(title),error:fail,
    register:(id:string,save:()=>Promise<void>,isDirty:()=>boolean)=>{handles.current.set(id,{flush:save,dirty:isDirty});return()=>{handles.current.delete(id);};},changed:()=>{},
  }),[initial.workspaceId,note.workspaceId,openWiki,fail]);
  useShellNavigationGuard(async proceed=>{try{await flush();await sessions?.flush();proceed();}catch(e){fail(e);}});
  useEffect(()=>sessions?.register(slot,flush,dirty),[sessions,slot,flush,dirty]);
  useEffect(()=>{
    const blur=()=>{void flush().catch(fail);};
    const unload=(event:BeforeUnloadEvent)=>{if(dirty()){event.preventDefault();void flush().catch(fail);}};
    window.addEventListener('blur',blur);window.addEventListener('beforeunload',unload);
    return()=>{window.removeEventListener('blur',blur);window.removeEventListener('beforeunload',unload);};
  },[flush,dirty,fail]);
  async function leave(href?:string){try{
    await flush();
    if(href){if(onNavigate)await onNavigate(href);else {await sessions?.flush();shell?.navigate(href);}}
    else await onClose();
  }catch(e){fail(e);}}
  const register=useCallback((save:()=>Promise<void>,isDirty:()=>boolean)=>env.register(initial.id,save,isDirty),[env,initial.id]);
  return <><header><h2>{note.scope}</h2><div className="wp-note-actions">{dock&&!main&&<button onClick={()=>void open(note,true).catch(fail)}>Open as main ↗</button>}<button onClick={()=>void leave()}>{main?'Back to Workpad':'Close'}</button></div></header>
    {error&&<p role="alert">{error}</p>}
    {choices&&<div className="wp-note-choices" role="group" aria-label="Choose a note">{choices.notes.map(n=><button key={n.id} onClick={()=>void open(n,choices.promote).catch(fail)}>{n.title} · {n.scope} · {n.id.slice(0,6)}</button>)}<button onClick={()=>setChoices(null)}>Cancel</button></div>}
    <div onMouseDownCapture={event=>{if((event.target as HTMLElement).closest('[data-wiki-title]'))event.preventDefault();}}
      onClickCapture={event=>{
        const link=(event.target as HTMLElement).closest<HTMLElement>('[data-wiki-title]');
        if(!link)return;
        event.preventDefault();event.stopPropagation();
        void openWiki(link.dataset.wikiTitle!,event.ctrlKey||event.metaKey);
      }}>
      <NoteContext.Provider value={env}><WorkpadNoteEditor initial={initial} source={source} slot={slot} register={register} bodyLabel={main?'Main note content':'Linked note content'}/></NoteContext.Provider>
    </div>
    <WorklogHistory id={note.id} onNavigate={href=>void leave(href)}/>
  </>;
}

export default function TopicNotePanel({id,onClose,main=false,slot=main?'main-note':'linked-note',onNavigate}:{
  id:string;onClose:()=>void|Promise<void>;main?:boolean;slot?:string;onNavigate?:(href:string)=>void|Promise<void>;
}) {
  const [loaded,setLoaded]=useState<{note:TopicNote;initial:Note}|null>(null),[error,setError]=useState('');
  const dock=useWorkpadDock();
  const load=useCallback(async(note:TopicNote)=>({note,initial:note.workspaceId?await notesApi.note(note.workspaceId,note.id):topicEditorNote(note)}),[]);
  const open=useCallback(async(note:TopicNote,promote:boolean)=>{
    if(dock)await dock.openNote(note.id,promote);
    else {setLoaded(await load(note));setError('');}
  },[dock,load]);
  useEffect(()=>{
    let live=true;
    workflowApi.getNote(id).then(load).then(value=>{if(live){setLoaded(value);setError('');}}).catch(e=>{if(live)setError(String(e));});
    return()=>{live=false;};
  },[id,load]);
  return <section className={`wp-topic wp-note-panel ${main?'wp-main-note':''}`} aria-label={main?'Main note':'Linked note'}>
    {loaded?<TopicEditor key={loaded.note.id} note={loaded.note} initial={loaded.initial} slot={slot} main={main} onOpen={open} onClose={onClose} onNavigate={onNavigate}/>:error?<><button onClick={()=>void onClose()}>Close</button><p role="alert">{error}</p></>:<p>Loading note…</p>}
  </section>;
}
