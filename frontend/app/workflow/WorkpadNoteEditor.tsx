'use client';
import {useCallback,useLayoutEffect,useRef} from 'react';
import Today,{type EditorDay,type WorkpadDocumentSource} from './Today';
import {WorkflowEditorProvider} from './WorkflowContext';
import {notesApi} from '@/lib/api/notes';
import type {Note} from '@/lib/notes/types';
import type {NoteEditorSource} from '@/app/notes/editor/NoteEditor';
import {readNoteBlocks,writeNoteBlocks} from '@/lib/workflow/noteDocument';

export function WorkpadNoteEditor({initial,source,slot='note:'+initial.id,bodyLabel='Linked note content',register,onSaved}:{initial:Note;source?:NoteEditorSource;slot?:string;bodyLabel?:string;register?:WorkpadDocumentSource['register'];onSaved?:(note:Note)=>void}) {
  const latest=useRef(initial),options=useRef({source,onSaved});
  useLayoutEffect(()=>{options.current={source,onSaved};});
  const day=useCallback((note:Note):EditorDay=>{
    const blocks=readNoteBlocks(note.content,note.id);latest.current=note;
    return {date:'2000-01-01',title:note.title,revision:note.version,blocks};
  },[]);
  const load=useCallback(async()=>day(options.current.source?.load?await options.current.source.load():await notesApi.note(initial.workspaceId,initial.id)),[day,initial.id,initial.workspaceId]);
  const save=useCallback(async(input:Parameters<WorkpadDocumentSource['save']>[0])=>{
    const old=latest.current,content=writeNoteBlocks(input.blocks);
    let saved:Note;
    if(options.current.source) saved=await options.current.source.save({...old,title:input.title,content,version:input.revision});
    else {
      // NOTE SYS rename owns alias/reservation semantics. Keep the acknowledged
      // version if a subsequent body save fails; the shared editor retains draft.
      let current={...old,version:input.revision};
      if(input.title!==current.title){current=await notesApi.rename(old.workspaceId,current,input.title);latest.current=current;}
      const result=await notesApi.save(old.workspaceId,{...current,content});
      if(!result)throw new Error('The note could not be saved. Your draft is retained.');
      saved=result;
    }
    const result=day(saved);options.current.onSaved?.(saved);return result;
  },[day]);
  const loadImage=useCallback((id:string)=>initial.workspaceId?notesApi.media(initial.workspaceId,id):import('@/lib/api/workflow').then(({workflowApi})=>workflowApi.getImage(id)),[initial.workspaceId]);
  const uploadImage=useCallback((file:File)=>initial.workspaceId?notesApi.upload(initial.workspaceId,file):import('@/lib/api/workflow').then(({workflowApi})=>workflowApi.uploadImage(file)),[initial.workspaceId]);
  const documentSource:WorkpadDocumentSource={id:initial.id,title:initial.title,slot,bodyLabel,load,save,register,loadImage,uploadImage};
  return <WorkflowEditorProvider><Today key={initial.id} documentSource={documentSource}/></WorkflowEditorProvider>;
}
