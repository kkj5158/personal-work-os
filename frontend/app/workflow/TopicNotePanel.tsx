"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalTabs, useShellNavigationGuard } from '@/components/GlobalTabs';
import { NoteEditor, type NoteEditorSource } from '@/app/notes/editor/NoteEditor';
import { NoteContext } from '@/app/notes/NoteContext';
import { DEFAULT_SETTINGS, type Note } from '@/lib/notes/types';
import { useWorkpadSessions } from './WorkpadSessions';
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

function TopicEditor({note,onOpen,onClose}:{note:TopicNote;onOpen:(note:TopicNote)=>Promise<void>;onClose:()=>void}) {
  const [error,setError]=useState(''),[choices,setChoices]=useState<TopicNote[]>([]);
  const handles=useRef(new Map<string,{flush:()=>Promise<void>;dirty:()=>boolean}>());
  const shell=useGlobalTabs(),sessions=useWorkpadSessions();
  const flush=useCallback(async()=>{for(const entry of handles.current.values())await entry.flush();},[]);
  const dirty=useCallback(()=>[...handles.current.values()].some(entry=>entry.dirty()),[]);
  const fail=useCallback((e:unknown)=>setError(e instanceof Error?e.message:String(e)),[]);
  const openWiki=useCallback(async(title:string)=>{
    try{await flush();const notes=await workflowApi.resolveNote(title);if(notes.length===1)await onOpen(notes[0]);else setChoices(notes);}
    catch(e){fail(e);}
  },[flush,onOpen,fail]);
  const source:NoteEditorSource={
    save:async n=>topicEditorNote(await workflowApi.saveNote({...note,title:n.title,content:n.content,version:n.version})),
    rename:async(n,title)=>topicEditorNote(await workflowApi.saveNote({...note,title,content:n.content,version:n.version})),
    suggestions:async q=>(await workflowApi.searchNotes(q)).map(n=>({id:n.id,type:'NOTE',title:n.title,excerpt:n.scope})),
    href:'/workflow/today?note='+note.id,
  };
  const env=useMemo(()=>({workspace:'',settings:{...DEFAULT_SETTINGS,imagePaste:false},openWiki:(title:string)=>void openWiki(title),error:fail,
    register:(id:string,save:()=>Promise<void>,isDirty:()=>boolean)=>{handles.current.set(id,{flush:save,dirty:isDirty});return()=>{handles.current.delete(id);};},changed:()=>{},
  }),[openWiki,fail]);
  useShellNavigationGuard(async proceed=>{try{await flush();await sessions?.flush();proceed();}catch(e){fail(e);}});
  useEffect(()=>sessions?.register('note:'+note.id,flush,dirty),[sessions,note.id,flush,dirty]);
  useEffect(()=>{
    const blur=()=>{void flush().catch(fail);};
    const unload=(event:BeforeUnloadEvent)=>{if(dirty()){event.preventDefault();void flush().catch(fail);}};
    window.addEventListener('blur',blur);window.addEventListener('beforeunload',unload);
    return()=>{window.removeEventListener('blur',blur);window.removeEventListener('beforeunload',unload);};
  },[flush,dirty,fail]);
  async function leave(href?:string){try{await flush();await sessions?.flush();onClose();if(href)shell?.navigate(href);}catch(e){fail(e);}}
  return <><header><h2>{note.scope}</h2><button onClick={()=>void leave()}>Close</button></header>
    {error&&<p role="alert">{error}</p>}
    {!!choices.length&&<div role="dialog" aria-label="Choose a note">{choices.map(n=><button key={n.id} onClick={()=>void onOpen(n).catch(fail)}>{n.title} · {n.scope} · {n.id.slice(0,6)}</button>)}<button onClick={()=>setChoices([])}>Cancel</button></div>}
    <NoteContext.Provider value={env}><NoteEditor initial={topicEditorNote(note)} source={source} bodyLabel="Note content"/></NoteContext.Provider>
    <WorklogHistory id={note.id} onNavigate={href=>void leave(href)}/>
  </>;
}

export default function TopicNotePanel({id,onClose}:{id:string;onClose:()=>void}) {
  const [note,setNote]=useState<TopicNote|null>(null),[error,setError]=useState('');
  const shell=useGlobalTabs(),sessions=useWorkpadSessions();
  const open=useCallback(async(n:TopicNote)=>{
    if(n.workspaceId){await sessions?.flush();shell?.navigate('/notes?workspace='+n.workspaceId+'&note='+n.id);onClose();}
    else {setNote(n);setError('');}
  },[sessions,shell,onClose]);
  useEffect(()=>{let live=true;workflowApi.getNote(id).then(n=>{if(live)setNote(n);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[id]);
  return <div className="wp-topic-shade"><section className="wp-topic" role="dialog" aria-modal="true" aria-label="Topic note">
    {error?<><button onClick={onClose}>Close</button><p role="alert">{error}</p></>:note?.workspaceId?<><header><h2>{note.title}</h2><button onClick={onClose}>Close</button></header><button onClick={()=>void open(note)}>Open source in NOTE SYS ↗</button><WorklogHistory id={id}/></>:note?<TopicEditor key={note.id} note={note} onOpen={open} onClose={onClose}/>:<p>Loading note…</p>}
  </section></div>;
}
