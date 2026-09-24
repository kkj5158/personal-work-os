"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalTabs, useShellNavigationGuard } from '@/components/GlobalTabs';
import { NoteEditor, type NoteEditorSource } from '@/app/notes/editor/NoteEditor';
import { NoteContext } from '@/app/notes/NoteContext';
import { DEFAULT_SETTINGS, type Note } from '@/lib/notes/types';
import { notesApi } from '@/lib/api/notes';
import { useWorkpadSessions } from './WorkpadSessions';
import { useWorkpadDock } from './WorkpadDock';
import { workflowApi, type TopicNote, type WorklogBacklink } from '@/lib/api/workflow';
import '@/app/notes/notes.css';
import './topic-note.css';

export function WorklogHistory({id,onNavigate}:{id:string;onNavigate?:(href:string)=>void}) {
  const [rows,setRows]=useState<WorklogBacklink[]>([]),[error,setError]=useState('');
  const shell=useGlobalTabs();
  useEffect(()=>{
    let live=true;
    const refresh=()=>workflowApi.backlinks(id).then(r=>{if(live){setRows(r);setError('');}}).catch(e=>{if(live){setRows([]);setError(String(e));}});
    void refresh(); window.addEventListener('focus',refresh);
    return()=>{live=false;window.removeEventListener('focus',refresh);};
  },[id]);
  const unique=rows.filter((row,index)=>rows.findIndex(other=>other.date===row.date&&other.blockId===row.blockId)===index);
  return <section className="wp-history"><h3>WORK FLOW history</h3>{error&&<p role="alert">{error}</p>}{unique.map(row=><button key={row.date+'-'+row.blockId} onClick={()=>{
    const href='/workflow/today?date='+row.date+'&block='+row.blockId;
    if(onNavigate)onNavigate(href);else shell?.navigate(href);
  }}><time>{row.date}</time><span>{row.excerpt}</span></button>)}{!unique.length&&!error&&<p>No linked worklog entries.</p>}</section>;
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
      <NoteContext.Provider value={env}><NoteEditor initial={initial} source={source} bodyLabel={main?'Main note content':'Linked note content'}/></NoteContext.Provider>
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
