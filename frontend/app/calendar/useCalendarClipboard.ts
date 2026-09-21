"use client";
import { useEffect,useRef,useState } from "react";
import { apiClient } from "@/lib/api/client";
import { actualAllowed, futureActualMessage } from "./actualPolicy";
import type { CalendarToast } from "./useCalendarEditor";
import { copyCalendarItems,pasteCandidates,selectCalendarItem,selectionKey,isCalendarTextTarget,type CalendarRef,type CalendarClipboard,type ClipboardItem,type PasteTarget,type PasteResult } from "./clipboard";

export function useCalendarClipboard(options:{leave:(action:()=>void)=>Promise<void>;run:(operation:()=>Promise<unknown>)=>Promise<unknown>;refresh:()=>Promise<void>;notify:(toast:CalendarToast)=>void;disabled:boolean;ordered?:CalendarRef[];collisions?:(items:ClipboardItem[])=>number}) {
  const [selection,setSelection]=useState<CalendarRef[]>([]);
  const selected=useRef(selection);
  const [clipboard,setClipboard]=useState<CalendarClipboard|null>(null);
  const [target,setTarget]=useState<PasteTarget|null>(null);
  const [failure,setFailure]=useState<{items:ClipboardItem[];result:PasteResult}|null>(null);
  const [busy,setBusy]=useState(false);
  const locked=useRef(false);
  const assign=(next:CalendarRef[])=>{selected.current=next;setSelection(next);};
  const anchor=useRef<CalendarRef|null>(null);
  const select=(ref:CalendarRef,additive=false,range=false)=>{if(!locked.current){
    const ordered=options.ordered ?? [],a=ordered.findIndex(r=>selectionKey(r)===selectionKey(anchor.current ?? ref)),b=ordered.findIndex(r=>selectionKey(r)===selectionKey(ref));
    assign(range && a>=0 && b>=0 ? ordered.slice(Math.min(a,b),Math.max(a,b)+1) : selectCalendarItem(selected.current,ref,additive));
    if(!range)anchor.current=ref;setFailure(null);
  }};
  const clear=()=>assign([]);
  const operate=(action:()=>Promise<void>)=>{
    if(locked.current)return;
    locked.current=true;setBusy(true);
    // Leave may defer its callback behind the existing unsaved-draft guard.
    const release=()=>{locked.current=false;setBusy(false);};let started=false;
    void options.leave(()=>{started=true;locked.current=true;setBusy(true);void options.run(action).catch(e=>options.notify({message:e instanceof Error ? e.message : "작업하지 못했습니다."})).finally(release);})
      .catch(e=>options.notify({message:String(e)})).finally(()=>{if(!started)release();});
  };
  async function snapshot(){return copyCalendarItems(await apiClient.post<ClipboardItem[]>("/api/calendar/clipboard/snapshot",selected.current));}
  async function persist(items:ClipboardItem[],excludeConflicts=false) {
    const result=await apiClient.post<PasteResult>("/api/calendar/clipboard/paste",{items,excludeConflicts});
    if(!result.committed){setFailure({items,result});return;}
    const converted=items.some(item=>item.kind==="ACTUAL" && !actualAllowed(item.actual.date));
    const refs=result.results.flatMap(row=>row.created ? [row.created] : []);
    setFailure(null);assign(refs);await options.refresh();
    options.notify({undo:async()=>{await apiClient.post("/api/calendar/clipboard/delete",refs);assign([]);await options.refresh();},message:excludeConflicts ? `${items.length}개 중 ${refs.length}개 붙여넣음 · ${items.length-refs.length}개 제외` : `${refs.length}개 붙여넣음${converted ? ` · ${futureActualMessage}` : ""}${options.collisions?.(items) ? ` · ${options.collisions(items)}개 시간 겹침 (허용)` : ""}`});
  }
  function copy(){if(!selected.current.length)return;operate(async()=>{const saved=await snapshot();setClipboard(saved);setTarget(null);setFailure(null);options.notify({message:`${saved.items.length}개 복사됨 · 붙여넣을 날짜/시간을 선택하세요.`});});}
  function paste(){if(!clipboard)return;if(!target){options.notify({message:"붙여넣을 날짜/시간을 먼저 선택하세요."});return;}operate(()=>persist(pasteCandidates(clipboard,target)));}
  function duplicate(){if(!selected.current.length)return;operate(async()=>{const saved=await snapshot();await persist(saved.items);});}
  function move(){if(!selected.current.length)return;if(!target){options.notify({message:"이동할 날짜/시간을 먼저 선택하세요."});return;}operate(async()=>{
    const refs=[...selected.current],saved=await snapshot(),items=pasteCandidates(saved,target);
    const result=await apiClient.post<{undoToken:string;refs?:CalendarRef[]}>("/api/calendar/clipboard/move",{refs,items});assign(result.refs ?? refs);await options.refresh();
    options.notify({message:`${refs.length}개 이동됨${items.some(item=>item.kind==="ACTUAL" && !actualAllowed(item.actual.date)) ? ` · ${futureActualMessage}` : ""}`,undo:async()=>{await apiClient.post(`/api/calendar/clipboard/undo-move/${result.undoToken}`,{});assign(refs);await options.refresh();}});
  });}
  function remove(){if(!selected.current.length)return;operate(async()=>{
    const refs=[...selected.current];const result=await apiClient.post<{undoToken:string}>("/api/calendar/clipboard/delete",refs);
    assign([]);setFailure(null);await options.refresh();options.notify({message:`${refs.length}개 삭제됨`,undo:async()=>{
      const restored=await apiClient.post<CalendarRef[]>(`/api/calendar/clipboard/undo/${result.undoToken}`,{});assign(restored);await options.refresh();
    }});
  });}
  const latest=useRef({copy,paste,duplicate,remove,clear,options,clipboard});
  useEffect(()=>{latest.current={copy,paste,duplicate,remove,clear,options,clipboard};});
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      const v=latest.current;
      if(e.defaultPrevented || v.options.disabled || isCalendarTextTarget(e.target) || e.altKey)return;
      const key=e.key.toLowerCase(),command=e.ctrlKey||e.metaKey;
      if(key==="escape"){e.preventDefault();void v.options.leave(v.clear);return;}
      if(command && key==="v" && v.clipboard){e.preventDefault();v.paste();}
      else if(selected.current.length && command && (key==="c"||key==="d")){e.preventDefault();if(key==="c")v.copy();else v.duplicate();}
      else if(selected.current.length && !command && (key==="delete"||key==="backspace")){e.preventDefault();v.remove();}
    };
    document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler);
  },[]);
  return {selection,select,clear,copy,paste,duplicate,move,remove,busy,clipboard,target,setTarget,failure,
    isSelected:(ref:CalendarRef)=>selection.some(item=>selectionKey(item)===selectionKey(ref)),
    exclude:()=>{if(failure)operate(()=>persist(failure.items,true));}};
}
