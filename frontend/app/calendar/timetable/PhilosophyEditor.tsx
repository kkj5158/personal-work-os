"use client";
import { useMemo, useState } from "react";
import { NoteEditor, type NoteEditorSource } from "@/app/notes/editor/NoteEditor";
import type { Note } from "@/lib/notes/types";
import { timetablesApi, type Philosophy, type Timetable } from "@/lib/api/timetables";

export function PhilosophyEditor({timetable,initial,owner}:{timetable:Timetable;initial:Philosophy;owner:string}) {
  // The component is keyed by timetable ID and remains mounted while hidden.
  // A's queue, latest version and response can never become B's editor state.
  const [note]=useState<Note>(()=>({id:timetable.id,workspaceId:`timetable:${owner}`,title:"운영 철학",content:initial.content,version:initial.version,type:"NOTE",journalDate:null,pinnedAt:null,deletedAt:null,createdAt:timetable.createdAt,updatedAt:initial.updatedAt,aliases:[],tags:[]}));
  const source=useMemo<NoteEditorSource>(()=>{
    const adapt=(p:Philosophy):Note=>({...note,content:p.content,version:p.version,updatedAt:p.updatedAt});
    return {load:async()=>adapt(await timetablesApi.philosophy(timetable.id)),save:async n=>adapt(await timetablesApi.savePhilosophy(timetable.id,{content:n.content,version:n.version})),rename:async n=>n,suggestions:async()=>[],href:`/calendar?tab=timetable&timetable=${timetable.id}`};
  },[note,timetable.id]);
  return <NoteEditor initial={note} compact source={source} bodyLabel={`${timetable.title} 운영 철학 본문`}/>;
}
