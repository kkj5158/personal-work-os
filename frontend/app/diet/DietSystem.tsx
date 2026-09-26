"use client";
import {useEffect,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {House,ListChecks,CalendarDays,NotebookPen,ChartNoAxesCombined,Images,Target} from "lucide-react";
import {SharedSidebar} from "@/components/Sidebar";
import {useGlobalTabs,useShellNavigationGuard} from "@/components/GlobalTabs";
import {useDietStore} from "./store";
import {dailyNotesApi} from "@/lib/diet/dailyNote";
import {notesApi} from "@/lib/api/notes";
/** The existing NOTE SYS "다이어트 기록" workspace, opened by its stable id: the DIET NOTE-sync target, else the active workspace with that name. Nothing is created; without one the entry is disabled. */
export const DIET_NOTE_WORKSPACE="다이어트 기록";
export const dietNoteHref=(workspaceId:string|null|undefined)=>workspaceId?`/notes?workspace=${workspaceId}`:undefined;
import Home from "./Home";
import Record from "./Record";
import Planner from "./Planner";
import Progress from "./Progress";
import BoardPage from "./BoardPage";
import "./diet.css";
export default function DietSystem(){const store=useDietStore(),path=usePathname(),router=useRouter(),shell=useGlobalTabs();const navigate=(href:string)=>shell?shell.navigate(href):router.push(href);
 const [noteWorkspaceId,setNoteWorkspaceId]=useState<string|null>(null);
 useEffect(()=>{let live=true;dailyNotesApi.syncSettings().then(async s=>s.workspaceId??(await notesApi.workspaces()).find(w=>!w.archivedAt&&w.name===DIET_NOTE_WORKSPACE)?.id??null).then(id=>{if(live)setNoteWorkspaceId(id);}).catch(()=>{});return()=>{live=false;};},[]);
 useShellNavigationGuard(proceed=>{if(!store.busy&&!store.pendingChecks)proceed();});
 const nav=[{label:"홈",icon:House,href:"/diet"},{label:"기록",icon:ListChecks,href:"/diet/record"},{label:"플래너",icon:CalendarDays,href:"/diet/planner"},{label:"다이어트 노트",icon:NotebookPen,href:dietNoteHref(noteWorkspaceId)},{label:"통계",icon:ChartNoAxesCombined,href:"/diet/progress"},{label:"갤러리",icon:Images,href:"/diet/gallery"},{label:"정체성/목표",icon:Target,href:"/diet/identity"}];
 return <div className="diet-shell"><SharedSidebar system="DIET SYS" groups={[{section:"DIET SYS",items:nav.map(n=>({...n,active:path===n.href,destination:n.href,action:n.href?()=>navigate(n.href!):undefined}))}]}/><div className="diet"><div aria-live="polite" className="diet-save-state">{store.pendingChecks?`${store.pendingChecks}개 기록 저장 중…`:store.busy?"저장 중…":""}</div>{store.error&&<div role="alert" className="diet-error">{store.error} <button onClick={()=>void store.reload()}>다시 불러오기</button></div>}{path==="/diet/gallery"?<BoardPage mode="gallery"/>:path==="/diet/identity"?<BoardPage mode="identity"/>:store.loading?<p>DIET SYS 불러오는 중…</p>:path==="/diet/record"?<Record store={store}/>:path==="/diet/planner"?<Planner store={store}/>:path==="/diet/progress"?<Progress store={store}/>:<Home store={store}/>}</div></div>;
}
