"use client";
import {usePathname,useRouter} from "next/navigation";
import {House,ListChecks,CalendarDays,ChartNoAxesCombined,Images,Target} from "lucide-react";
import {SharedSidebar} from "@/components/Sidebar";
import {useGlobalTabs,useShellNavigationGuard} from "@/components/GlobalTabs";
import {useDietStore} from "./store";
import Home from "./Home";
import Record from "./Record";
import Planner from "./Planner";
import Progress from "./Progress";
import "./diet.css";
export default function DietSystem(){const store=useDietStore(),path=usePathname(),router=useRouter(),shell=useGlobalTabs();const navigate=(href:string)=>shell?shell.navigate(href):router.push(href);
 useShellNavigationGuard(proceed=>{if(!store.busy)proceed();});
 const nav=[{label:"홈",icon:House,href:"/diet"},{label:"기록",icon:ListChecks,href:"/diet/record"},{label:"플래너",icon:CalendarDays,href:"/diet/planner"},{label:"통계",icon:ChartNoAxesCombined,href:"/diet/progress"},{label:"갤러리",icon:Images},{label:"정체성/목표",icon:Target}];
 return <div className="diet-shell"><SharedSidebar system="DIET SYS" groups={[{section:"DIET SYS",items:nav.map(n=>({...n,active:path===n.href,destination:n.href,action:n.href?()=>navigate(n.href!):undefined}))}]}/><div className="diet"><div aria-live="polite" className="diet-save-state">{store.busy?"저장 중…":""}</div>{store.error&&<div role="alert" className="diet-error">{store.error} <button onClick={()=>void store.reload()}>다시 불러오기</button></div>}{store.loading?<p>DIET SYS 불러오는 중…</p>:path==="/diet/record"?<Record store={store}/>:path==="/diet/planner"?<Planner store={store}/>:path==="/diet/progress"?<Progress store={store}/>:<Home store={store}/>}</div></div>;
}
