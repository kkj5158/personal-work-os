"use client";
import { useEffect, useState } from 'react';
import { useGlobalTabs, useShellNavigationGuard } from '@/components/GlobalTabs';
import { useWorkpadSessions } from "./WorkpadSessions";
import { workflowApi, type TopicNote, type WorklogBacklink } from '@/lib/api/workflow';

export function WorklogHistory({id}:{id:string}) {
  const [rows,setRows]=useState<WorklogBacklink[]>([]),[error,setError]=useState('');
  const shell=useGlobalTabs();
  useEffect(()=>{let live=true;workflowApi.backlinks(id).then(r=>{if(live)setRows(r);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[id]);
  return <section className="wp-history"><h3>WORK FLOW history</h3>{error&&<p role="alert">{error}</p>}{rows.map((row,i)=><button key={`${row.blockId}-${i}`} onClick={()=>shell?.navigate(`/workflow/today?date=${row.date}&block=${row.blockId}`)}><time>{row.date}</time><span>{row.excerpt}</span></button>)}{!rows.length&&!error&&<p>No linked worklog entries.</p>}</section>;
}
export default function TopicNotePanel({id,onClose}:{id:string;onClose:()=>void}) {
  const [note,setNote]=useState<TopicNote|null>(null),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
  const shell=useGlobalTabs(),sessions=useWorkpadSessions();
  useEffect(()=>{let live=true;workflowApi.getNote(id).then(n=>{if(live)setNote(n);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[id]);
  async function save(){if(!note||!dirty)return;setBusy(true);try{const saved=await workflowApi.saveNote(note);setNote(saved);setDirty(false);setError('');}catch(e){setError(String(e));throw e;}finally{setBusy(false);}}
  useShellNavigationGuard(async proceed=>{if(busy)return;try{await save();await sessions?.flush();proceed();}catch{/* Preserve draft. */}});
  return <div className="wp-topic-shade"><section className="wp-topic" role="dialog" aria-modal="true" aria-label="Topic note"><header><h2>{note?.scope??'Topic note'}</h2><button disabled={busy} onClick={()=>void save().then(onClose).catch(()=>{})}>Close</button></header>{error&&<p role="alert">{error}</p>}{note&&<><input aria-label="Note title" value={note.title} readOnly={!!note.workspaceId} disabled={busy} onChange={e=>{setNote({...note,title:e.target.value});setDirty(true);}}/><textarea aria-label="Note content" value={note.content} readOnly={!!note.workspaceId} disabled={busy} onChange={e=>{setNote({...note,content:e.target.value});setDirty(true);}}/>{note.workspaceId?<button onClick={()=>shell?.navigate(`/notes?workspace=${note.workspaceId}&note=${note.id}`)}>Edit in NOTE SYS ↗</button>:<button disabled={busy||!dirty} onClick={()=>void save().catch(()=>{})}>{busy?'Saving…':dirty?'Save note':'Saved'}</button>}<WorklogHistory id={id}/></>}</section></div>;
}
