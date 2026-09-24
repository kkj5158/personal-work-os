"use client";
/* Private authenticated object URLs cannot use the public Next image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useGlobalTabs, useShellNavigationGuard } from "@/components/GlobalTabs";
import { ApiError } from "@/lib/api/client";
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, GripVertical, ImagePlus, Indent, Lightbulb, Link2, Outdent, Plus, Redo2, Trash2, Undo2, X } from "lucide-react";
import { workflowApi, type WorkflowImage, type WorkpadDay, type WorkpadDaySave, type FixedTab, type TopicNote } from "@/lib/api/workflow";
import { today, shiftDate, dateLabel } from "@/lib/notes/model";
import { validLocalDate } from "@/lib/localDateBridge";
import { BLOCK_MIME, COMMANDS, type Block, blockText, cloneBlocks, copyBlocks, depth, enterBlock, imageWidth, indentBlocks, insertAfter, moveBlocks, newBlock, normalize, numberedOrdinals, ordered, selectBlocks, emptyBackspace, markdownStart, moveStructural, shortcut, slashQuery, subtreeIds, textBlocks } from "@/lib/workflow/workpad";
import { useWorkflow } from "./WorkflowContext";
import { useWorkpadSessions } from "./WorkpadSessions";
import { reconcileLinks, retainedLinks, wikiOccurrences, wikiQuery, type WikiLink } from "@/lib/workflow/wiki";
import TopicNotePanel from "./TopicNotePanel";
import TaskDetails from "./TaskDetails";
import { publishEntityChange, subscribeEntityChanges } from "@/lib/windowSync";
import { mergeWorkpadBlocks, resolveWorkpadConflicts } from "@/lib/workpadMerge";
import { WORKPAD_SHORTCUTS } from "@/lib/workflow/shortcuts";
import { useWorkpadDock } from "./WorkpadDock";
import EditableText, { documentRange, setRange, type TextElement } from "./EditableText";
import { boundaryDelete, replaceTextRange as replaceDocumentTextRange, dropBlocks, type DropZone } from "@/lib/workflow/workpad";
import "./today.css";

type EditorDay = WorkpadDay & {title?:string};
type Snapshot = { focus?: string; cursor?: number; blocks: Block[]; statuses: Record<string, string>; titles: Record<string, string> };
type SaveState = "loading" | "saved" | "pending" | "saving" | "error" | "conflict";
const shortcuts = WORKPAD_SHORTCUTS.flatMap<readonly [string,string]>(group=>group.items);

function PrivateImage({ image, expand }: { image: WorkflowImage; expand: (url: string, caption: string) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true, objectUrl = "";
    workflowApi.getImage(image.id).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (live) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.id]);
  return url ? <button type="button" className="wp-image-expand" onDoubleClick={() => expand(url, image.caption ?? "")} onClick={() => expand(url, image.caption ?? "")} aria-label="Expand image"><img src={url} alt={image.caption || "Work evidence"} draggable={false}/></button> : <div className="wp-image-placeholder">{error ? "Image unavailable" : "Loading image…"}</div>;
}

type EditorProps = { embeddedDate?:string; fixedTab?:FixedTab; onFixedTitle?:(title:string)=>void; onJump?:(date:string,block?:string)=>void };
export default function Today({embeddedDate,fixedTab,onFixedTitle,onJump}:EditorProps = {}) {
  const sessions=useWorkpadSessions();
  const dock=useWorkpadDock();
  const promoteNote=useRef(false);
  const shell=useGlobalTabs();
  const fixedTitle=useRef(fixedTab?.title??'Fixed Workflow'),baseTitle=useRef(fixedTab?.title??'Fixed Workflow');
  const [tabTitle,setTabTitle]=useState(fixedTab?.title??'Fixed Workflow');
  const fixedId=fixedTab?.id;
  const scope=fixedId??embeddedDate;
  const loadDay=useCallback((date:string):Promise<EditorDay>=>fixedId?workflowApi.getFixed(fixedId).then(tab=>({date,title:tab.title,revision:tab.revision,blocks:tab.blocks})):workflowApi.getDay(date),[fixedId]);
  const persistDay=useCallback((date:string,day:WorkpadDaySave)=>fixedId?workflowApi.saveFixed(fixedId,{...day,title:fixedTitle.current}):workflowApi.saveDay(date,day),[fixedId]);
  const env = useWorkflow();
  const search = useSearchParams();
  const requestedDate = embeddedDate ?? (fixedTab ? today() : search.get("date"));
  const [date, setDate] = useState(() => validLocalDate(requestedDate) ? requestedDate : today());
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const base=useRef<Block[]>([]);
  const [conflict,setConflict]=useState<EditorDay|null>(null);
  const conflictRef=useRef<EditorDay|null>(null);
  const [compare,setCompare]=useState(false);
  const [recovery,setRecovery]=useState<Block[]|null>(null);
  const entityType=fixedId?'workflow-fixed':'workpad';
  const draftKey=()=>`pos-draft:${fixedId??state.current.date}`;
  const preserveDraft=()=>{try{sessionStorage.setItem(draftKey(),JSON.stringify(state.current.blocks));}catch{/* Memory remains available. */}};
  const markConflict=(latest:EditorDay)=>{preserveDraft();conflictRef.current=latest;setConflict(latest);setSaveState('conflict');setError('');};
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [carryMode, setCarryMode] = useState(false);
  const [targetDate,setTargetDate]=useState(shiftDate(date,1));
  const [autoCarry,setAutoCarry]=useState(false);
  const [moveResult,setMoveResult]=useState<{date:string;count:number;token:string|null}|null>(null);
  const [filter, setFilter] = useState<"all" | "incomplete" | "completed">("all");
  const [command, setCommand] = useState<{ id: string; query: string; cursor: number; index: number } | null>(null);
  const [wiki,setWiki]=useState<{id:string;query:string;start:number;cursor:number;index:number}|null>(null);
  const [suggestionResult,setSuggestionResult]=useState<{query:string;notes:TopicNote[]}>({query:"",notes:[]});
  const suggestions=suggestionResult.query===wiki?.query?suggestionResult.notes:[];
  const [topic,setTopic]=useState<string|null>(null);
  const [linkChoices,setLinkChoices]=useState<{block:Block;occurrence:ReturnType<typeof wikiOccurrences>[number];notes:TopicNote[]}|null>(null);
  const composing=useRef(false), plainPaste=useRef(false);
  const textEdit=useRef<{id:string;start:number;end:number;inputType:string}|null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [expanded, setExpanded] = useState<{ url: string; caption: string } | null>(null);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const [busy, setBusy] = useState(false);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const state = useRef({ date, blocks: [] as Block[], revision: 0, change: 0, saved: 0, loaded: false });
  const saving = useRef<Promise<void> | null>(null);
  const remotePending=useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<{ undo: Snapshot[]; redo: Snapshot[] }>({ undo: [], redo: [] });
  const anchor = useRef<string | null>(null);
  const editors = useRef(new Map<string, TextElement>());
  const documentRoot = useRef<HTMLDivElement>(null);
  const [dropHint,setDropHint]=useState<{id:string;zone:DropZone}|null>(null);
  const dragging=useRef<string[]>([]);
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null);
  const selectStage=useRef<string|null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);
  const tasks = useRef(env.tasks);
  const refreshTasks = useRef(env.refresh);
  const pendingTitles = useRef<Record<string, string>>({});
  const lastQuery = useRef(requestedDate), pendingDate = useRef<string | null>(null);
  useEffect(() => { tasks.current = env.tasks; refreshTasks.current = env.refresh; }, [env.tasks, env.refresh]);
  const activeBlock = blocks.find(b => b.id === active);
  const linkedTask = env.tasks.find(t => t.id === activeBlock?.workTaskId);
  const selectedIds = selected.length ? selected : active ? [active] : [];

  const notify = (text: string) => { setMessage(text); };
  function replaceTextRange(source:Block[],first:string,start:number,last:string,end:number,text=''){
    return replaceDocumentTextRange(source,first,start,last,end,text,new Set(editors.current.keys()));
  }
  const fail = useCallback((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)); }, []);

  const flush = useCallback(async () => {
    if(composing.current)throw new Error('Finish composing text before leaving this editor.');
    if(conflictRef.current)throw new Error('Resolve the changes from another window before leaving.');
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (saving.current) return saving.current;
    if (!state.current.loaded || (state.current.saved === state.current.change && !Object.keys(pendingTitles.current).length)) return;
    const operation = async () => {
      while (state.current.loaded && (state.current.saved < state.current.change || Object.keys(pendingTitles.current).length)) {
        if(composing.current){setSaveState('pending');throw new Error('Finish composing text before leaving this editor.');}
        const snapshot = state.current;
        const change = snapshot.change,titleAtSave=fixedTitle.current;
        setSaveState("saving");
        try {
          const titles = Object.fromEntries(Object.entries(pendingTitles.current).filter(([id])=>snapshot.blocks.some(b=>b.workTaskId===id)));
          for(const title of Object.values(titles))if(!title.trim())throw new Error("A WorkTask title cannot be empty.");
          const saved = await persistDay(snapshot.date, { revision: snapshot.revision, blocks: snapshot.blocks, ...(Object.keys(titles).length?{taskTitles:titles}:{}) });
          for(const [id,title] of Object.entries(titles))if(pendingTitles.current[id]===title)delete pendingTitles.current[id];
          for(const id of Object.keys(pendingTitles.current))if(!state.current.blocks.some(b=>b.workTaskId===id))delete pendingTitles.current[id];
          // Keep the draft visible until the shared task cache has observed the committed title.
          if(Object.keys(titles).length)void refreshTasks.current().then(()=>setTitleDrafts(current=>Object.fromEntries(Object.entries(current).filter(([blockId,value])=>titles[state.current.blocks.find(b=>b.id===blockId)?.workTaskId??'']!==value)))).catch(fail);
          if (state.current.date !== snapshot.date) return;
          state.current.revision = saved.revision;
          state.current.saved = change;
          base.current=structuredClone(snapshot.blocks);baseTitle.current=titleAtSave;
          if(state.current.saved===state.current.change)try{sessionStorage.removeItem(`pos-draft:${fixedId??snapshot.date}`);}catch{}
          publishEntityChange({entityType,entityId:fixedId??snapshot.date,revision:saved.revision});
        } catch (cause) {
          if(cause instanceof ApiError&&cause.status===409){
            const latest=await loadDay(snapshot.date),merged=mergeWorkpadBlocks(base.current,state.current.blocks,latest.blocks);
            if(!merged.conflicts.length&&!(latest.title!==undefined&&baseTitle.current!==latest.title&&fixedTitle.current!==baseTitle.current&&fixedTitle.current!==latest.title)){if(latest.title!==undefined){if(fixedTitle.current===baseTitle.current){fixedTitle.current=latest.title;setTabTitle(latest.title);}baseTitle.current=latest.title;}base.current=structuredClone(latest.blocks);const mergedBlocks=ordered(merged.blocks);state.current={...state.current,blocks:mergedBlocks,revision:latest.revision,change:state.current.change+1};setBlocks(mergedBlocks);history.current={undo:[],redo:[]};setHistoryCounts({undo:0,redo:0});continue;}
            markConflict(latest);throw cause;
          }
          preserveDraft();setSaveState("error"); fail(cause); throw cause;
        }
      }
      setSaveState("saved");
    };
    saving.current = operation().finally(() => { saving.current = null;if(remotePending.current){remotePending.current=false;void refreshRemote.current().catch(fail);} });
    return saving.current;
  }, [fail,persistDay,loadDay,fixedId,entityType]);

  useEffect(()=>sessions?.register(scope??"daily",async()=>{if(busy)throw new Error("Finishing the current operation…");await flush();},()=>
    busy || !!document.getElementById(`worklog-${scope}`)?.contains(document.activeElement) || !state.current.loaded || state.current.saved<state.current.change || !!saving.current || !!Object.keys(pendingTitles.current).length || selected.length>0 ||
    [...editors.current.values()].some(editor=>editor===document.activeElement)
  ),[sessions,scope,busy,flush,selected.length]);
  useShellNavigationGuard(async proceed => {
    if (busy) { setMessage("Finishing the current operation…"); return; }
    try { if(sessions)await sessions.flush();else await flush(); proceed(); } catch { /* The editor retains the unsaved draft. */ }
  });

  useEffect(() => {
    if (lastQuery.current !== requestedDate) {
      lastQuery.current = requestedDate;
      pendingDate.current = validLocalDate(requestedDate) ? requestedDate : today();
    }
    if (busy || !pendingDate.current) return;
    const next = pendingDate.current;
    pendingDate.current = null;
    if (next === state.current.date) return;
    let cancelled = false;
    void flush().then(() => {
      if (!cancelled) { setDate(next); setActive(null); setSelected([]); setCommand(null); setCarryMode(false); setFilter("all"); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [requestedDate, flush, busy]);

  const accept = useCallback((day: EditorDay) => {
    const next = ordered(day.blocks);
    if(day.title!==undefined){fixedTitle.current=day.title;baseTitle.current=day.title;setTabTitle(day.title);onFixedTitle?.(day.title);}
    state.current = { date: day.date, blocks: next, revision: day.revision, change: 0, saved: 0, loaded: true };
    base.current=structuredClone(next);conflictRef.current=null;setConflict(null);setBlocks(next); setSaveState("saved");
  }, []);

  useEffect(() => {
    let cancelled = false;
    state.current.loaded = false;
    // A new remote day replaces the editor only after its fetch completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveState("loading"); setError("");
    loadDay(date).then(day => {
      if (cancelled) return;
      accept(day);
      try{const raw=sessionStorage.getItem(`pos-draft:${fixedId??day.date}`);if(raw){const draft=JSON.parse(raw);if(Array.isArray(draft)&&JSON.stringify(draft)!==JSON.stringify(day.blocks))setRecovery(draft);}}catch{}
      history.current = { undo: [], redo: [] }; setHistoryCounts({ undo: 0, redo: 0 });
      const focus = new URLSearchParams(window.location.search).get("block");
      if (focus && day.blocks.some(block=>block.id===focus)) { setActive(focus); setSelected([focus]); requestAnimationFrame(() => document.getElementById(`wp-${focus}`)?.scrollIntoView({ block: "center" })); }
    }).catch(cause => { if (!cancelled) { setSaveState("error"); fail(cause); } });
    return () => { cancelled = true; void flush().catch(() => {}); };
  }, [date, accept, fail, flush, loadDay]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (state.current.saved < state.current.change) { event.preventDefault(); void flush().catch(() => {}); }
    };
    const blur = () => { void flush().catch(() => {}); };
    window.addEventListener("beforeunload", warn); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("blur", blur); };
  }, [flush]);

  const refreshRemote=useRef<()=>Promise<void>>(async()=>{});
  useEffect(()=>{refreshRemote.current=async()=>{
    if(!state.current.loaded||saving.current||busy||composing.current||conflictRef.current)return;
    const initial=state.current.date,latest=await loadDay(initial);
    if(state.current.date!==initial||latest.revision<=state.current.revision)return;
    if(state.current.saved===state.current.change){accept(latest);history.current={undo:[],redo:[]};setHistoryCounts({undo:0,redo:0});return;}
    const merged=mergeWorkpadBlocks(base.current,state.current.blocks,latest.blocks);
    if(merged.conflicts.length||(latest.title!==undefined&&baseTitle.current!==latest.title&&fixedTitle.current!==baseTitle.current&&fixedTitle.current!==latest.title)){markConflict(latest);return;}
    if(latest.title!==undefined){if(fixedTitle.current===baseTitle.current){fixedTitle.current=latest.title;setTabTitle(latest.title);}baseTitle.current=latest.title;}
    base.current=structuredClone(latest.blocks);const mergedBlocks=ordered(merged.blocks);state.current={...state.current,blocks:mergedBlocks,revision:latest.revision,change:state.current.change+1};setBlocks(mergedBlocks);history.current={undo:[],redo:[]};setHistoryCounts({undo:0,redo:0});await flush();
  };});
  useEffect(()=>{
    const refresh=()=>{void refreshRemote.current().catch(fail);};
    const unsubscribe=subscribeEntityChanges(event=>{if(event.entityType===entityType&&event.entityId===(fixedId??state.current.date)&&event.revision>state.current.revision){if(saving.current)remotePending.current=true;else refresh();}});
    window.addEventListener('focus',refresh);return()=>{unsubscribe();window.removeEventListener('focus',refresh);};
  },[entityType,fixedId,fail]);
  async function resolveConflict(keep:boolean,wholeDocument=false){
    if(!conflictRef.current)return;preserveDraft();setRecovery(structuredClone(state.current.blocks));
    const latest=await loadDay(date);const local=state.current.blocks,localTitle=fixedTitle.current;
    const resolved=keep?resolveWorkpadConflicts(base.current,local,latest.blocks):null;
    if(keep&&!resolved&&!wholeDocument){setCompare(true);conflictRef.current=latest;setConflict(latest);return;}
    accept(latest);setCompare(false);setError('');history.current={undo:[],redo:[]};setHistoryCounts({undo:0,redo:0});
    if(keep){if(fixedId){fixedTitle.current=localTitle;setTabTitle(localTitle);}change(ordered(resolved??local));await flush();}
  }

  const snapshot = (statuses: Record<string, string> = {}, titles: Record<string, string> = {}): Snapshot => ({ focus: active??undefined, cursor: active ? editors.current.get(active)?.selectionStart : undefined, blocks: structuredClone(state.current.blocks), statuses, titles });
  function remember(statuses: Record<string, string> = {}, titles: Record<string, string> = {}) {
    history.current.undo.push(snapshot(statuses, titles));
    if (history.current.undo.length > 80) history.current.undo.shift();
    history.current.redo = []; setHistoryCounts({ undo: history.current.undo.length, redo: 0 });
  }
  function change(next: Block[], record = true) {
    if (!state.current.loaded) return;
    const changedTitles:Record<string,string>={},draftTitles:Record<string,string>={};
    next=next.map(row=>{const prior=state.current.blocks.find(b=>b.id===row.id);if(prior&&row.content!==prior.content){
      if(row.workTaskId){changedTitles[row.workTaskId]=prior.content;pendingTitles.current[row.workTaskId]=row.content;draftTitles[row.id]=row.content;}
      if(row.metadata===prior.metadata)row={...row,metadata:{...row.metadata,wikiLinks:reconcileLinks(prior.content,row.content,(prior.metadata.wikiLinks??[]) as WikiLink[])}};
    }return row;});
    if (record) remember({},changedTitles);
    if(Object.keys(draftTitles).length)setTitleDrafts(current=>({...current,...draftTitles}));
    const normalized = normalize(next);
    state.current = { ...state.current, blocks: normalized, change: state.current.change + 1 };
    setBlocks(normalized); setSaveState(conflictRef.current?"conflict":"pending");preserveDraft();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 550);
  }
  function patch(id: string, updates: Partial<Block>, record = true) {
    change(state.current.blocks.map(b => b.id === id ? { ...b, ...updates } : b), record);
  }
  function focus(id: string, position?: number) {
    setActive(id); setSelected([]); anchor.current = id;
    requestAnimationFrame(() => {
      const input = editors.current.get(id);
      input?.focus(); if (position !== undefined) input?.setSelectionRange(position, position);
      document.getElementById(`wp-${id}`)?.scrollIntoView({ block: "nearest" });
    });
  }
  async function jump(next: string, source?: string) {
    if (busy || !validLocalDate(next)) return;
    if(onJump){onJump(next,source);return;}
    try {
      await flush();
      const url = new URL(window.location.href); url.searchParams.set("date", next);
      if (source) url.searchParams.set("block", source); else url.searchParams.delete("block");
      window.history.replaceState(null, "", url);
      setSelected(source ? [source] : []); setActive(source ?? null); setCommand(null); setCarryMode(false); setFilter("all");
      if (next === date) { if (source) focus(source); } else setDate(next);
    } catch { /* Keep the current draft open when a save fails. */ }
  }
  function isChecked(block: Block) { return block.workTaskId ? env.tasks.find(t => t.id === block.workTaskId)?.status === "DONE" : block.checked; }
  async function toggle(block: Block) {
    if (block.workTaskId) {
      const task = tasks.current.find(t => t.id === block.workTaskId);
      if (!task) return;
      remember({ [task.id]: task.status });
      try { await env.updateTask(task.id, { status: task.status === "DONE" ? "TODO" : "DONE" }); }
      catch (cause) { fail(cause); }
    } else patch(block.id, { type: "CHECKLIST", checked: block.type === "CHECKLIST" ? !block.checked : false });
  }
  async function promote(block: Block) {
    if(fixedTab){notify("Fixed checklists are reusable and independent of daily tasks.");return;}
    if (block.workTaskId) { notify("Already linked to WorkTask"); return; }
    if (!block.content.trim()) { notify("Add a title before promoting this checklist."); return; }
    setBusy(true);
    try {
      if (block.type !== "CHECKLIST") patch(block.id, { type: "CHECKLIST", checked: false }); else remember();
      await flush();
      const task = await workflowApi.promote(date, block.id);
      // Promotion changes the server revision; reconcile before the next autosave.
      accept(await workflowApi.getDay(date)); await env.refresh();
      setActive(block.id); notify(`Linked to WorkTask: ${task.title}`);
    } catch (cause) { fail(cause); } finally { setBusy(false); }
  }
  async function unlink() {
    if (!activeBlock?.workTaskId) return;
    setBusy(true);
    try { remember(); await flush(); accept(await workflowApi.unlink(date, activeBlock.id)); notify("Unlinked. The WorkTask is still in To-do."); }
    catch (cause) { fail(cause); } finally { setBusy(false); }
  }
  async function undo(redo = false) {
    const from = redo ? history.current.redo : history.current.undo;
    const next = from.pop(); if (!next) return;
    (redo ? history.current.undo : history.current.redo).push(snapshot(
      Object.fromEntries(tasks.current.filter(t => next.statuses[t.id]).map(t => [t.id, t.status])),
      Object.fromEntries(tasks.current.filter(t => next.titles[t.id] !== undefined).map(t => [t.id, titleDrafts[state.current.blocks.find(b => b.workTaskId === t.id)?.id ?? ""] ?? t.title])),
    ));
    setBusy(true);
    try {
      // Let an already submitted title save settle before restoring its prior value.
      for (const id of Object.keys(next.titles)) delete pendingTitles.current[id];
      if (saving.current) await saving.current.catch(() => {});
      for (const task of tasks.current) {
        const status = next.statuses[task.id];
        if (status && status !== task.status) await env.updateTask(task.id, { status: status as typeof task.status });
        const title = next.titles[task.id];
        if (title !== undefined && title.trim()) pendingTitles.current[task.id] = title;
      }
      setTitleDrafts(Object.fromEntries(next.blocks.filter(b => b.workTaskId && next.titles[b.workTaskId] !== undefined).map(b => [b.id, next.titles[b.workTaskId!]])));
      change(next.blocks, false); if(next.focus)focus(next.focus,next.cursor); setHistoryCounts({ undo: history.current.undo.length, redo: history.current.redo.length });
    } catch (cause) { fail(cause); } finally { setBusy(false); }
  }
  function remove(ids = selectedIds) {
    const tree = subtreeIds(state.current.blocks, ids);
    const rest=state.current.blocks.filter(b => !tree.has(b.id));
    if(!rest.length)rest.push(newBlock());
    change(rest); setSelected([]); setActive(null);
  }
  function move(direction: -1 | 1) {
    const next=moveStructural(state.current.blocks,selectedIds,direction);
    if(next!==state.current.blocks)change(next);
  }
  function choose(event: React.MouseEvent, id: string, force = false) {
    if (event.shiftKey || event.ctrlKey || event.metaKey || carryMode || force) {
      event.preventDefault();
      setSelected(selectBlocks(blocks, selected, anchor.current ?? active, id, event.shiftKey, event.ctrlKey || event.metaKey || carryMode));
      setActive(id); if (!event.shiftKey) anchor.current = id;
    } else { setActive(id); setSelected([]); anchor.current = id; }
  }
  function add(type: Block["type"] = "TEXT") {
    const block = newBlock(type);
    change(insertAfter(state.current.blocks, active, [block])); focus(block.id);
  }
  function runCommand(name: typeof COMMANDS[number][0], block: Block, cursor?: number) {
    const entry = COMMANDS.find(c => c[0] === name)!;
    let content = block.content;
    if (cursor !== undefined) content = content.slice(0, cursor).replace(/\/[a-z0-9]*$/, "") + content.slice(cursor);
    setCommand(null);
    if (name === "task") {
      const next = { ...block, content };
      if (content !== block.content) patch(block.id, { content });
      void promote(next); return;
    }
    if (block.workTaskId && entry[1] !== "CHECKLIST") { notify("Unlink this WorkTask in the context rail before changing its block type."); return; }
    patch(block.id, { type: entry[1], content });
    if (name === "image") { uploadTarget.current = block.id; fileInput.current?.click(); }
    else focus(block.id, content.length);
  }
  function keyDown(event: React.KeyboardEvent<TextElement>, block: Block) {
    if (event.nativeEvent.isComposing || composing.current || event.keyCode===229) return;
    const range=documentRange(documentRoot.current);
    const hasRange=!!range;
    if(event.key.toLowerCase()!=='a')selectStage.current=null;
    const mod=event.ctrlKey||event.metaKey;
    if(mod&&event.key.toLowerCase()==='a'){
      event.preventDefault();setSelected([]);
      if(selectStage.current===block.id){const all=[...editors.current.values()];if(all.length){const r=document.createRange();r.setStart(all[0],0);r.setEnd(all[all.length-1],all[all.length-1].childNodes.length);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(r);}}
      else{setRange(event.currentTarget,0,block.content.length);selectStage.current=block.id;}return;
    }
    if(range&&range.first!==range.last&&['Backspace','Delete','Enter'].includes(event.key)){
      event.preventDefault();change(replaceTextRange(state.current.blocks,range.first,range.start,range.last,range.end,event.key==='Enter'?'\n':''));focus(range.first,range.start+(event.key==='Enter'?1:0));return;
    }
    if(event.key==='Enter'&&event.shiftKey&&!mod){event.preventDefault();const start=event.currentTarget.selectionStart,end=event.currentTarget.selectionEnd;patch(block.id,{content:block.content.slice(0,start)+'\n'+block.content.slice(end)});focus(block.id,start+1);return;}
    if(mod&&event.shiftKey&&event.key.toLowerCase()==='v'){plainPaste.current=true;return;}
    if(event.key==='Escape'){setSelected([]);setCommand(null);setWiki(null);return;}
    if(mod&&event.key.toLowerCase()==='x'&&event.shiftKey){event.preventDefault();patch(block.id,{metadata:{...block.metadata,strike:!block.metadata.strike}});return;}
    if((event.altKey||mod&&event.shiftKey&&!hasRange)&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();move(event.key==='ArrowUp'?-1:1);return;}
    if(!hasRange&&((event.key==='Backspace'&&event.currentTarget.selectionStart===0)||(event.key==='Delete'&&event.currentTarget.selectionStart===block.content.length))){const result=boundaryDelete(state.current.blocks,block.id,event.key==='Backspace');if(result){event.preventDefault();change(result.blocks);focus(result.id,result.cursor);return;}}
    if(wiki?.id===block.id){
      const count=suggestions.length+1;
      if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();setWiki({...wiki,index:(wiki.index+(event.key==='ArrowDown'?1:-1)+count)%count});return;}
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void chooseNote(suggestions[wiki.index]);return;}
    }
    if (command?.id === block.id) {
      const matches = COMMANDS.filter(c => c[0].startsWith(command.query));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setCommand({ ...command, index: (command.index + (event.key === "ArrowDown" ? 1 : -1) + Math.max(1, matches.length)) % Math.max(1, matches.length) }); return; }
      if (event.key === "Escape") { setCommand(null); return; }
      if (event.key === "Enter" && !event.shiftKey && matches.length) { event.preventDefault(); runCommand(matches[command.index % matches.length][0], block, command.cursor); return; }
    }
    const action = shortcut({ ...event, isComposing: event.nativeEvent.isComposing });
    if (!action) return;
    event.preventDefault();
    if (action === "undo" || action === "redo") { void undo(action === "redo"); return; }
    if (action === "toggle") { void toggle(block); return; }
    if (action === "promote") { void promote(block); return; }
    if (action === "indent" || action === "outdent") { const cursor=event.currentTarget.selectionStart;change(indentBlocks(blocks, selectedIds.length ? selectedIds : [block.id], action === "outdent")); focus(block.id,cursor); return; }
    const cursor=event.currentTarget.selectionStart;
    const source=hasRange?replaceTextRange(state.current.blocks,block.id,cursor,block.id,event.currentTarget.selectionEnd):state.current.blocks;
    const next = enterBlock(source, block.id, cursor);
    change(next.blocks); focus(next.id, 0);
  }

  function selectionEditor(){
    const node=window.getSelection()?.anchorNode;const element=node?.nodeType===1?node as Element:node?.parentElement;
    return element?.closest<TextElement>('.wp-text-input')??null;
  }
  function editText(block:Block,input:TextElement){

              const content = input.value;
              const edit=textEdit.current?.id===block.id&&textEdit.current.inputType?textEdit.current:null;textEdit.current=null;
              if(edit&&edit.start===edit.end&&content.length<block.content.length){if(edit.inputType==='deleteContentBackward')edit.start-=block.content.length-content.length;else edit.end+=block.content.length-content.length;}
              patch(block.id, { content, metadata:{...block.metadata,wikiLinks:reconcileLinks(block.content,content,(block.metadata.wikiLinks??[]) as WikiLink[],edit??undefined)} });
              const markdown=!composing.current&&!block.workTaskId?(markdownStart(content)??(block.type==="BULLET"&&/^\[ \] $/.test(content)?markdownStart("- "+content):null)):null;
              if(markdown){patch(block.id,markdown);focus(block.id,Math.max(0,input.selectionStart-(content.length-markdown.content.length)));return;}
              const wikiMatch=wikiQuery(content,input.selectionStart);setWiki(wikiMatch?{id:block.id,...wikiMatch,index:0}:null);
              const query = slashQuery(content, input.selectionStart);
              setCommand(query === null ? null : { id: block.id, query, cursor: input.selectionStart, index: 0 });
  }
  function clipboardBlocks() { return copyBlocks(state.current.blocks.map(b => ({ ...b, checked: isChecked(b) })), selectedIds); }
  function copy(event: React.ClipboardEvent,cut=false) {
    if((event.target as HTMLElement).closest("input,textarea,select"))return;
    const range=documentRange(documentRoot.current);
    if(range&&!selected.length){
      const a=blocks.findIndex(b=>b.id===range.first),z=blocks.findIndex(b=>b.id===range.last);
      const text=blocks.slice(a,z+1).filter(b=>editors.current.has(b.id)).map(b=>b.content.slice(b.id===range.first?range.start:0,b.id===range.last?range.end:undefined)).join("\n");
      event.preventDefault();event.clipboardData.setData("text/plain",text);
      if(cut){change(replaceTextRange(blocks,range.first,range.start,range.last,range.end));focus(range.first,range.start);}return;
    }
    if(!selected.length)return;
    const rows=clipboardBlocks();if(!rows.length)return;
    event.preventDefault();event.clipboardData.setData(BLOCK_MIME,JSON.stringify({version:1,blocks:rows}));event.clipboardData.setData("text/plain",blockText(rows));
    event.clipboardData.setData("text/html","<pre>"+blockText(rows).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")+"</pre>");
    if(cut)remove(selected);
  }
  async function copyButton(cut=false) {
    const rows = clipboardBlocks();
    try {
      const data = JSON.stringify({ version: 1, blocks: rows });
      const text=blockText(rows),html='<pre data-workpad="'+encodeURIComponent(data)+'">'+text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</pre>';
      if(navigator.clipboard.write&&typeof ClipboardItem!=='undefined')await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);
      else await navigator.clipboard.writeText(text);
      if(cut)remove(selectedIds);notify(`${rows.length} blocks ${cut?'cut':'copied'}`);
    } catch (cause) { fail(cause); }
  }
  function paste(event: React.ClipboardEvent, target: string | null = active) {
    if((event.target as HTMLElement).closest("input,textarea,select"))return;
    const plain=plainPaste.current;plainPaste.current=false;
    const files = Array.from(event.clipboardData.files).filter(f => f.type.startsWith("image/"));
    if (files.length) { event.preventDefault(); void upload(files, target); return; }
    const input=selectionEditor()??event.target as TextElement;
    const text = event.clipboardData.getData("text/plain");
    const rich=event.clipboardData.getData('text/html');
    const embedded=rich?new DOMParser().parseFromString(rich,'text/html').querySelector('[data-workpad]')?.getAttribute('data-workpad'):null;
    let embeddedPayload='';try{if(embedded)embeddedPayload=decodeURIComponent(embedded);}catch{/* Fall back to the plain text payload. */}
    const encoded = event.clipboardData.getData(BLOCK_MIME) || embeddedPayload || (text.startsWith("WORKPAD_BLOCKS_V1\n") ? text.slice(18) : "");

    try {
      let incoming: Block[];
      if (encoded) {
        const data = JSON.parse(encoded) as { version: number; blocks: Block[] };
        if (data.version !== 1 || !Array.isArray(data.blocks) || !data.blocks.every(b => b && typeof b.id === "string" && typeof b.content === "string" && (COMMANDS.some(c => c[1] === b.type) || b.type === "IMAGE_GROUP"))) throw new Error("This clipboard does not contain valid Workpad blocks.");
        incoming = cloneBlocks(data.blocks);
      } else incoming = plain ? [newBlock("TEXT",text)] : textBlocks(text);
      if(fixedTab)incoming=incoming.map(b=>({...b,workTaskId:null,sourceBlockId:null,sourceDate:null}));
      event.preventDefault();
      let source=state.current.blocks;
      const range=documentRange(documentRoot.current);
      if(range){source=replaceTextRange(source,range.first,range.start,range.last,range.end);target=range.first;}
      const current=source.find(b=>b.id===target);
      if(current&&input.classList.contains('wp-text-input')&&!selected.length){
        const cursor=range?.start??input.selectionStart;
        if(!encoded&&!text.includes('\n')&&!markdownStart(text)){
          const content=current.content.slice(0,cursor)+text+current.content.slice(cursor);change(source.map(b=>b.id===current.id?{...b,content}:b));focus(current.id,cursor+text.length);return;
        }
        const suffix=current.content.slice(cursor),tail=newBlock(current.type,suffix,current.parentId);tail.metadata={...current.metadata,wikiLinks:reconcileLinks(current.content,suffix,(current.metadata.wikiLinks??[]) as WikiLink[])};
        source=source.map(b=>b.id===current.id?{...b,content:b.content.slice(0,cursor)}:b);
        change(insertAfter(source,current.id,[...incoming,...(suffix?[tail]:[])]));
      }else change(insertAfter(source,target,incoming));
      if(incoming.length)focus(incoming.at(-1)!.id,incoming.at(-1)!.content.length);
    } catch (cause) { event.preventDefault(); fail(cause); }
  }
  async function upload(files: File[], target: string | null) {
    setBusy(true);
    try {
      const images: WorkflowImage[] = [];
      for (const file of files) images.push({ ...(await workflowApi.uploadImage(file)), width: 100, caption: "", description: "" });
      let next = state.current.blocks;
      const existing = next.find(b => b.id === target);
      if (existing && ["IMAGE", "IMAGE_GROUP"].includes(existing.type)) {
        const joined = [...(existing.metadata.images ?? []), ...images.splice(0, 3 - (existing.metadata.images?.length ?? 0))];
        next = next.map(b => b.id === existing.id ? { ...b, type: joined.length > 1 ? "IMAGE_GROUP" : "IMAGE", metadata: { ...b.metadata, images: joined } } : b);
      }
      let after = target;
      while (images.length) {
        const group = images.splice(0, 3), block = newBlock(group.length > 1 ? "IMAGE_GROUP" : "IMAGE");
        block.metadata = { images: group, layout: "row" };
        next = insertAfter(next, after, [block]); after = block.id;
      }
      change(next); if (after) { setActive(after); setActiveImage(0); } notify("Images attached");
    } catch (cause) { fail(cause); } finally { setBusy(false); }
  }
  function imageChange(block: Block, index: number, updates: Partial<WorkflowImage>, record = true) {
    patch(block.id, { metadata: { ...block.metadata, images: (block.metadata.images ?? []).map((img, i) => i === index ? { ...img, ...updates } : img) } }, record);
  }
  function resize(event: React.PointerEvent, block: Block, index: number) {
    event.preventDefault(); event.stopPropagation(); remember();
    const target = event.currentTarget as HTMLElement;
    const start = event.clientX, width = target.parentElement!.getBoundingClientRect().width, initial = block.metadata.images?.[index].width ?? 100;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const current = state.current.blocks.find(b => b.id === block.id);
      if (current) imageChange(current, index, { width: imageWidth(initial + (e.clientX - start) / width * 100) }, false);
    };
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
  }
  function drop(event: React.DragEvent, target: Block) {
    event.preventDefault(); event.stopPropagation();
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length) { void upload(files, target.id); return; }
    const media = event.dataTransfer.getData("application/x-workpad-image");
    if (media && ["IMAGE", "IMAGE_GROUP"].includes(target.type)) {
      const from = JSON.parse(media) as { blockId: string; index: number };
      if (from.blockId === target.id) return;
      const source = blocks.find(b => b.id === from.blockId), image = source?.metadata.images?.[from.index];
      if (!source || !image) return;
      if ((target.metadata.images?.length ?? 0) >= 3) { notify("Image Groups contain up to 3 images."); return; }
      change(blocks.map(b => {
        if (b.id === source.id) { const images = b.metadata.images!.filter((_, i) => i !== from.index); return { ...b, type: images.length > 1 ? "IMAGE_GROUP" : "IMAGE", metadata: { ...b.metadata, images } }; }
        if (b.id === target.id) return { ...b, type: "IMAGE_GROUP", metadata: { ...b.metadata, images: [...(b.metadata.images ?? []), image] } };
        return b;
      })); return;
    }
    const raw = event.dataTransfer.getData("application/x-workpad-selection");
    if(raw&&event.dataTransfer.getData("application/x-workpad-owner")===(scope??date)&&dragging.current.length){
      const next=dropBlocks(blocks,JSON.parse(raw) as string[],target.id,dropHint?.id===target.id?dropHint.zone:'before');if(next!==blocks)change(next);
    }
    dragging.current=[];setDropHint(null);
  }
  function proposeMove(){
    setAutoCarry(!selected.length);if(!selected.length)setSelected(blocks.filter(b=>b.type==='CHECKLIST'&&!isChecked(b)).map(b=>b.id));
    setTargetDate(shiftDate(date,1));setCarryMode(true);setFilter('all');
  }
  async function carry() {
    if(!selected.length||!validLocalDate(targetDate)||targetDate===date)return;
    setBusy(true);
    try{
      await flush();await sessions?.flushOne(targetDate);const target=await workflowApi.getDay(targetDate);
      const result=await workflowApi.move(date,{blockIds:selected,targetDate,expectedSourceRevision:state.current.revision,expectedTargetRevision:target.revision,incompleteOnly:autoCarry});
      accept(result.source);history.current={undo:[],redo:[]};setHistoryCounts({undo:0,redo:0});
      publishEntityChange({entityType:'workpad',entityId:result.source.date,revision:result.source.revision});publishEntityChange({entityType:'workpad',entityId:result.target.date,revision:result.target.revision});
      setMoveResult({date:targetDate,count:result.movedBlockIds.length,token:result.undoToken});setCarryMode(false);setSelected([]);
    }catch(cause){fail(cause);}finally{setBusy(false);}
  }
  async function undoDateMove(){
    if(!moveResult?.token)return;setBusy(true);
    try{await flush();const result=await workflowApi.undoMove(moveResult.token);accept(result.source);setMoveResult(null);publishEntityChange({entityType:'workpad',entityId:result.source.date,revision:result.source.revision});publishEntityChange({entityType:'workpad',entityId:result.target.date,revision:result.target.revision});}catch(cause){fail(cause);}finally{setBusy(false);}
  }

  const searchQuery=wiki?.query;
  useEffect(()=>{
    if(searchQuery===undefined)return;
    let cancelled=false;
    const timer=setTimeout(()=>{workflowApi.searchNotes(searchQuery).then(rows=>{if(!cancelled)setSuggestionResult({query:searchQuery,notes:rows});}).catch(fail);},180);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[searchQuery,fail]);
  async function chooseNote(note?:TopicNote){
    if(!wiki)return;const target=state.current.blocks.find(b=>b.id===wiki.id);if(!target)return;
    try{
      if(!note&&!wiki.query.trim())return;
      const chosen=note??await workflowApi.createNote(wiki.query.trim());
      const current=state.current.blocks.find(b=>b.id===target.id);
      if(!current||current.content!==target.content||current.type!==target.type){notify("Note created. Use [[ to link it from your current draft.");return;}
      const suffix=target.content.slice(wiki.cursor).replace(/^\]\]/,'');
      const content=target.content.slice(0,wiki.start)+'[['+chosen.title+']]'+suffix;
      const occurrence=wikiOccurrences(content).find(o=>o.start===wiki.start)!;
      const links=retainedLinks(content,(current.metadata.wikiLinks??[]) as WikiLink[]).filter(l=>l.name!==chosen.title||l.ordinal!==occurrence.ordinal);
      patch(target.id,{content,metadata:{...current.metadata,wikiLinks:[...links,{name:chosen.title,noteId:chosen.id,ordinal:occurrence.ordinal}]}});
      setWiki(null);focus(target.id,wiki.start+chosen.title.length+4);
    }catch(cause){fail(cause);}
  }

  async function enterNote(note:TopicNote){
    if(dock){await dock.openNote(note.id,promoteNote.current);return;}
    if(note.workspaceId){await (sessions?.flush()??flush());shell?.navigate(`/notes?workspace=${note.workspaceId}&note=${note.id}`);}
    else setTopic(note.id);
  }
  async function bindAndOpen(target:Block,occurrence:ReturnType<typeof wikiOccurrences>[number],note:TopicNote){
    const current=state.current.blocks.find(b=>b.id===target.id);
    if(!current||current.content!==target.content){notify("The text changed. Open its current link again.");setLinkChoices(null);return;}
    const links=retainedLinks(current.content,(current.metadata.wikiLinks??[]) as WikiLink[])
      .filter(l=>l.name!==occurrence.name||l.ordinal!==occurrence.ordinal);
    patch(current.id,{metadata:{...current.metadata,wikiLinks:[...links,{name:occurrence.name,ordinal:occurrence.ordinal,noteId:note.id}]}});
    await flush();setLinkChoices(null);await enterNote(note);
  }
  async function openWikiOccurrence(block:Block,occurrence:ReturnType<typeof wikiOccurrences>[number],link?:WikiLink,promote=false){
    promoteNote.current=promote;
    try{
      await flush();
      if(link){
        try{await enterNote(await workflowApi.getNote(link.noteId));return;}
        catch(e){if(!(e instanceof ApiError)||e.status!==404)throw e;}
      }
      const notes=await workflowApi.resolveNote(occurrence.name);
      if(notes.length===1)await bindAndOpen(block,occurrence,notes[0]);
      else setLinkChoices({block,occurrence,notes});
    }catch(cause){fail(cause);}
  }

  const checklist = blocks.filter(b => b.type === "CHECKLIST");
  const completed = checklist.filter(isChecked).length;
  const visible = new Set(blocks.filter(b => filter === "all" || (b.type === "CHECKLIST" && (filter === "completed" ? isChecked(b) : !isChecked(b)))).map(b => b.id));
  const ordinals = numberedOrdinals(blocks);
  if (filter !== "all") {
    for (const block of blocks) if (visible.has(block.id)) { let parent = block.parentId; while (parent) { visible.add(parent); parent = blocks.find(b => b.id === parent)?.parentId ?? null; } }
  }
  const contextImage = activeBlock?.metadata.images?.[activeImage];

  return <div className={`wp-layout ${scope ? "wp-embedded" : ""} ${fixedTab ? "wp-fixed-editor" : ""}`}>
    <nav inert={busy} className="wp-dates" aria-label="Workpad dates"><h2>Workpad</h2><button className="wp-today" onClick={() => void jump(today())}>Today</button><small>{date.slice(0, 7)}</small>{Array.from({ length: 10 }, (_, i) => shiftDate(date, -i)).map(day => <button key={day} className={day === date ? "selected" : ""} onClick={() => void jump(day)}>{day.slice(5)}<small>{day === today() ? "Today" : dateLabel(day).split(" ").at(-1)}</small></button>)}</nav>
    <main className="wp-main" inert={busy || saveState === "loading"} onCopy={e=>copy(e)} onCut={e=>copy(e,true)} onPaste={e => paste(e)} onKeyDown={e => {
      if(e.key==="Escape"){setSelected([]);setWiki(null);setCommand(null);setMenu(null);dragging.current=[];setDropHint(null);}
      if ((e.target as HTMLElement).closest(".wp-text-input") || (e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
      if(selected.length&&(e.altKey||(e.ctrlKey||e.metaKey)&&e.shiftKey)&&(e.key==="ArrowUp"||e.key==="ArrowDown")){e.preventDefault();move(e.key==="ArrowUp"?-1:1);return;}
      const action = shortcut(e);
      if (action === "undo" || action === "redo") { e.preventDefault(); void undo(action === "redo"); }
      else if (selected.length && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); remove(); }
      else if (selected.length && (action === "indent" || action === "outdent")) { e.preventDefault(); change(indentBlocks(blocks, selected, action === "outdent")); }
    }}>
      <header className="wp-header"><div><h1>{fixedTab ? <input aria-label="Fixed workflow title" value={tabTitle} onChange={e=>{fixedTitle.current=e.target.value;setTabTitle(e.target.value);onFixedTitle?.(e.target.value);change(state.current.blocks);}}/> : dateLabel(date)}</h1><p>Record your work, organize your thoughts.</p></div><div className="wp-date-navigation"><button aria-label="Previous date" onClick={() => void jump(shiftDate(date, -1))}><ChevronLeft size={16}/></button><button onClick={() => void jump(today())}>Today</button><input aria-label="Workpad date" type="date" value={date} onChange={e => void jump(e.target.value)}/><button aria-label="Next date" onClick={() => void jump(shiftDate(date, 1))}><ChevronRight size={16}/></button></div></header>
      <div className="wp-summary"><button className={filter === "incomplete" ? "selected" : ""} onClick={() => setFilter(filter === "incomplete" ? "all" : "incomplete")}>Incomplete <b>{checklist.length - completed}</b></button><button className={filter === "completed" ? "selected" : ""} onClick={() => setFilter(filter === "completed" ? "all" : "completed")}>Completed <b>{completed}</b></button><button className="wp-carry" onClick={proposeMove}><ArrowRight size={14}/> Move to date</button><span className={`wp-save-state ${saveState}`} role="status">{saveState === "saved" ? "All changes saved" : saveState === "pending" ? "Unsaved changes…" : saveState === "saving" ? "Saving…" : saveState === "loading" ? "Loading…" : saveState === "conflict" ? "Changes need review" : "Save failed"}</span></div>
      {conflict&&<div className="wp-error" role="alert"><strong>This Workpad was also changed in another window.</strong><p>Your draft is preserved. Choose the document version to continue.</p><button onClick={()=>void resolveConflict(true).catch(fail)}>Keep my changes</button><button onClick={()=>void resolveConflict(false).catch(fail)}>Load latest</button><button onClick={()=>setCompare(!compare)}>Compare changes</button>{compare&&mergeWorkpadBlocks(base.current,blocks,conflict.blocks).conflicts.some(c=>c.reason==='structure')&&<p>Both windows changed the document structure. Your draft and the server version are preserved for comparison.<button onClick={()=>void resolveConflict(true,true).catch(fail)}>Replace latest document with my entire draft</button></p>}{compare&&mergeWorkpadBlocks(base.current,blocks,conflict.blocks).conflicts.map(c=><div key={c.blockId}><pre>Mine: {c.local?.content??'(deleted)'}</pre><pre>Latest: {c.remote?.content??'(deleted)'}</pre></div>)}</div>}
      {recovery&&<div className="wp-notice">A saved local draft is available.<button onClick={()=>{change(recovery);setRecovery(null);}}>Restore draft</button><button onClick={()=>void navigator.clipboard.writeText(blockText(recovery)).catch(fail)}>Copy draft</button><button onClick={()=>setRecovery(null)}>Dismiss</button></div>}
      {error && <div className="wp-error" role="alert">{error}<button onClick={() => { setError(""); void (state.current.loaded ? flush() : loadDay(date).then(accept)).catch(fail); }}>Retry save</button><button aria-label="Dismiss error" onClick={() => setError("")}><X size={14}/></button></div>}
      {message && <div className="wp-notice" role="status">{message}<button aria-label="Dismiss notice" onClick={() => setMessage("")}><X size={14}/></button></div>}
      <details className="wp-tools"><summary>Commands & formatting</summary><div className="wp-toolbar"><select aria-label="Block type" value={activeBlock?.type ?? "TEXT"} disabled={!activeBlock || busy} onChange={e => { const item = COMMANDS.find(c => c[1] === e.target.value); if (item && activeBlock) runCommand(item[0], activeBlock); }}><option value="IMAGE_GROUP" hidden>Image Group</option>{COMMANDS.filter(c => c[0] !== "task").map(c => <option key={c[0]} value={c[1]}>{c[2]}</option>)}</select><button aria-label="Add bullet" onClick={() => add("BULLET")}>• Bullet</button><button aria-label="Add checklist" onClick={() => add("CHECKLIST")}><Check size={15}/></button><button aria-label="Attach images" onClick={() => { uploadTarget.current = active; fileInput.current?.click(); }}><ImagePlus size={16}/></button><span/><button aria-label="Undo" disabled={!historyCounts.undo || busy} onClick={() => void undo()}><Undo2 size={15}/></button><button aria-label="Redo" disabled={!historyCounts.redo || busy} onClick={() => void undo(true)}><Redo2 size={15}/></button></div></details>
      {moveResult&&<div className="wp-notice">{moveResult.count} blocks moved to {dateLabel(moveResult.date)} <button onClick={()=>void jump(moveResult.date)}>View date</button>{moveResult.token&&<button onClick={()=>void undoDateMove()}>Undo move</button>}</div>}
      {carryMode&&<div className="wp-selection-bar"><strong>{autoCarry?'Carry over incomplete items':'Move selected blocks'} · {selected.length} selected</strong><button onClick={()=>setTargetDate(shiftDate(date,1))}>Tomorrow</button><input type="date" aria-label="Move target date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/><span>{autoCarry?'Completed items stay here. Ancestor context is retained.':'Selected subtrees and completion states will move.'}</span><button className="wp-primary" disabled={!selected.length||busy||targetDate===date||!validLocalDate(targetDate)} onClick={()=>void carry()}>Move {selected.length} selected</button><button onClick={()=>setCarryMode(false)}>Cancel</button></div>}
      {!!selected.length && <div className="wp-selection-bar"><strong>{selected.length} selected</strong><button aria-label="Copy selected blocks" onClick={() => void copyButton()}><Copy size={14}/></button><button aria-label="Cut selected blocks" onClick={()=>void copyButton(true)}>Cut</button><button aria-label="Indent selected blocks" onClick={() => change(indentBlocks(blocks, selected))}><Indent size={14}/></button><button aria-label="Outdent selected blocks" onClick={() => change(indentBlocks(blocks, selected, true))}><Outdent size={14}/></button><button aria-label="Move selected blocks up" onClick={() => move(-1)}><ArrowUp size={14}/></button><button aria-label="Move selected blocks down" onClick={() => move(1)}><ArrowDown size={14}/></button><button onClick={()=>{const incoming=cloneBlocks(copyBlocks(blocks,selected));change(insertAfter(blocks,selected.at(-1)??null,incoming));setSelected(incoming.map(b=>b.id));}}>Duplicate</button>{!fixedTab&&<button onClick={proposeMove}>Move to date</button>}<button aria-label="Delete selected blocks" onClick={() => remove()}><Trash2 size={14}/></button><button onClick={() => setSelected([])}>Clear</button></div>}
      <div ref={documentRoot} className="wp-editor" contentEditable={!busy&&saveState!=='loading'} suppressContentEditableWarning
        onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;void flush().catch(()=>{});}} onInput={()=>{const input=selectionEditor();const id=input?.closest<HTMLElement>('.wp-block')?.id.slice(3),block=state.current.blocks.find(b=>b.id===id);if(input&&block&&input.value!==block.content)editText(block,input);}}
        onKeyDown={e=>{if(e.target!==e.currentTarget)return;const input=selectionEditor(),id=input?.closest<HTMLElement>('.wp-block')?.id.slice(3),block=state.current.blocks.find(b=>b.id===id);if(input&&block){keyDown({...e,currentTarget:input,preventDefault:()=>e.preventDefault()} as React.KeyboardEvent<TextElement>,block);e.stopPropagation();}}} onBeforeInputCapture={e=>{const range=documentRange(documentRoot.current);if(range&&range.first!==range.last){const native=e.nativeEvent as InputEvent;if((native.inputType??'insertText')==='insertText'||native.inputType?.startsWith('delete')){e.preventDefault();const text=native.data??'';change(replaceTextRange(blocks,range.first,range.start,range.last,range.end,text));focus(range.first,range.start+text.length);}}}} aria-label="Daily Workpad" aria-busy={busy || saveState === "loading"} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); if (files.length) void upload(files, active); }}>
        {blocks.filter(b => visible.has(b.id)).map(block => <div key={block.id} id={`wp-${block.id}`} className={`wp-block wp-${block.type.toLowerCase()} ${selected.includes(block.id) ? "wp-selected" : ""} ${active === block.id ? "wp-active" : ""} ${block.metadata.strike ? "wp-strike" : ""} ${isChecked(block) && block.type === "CHECKLIST" ? "wp-checked" : ""}`} style={{ marginLeft: `${Math.min(12, depth(blocks, block.id)) * 24}px` }} onClick={()=>{setActive(block.id);setSelected([]);}} onDragOver={e => {
            e.preventDefault();e.stopPropagation();if(!dragging.current.length)return;
            const rect=e.currentTarget.getBoundingClientRect(),ratio=(e.clientY-rect.top)/rect.height;
            const zone:DropZone=ratio<.25?'before':ratio>.75?'after':e.clientX<rect.left+45?'sibling':'child';setDropHint({id:block.id,zone});
            const scroller=e.currentTarget.closest<HTMLElement>('.wp-fixed-scroll,.wp-stream-scroll')??documentRoot.current?.parentElement;
            if(scroller){const bounds=scroller.getBoundingClientRect();if(e.clientY<bounds.top+55)scroller.scrollBy(0,-24);else if(e.clientY>bounds.bottom-55)scroller.scrollBy(0,24);}
          }} onDrop={e => drop(e, block)}>
          {dropHint?.id===block.id&&<span className={`wp-drop-hint wp-drop-${dropHint.zone}`}>{({before:'Insert before',after:'Insert after',child:'Nest as child',sibling:'Outdent to sibling'})[dropHint.zone]}</span>}
          <button tabIndex={0} contentEditable={false} onContextMenu={e=>{e.preventDefault();if(!selected.includes(block.id))setSelected([block.id]);setActive(block.id);setMenu({x:e.clientX,y:e.clientY});}} className="wp-grip" aria-label={`Select block ${block.content || block.type}`} draggable onClick={e => { e.stopPropagation(); choose(e, block.id, true); }} onDragEnd={()=>{dragging.current=[];setDropHint(null);}} onDragStart={e => { dragging.current=selected.includes(block.id)?selected:[block.id]; e.dataTransfer.setData("application/x-workpad-owner",scope??date);e.dataTransfer.setData("application/x-workpad-selection", JSON.stringify(selected.includes(block.id) ? selected : [block.id])); e.dataTransfer.effectAllowed = "move"; }}><GripVertical size={15}/></button>
          {carryMode && <input contentEditable={false} className="wp-carry-check" type="checkbox" aria-label={`Carry ${block.content}`} checked={selected.includes(block.id)} onClick={e => e.stopPropagation()} onChange={() => setSelected(selectBlocks(blocks, selected, anchor.current, block.id, false, true))}/>}
          {block.type === "CHECKLIST" ? <input contentEditable={false} className="wp-checkbox" type="checkbox" aria-label={`Complete ${block.content}`} checked={!!isChecked(block)} disabled={busy} onClick={e => e.stopPropagation()} onChange={() => void toggle(block)}/> : block.type === "BULLET" || block.type === "NUMBERED" ? <span contentEditable={false} className="wp-bullet">{block.type === "BULLET" ? "•" : `${ordinals.get(block.id)}.`}</span> : null}
          <div className="wp-block-body">
            {block.type === "DIVIDER" ? <hr contentEditable={false}/> : ["IMAGE", "IMAGE_GROUP"].includes(block.type) ? <div contentEditable={false} className={`wp-images ${block.metadata.layout === "stack" ? "wp-images-stack" : ""}`}>
              {(block.metadata.images ?? []).map((img, index) => <figure key={`${img.id}-${index}`} className={active === block.id && activeImage === index ? "wp-image-selected" : ""} onClick={() => { setActive(block.id); setActiveImage(index); }} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("application/x-workpad-image", JSON.stringify({ blockId: block.id, index })); }}><div className="wp-image-frame" style={{ width: `${img.width ?? 100}%` }}><PrivateImage image={img} expand={(url, caption) => setExpanded({ url, caption })}/><button className="wp-image-resize" aria-label={`Resize image ${index + 1}`} onPointerDown={e => resize(e, block, index)}/></div><input aria-label={`Image ${index + 1} caption`} placeholder="Add a caption…" value={img.caption ?? ""} onChange={e => imageChange(block, index, { caption: e.target.value })}/>{img.description && <p className="wp-image-description">{img.description}</p>}</figure>)}
              {!(block.metadata.images?.length) && <button className="wp-empty-image" onClick={() => { uploadTarget.current = block.id; fileInput.current?.click(); }}><ImagePlus size={20}/>Choose, paste, or drop images</button>}
            </div> : <EditableText onMouseDown={e=>{selectStage.current=null;const link=(e.target as HTMLElement).closest<HTMLElement>('.wp-inline-wiki');if(link){e.preventDefault();e.stopPropagation();const occurrence=wikiOccurrences(block.content).find(o=>o.start===Number(link.dataset.start));if(occurrence)void openWikiOccurrence(block,occurrence,((block.metadata.wikiLinks??[]) as WikiLink[]).find(l=>l.name===occurrence.name&&l.ordinal===occurrence.ordinal),e.ctrlKey||e.metaKey);}}} aria-label={`${block.type === "CHECKLIST" ? "Checklist" : "Block"} text`} rows={Math.max(1, block.content.split("\n").length)} ref={element => { if (element) { editors.current.set(block.id, element);  } else editors.current.delete(block.id); }} value={block.workTaskId ? titleDrafts[block.id] ?? env.tasks.find(t => t.id === block.workTaskId)?.title ?? block.content : block.content} placeholder={block.type === "CALLOUT" ? "A thought worth keeping…" : "Write something, or type / for commands…"} disabled={busy || saveState === "loading"} onFocus={() => { setActive(block.id);setSelected([]); }} onBeforeInput={e=>{textEdit.current={id:block.id,start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd,inputType:(e.nativeEvent as InputEvent).inputType??""};}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;void flush().catch(()=>{});}} onKeyDown={e => keyDown(e, block)} onKeyUp={()=>{plainPaste.current=false;}} onPaste={e => { e.stopPropagation(); paste(e, block.id); }} onChange={e=>editText(block,e.currentTarget)} onBlur={() => { if(!composing.current)void flush().catch(() => {}); }}/>}
            {wiki?.id===block.id&&<div contentEditable={false} className="wp-command" role="listbox" aria-label="Link a note">{suggestions.map((note,i)=><button key={note.id} role="option" aria-selected={wiki.index===i} onMouseDown={e=>e.preventDefault()} onClick={()=>void chooseNote(note)}>{note.title}<small>{note.scope}{suggestions.filter(n=>n.title===note.title&&n.scope===note.scope).length>1?` · ${note.id.slice(0,6)}`:""}</small></button>)}<button role="option" aria-selected={wiki.index===suggestions.length} disabled={!wiki.query.trim()} onMouseDown={e=>e.preventDefault()} onClick={()=>void chooseNote()}>Create “{wiki.query}” · WORK FLOW</button></div>}
            {command?.id === block.id && <div contentEditable={false} className="wp-command" role="listbox" aria-label="Quick commands">{COMMANDS.filter(c => c[0].startsWith(command.query)).map((c, i) => <button key={c[0]} role="option" aria-selected={i === command.index} onMouseDown={e => e.preventDefault()} onClick={() => runCommand(c[0], block, command.cursor)}><code>/{c[0]}</code>{c[2]}</button>)}</div>}
            {(block.workTaskId || block.sourceDate) && <div contentEditable={false} className="wp-block-meta">{block.workTaskId && <button className="wp-task-link" onClick={e => { e.stopPropagation(); setActive(block.id); }}><Link2 size={11}/> WorkTask{env.projects.find(p => p.id === env.tasks.find(t => t.id === block.workTaskId)?.projectId)?.title ? ` · ${env.projects.find(p => p.id === env.tasks.find(t => t.id === block.workTaskId)?.projectId)?.title}` : ""}</button>}{block.sourceDate && <button className="wp-source" aria-label={`Source ${block.sourceDate}`} onClick={e => { e.stopPropagation(); void jump(block.sourceDate!, block.sourceBlockId ?? undefined); }}>↗ {Number(block.sourceDate.slice(5, 7))}/{Number(block.sourceDate.slice(8))}</button>}</div>}
          </div>
        </div>)}
        {saveState !== "loading" && <button contentEditable={false} className="wp-add-block" disabled={busy} onClick={() => add()}><Plus size={15}/>{blocks.length ? "Add a block" : fixedTab ? "Add a workflow step" : "Start your day — add a block"}</button>}
      </div>
    </main>
    <aside className="wp-context" inert={busy || saveState === "loading"}><details className="wp-context-details"><summary>Block details & keyboard help</summary>
      {linkedTask ? <><TaskDetails task={linkedTask} hideActions/><button className="wp-unlink" disabled={busy} onClick={() => void unlink()}><Link2 size={14}/>Unlink WorkTask</button></> : activeBlock ? <section><h2>{["IMAGE", "IMAGE_GROUP"].includes(activeBlock.type) ? "Image details" : "Block details"}</h2><p className="wp-muted">{activeBlock.type.replaceAll("_", " ")} · Level {depth(blocks, activeBlock.id) + 1}</p>{contextImage && <><label>Image<select value={activeImage} onChange={e => setActiveImage(Number(e.target.value))}>{activeBlock.metadata.images!.map((img, index) => <option key={`${img.id}-${index}`} value={index}>Image {index + 1}</option>)}</select></label><label>Width · {contextImage.width ?? 100}%<input aria-label="Image width" type="range" min="20" max="100" value={contextImage.width ?? 100} onChange={e => imageChange(activeBlock, activeImage, { width: imageWidth(Number(e.target.value)) })}/></label><small>Aspect ratio is preserved.</small><label>Caption<input value={contextImage.caption ?? ""} onChange={e => imageChange(activeBlock, activeImage, { caption: e.target.value })}/></label><label>Description<textarea rows={3} value={contextImage.description ?? ""} onChange={e => imageChange(activeBlock, activeImage, { description: e.target.value })}/></label><label>Layout<select value={String(activeBlock.metadata.layout ?? "row")} onChange={e => patch(activeBlock.id, { metadata: { ...activeBlock.metadata, layout: e.target.value } })}><option value="row">Side by side</option><option value="stack">Stacked</option></select></label><button onClick={() => { const images = activeBlock.metadata.images!.filter((_, index) => index !== activeImage); patch(activeBlock.id, { type: images.length > 1 ? "IMAGE_GROUP" : "IMAGE", metadata: { ...activeBlock.metadata, images } }); setActiveImage(0); }}><Trash2 size={13}/> Delete image</button></>}{activeBlock.sourceDate && <button onClick={() => void jump(activeBlock.sourceDate!, activeBlock.sourceBlockId ?? undefined)}>↗ Open source · {activeBlock.sourceDate}</button>}<div className="wp-context-actions"><button onClick={() => change(indentBlocks(blocks, [activeBlock.id]))}><Indent size={14}/>Indent</button><button onClick={() => change(indentBlocks(blocks, [activeBlock.id], true))}><Outdent size={14}/>Outdent</button><button onClick={() => remove([activeBlock.id])}><Trash2 size={14}/>Delete block</button></div></section> : <section><h2><Lightbulb size={17}/> Quick help</h2><p className="wp-muted">A daily workpad for plans, evidence, and reflection.</p></section>}
      <section className="wp-cheatsheet"><h3>단축키</h3>{shortcuts.map(([key, label]) => <div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}<p>핸들을 클릭해 블록을 선택하세요. 부모 블록을 선택하면 하위 내용과 이미지도 함께 처리합니다.</p></section>
    </details>{fixedTab&&<button onClick={()=>change(blocks.map(b=>b.type==="CHECKLIST"?{...b,checked:false}:b))}>Reset checklists</button>}</aside>
    {menu&&<div className="wp-block-menu" role="menu" style={{position:'fixed',left:Math.min(menu.x,window.innerWidth-230),top:Math.min(menu.y,window.innerHeight-300)}}>
      <select aria-label="Selected block type" onChange={e=>{change(blocks.map(b=>selected.includes(b.id)&&!b.workTaskId?{...b,type:e.target.value as Block['type']}:b));setMenu(null);}} defaultValue=""><option value="" disabled>Block type</option>{COMMANDS.filter(c=>c[0]!=='task').map(c=><option key={c[0]} value={c[1]}>{c[2]}</option>)}</select>
      <button onClick={()=>{const incoming=cloneBlocks(copyBlocks(blocks,selected));change(insertAfter(blocks,selected.at(-1)??null,incoming));setSelected(incoming.map(b=>b.id));setMenu(null);}}>Duplicate</button>
      {!fixedTab&&<button onClick={()=>{proposeMove();setMenu(null);}}>Move to date</button>}
      <button onClick={()=>{remove();setMenu(null);}}>Delete</button><details><summary>More</summary><button onClick={()=>void copyButton()}>Copy</button><button onClick={()=>void copyButton(true)}>Cut</button><button onClick={()=>move(-1)}>Move up</button><button onClick={()=>move(1)}>Move down</button><button onClick={()=>change(indentBlocks(blocks,selected))}>Indent</button><button onClick={()=>change(indentBlocks(blocks,selected,true))}>Outdent</button></details><button onClick={()=>setMenu(null)}>Close</button>
    </div>}
    {topic&&<TopicNotePanel id={topic} onClose={()=>setTopic(null)}/>}
    {linkChoices&&<div className="wp-topic-shade"><section className="wp-topic" role="dialog" aria-label="Choose a note"><h2>{linkChoices.occurrence.name}</h2><p>Choose the source note.</p>{linkChoices.notes.map(note=><button key={note.id} onClick={()=>void bindAndOpen(linkChoices.block,linkChoices.occurrence,note).catch(fail)}>{note.title} · {note.scope} · {note.id.slice(0,6)}</button>)}<button onClick={()=>setLinkChoices(null)}>Cancel</button></section></div>}
    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) void upload(files, uploadTarget.current); e.target.value = ""; }}/>
    {expanded && <div className="wp-lightbox" role="dialog" aria-modal="true" aria-label="Expanded image" onClick={() => setExpanded(null)} onKeyDown={e => { if (e.key === "Escape") setExpanded(null); }} tabIndex={-1} ref={node => node?.focus()}><button aria-label="Close image" onClick={() => setExpanded(null)}><X size={22}/></button><img src={expanded.url} alt={expanded.caption}/>{expanded.caption && <p>{expanded.caption}</p>}</div>}
  </div>;
}
