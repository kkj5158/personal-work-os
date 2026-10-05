'use client';
import {usePathname,useRouter} from 'next/navigation';
import {FolderKanban,CalendarDays,NotebookPen,ListTodo,Clock3,ChartGantt,ListChecks} from 'lucide-react';
import {SharedSidebar} from '@/components/Sidebar';
import {useGlobalTabs} from '@/components/GlobalTabs';
import {WorkflowProvider} from './WorkflowContext';
import type {ReactNode} from 'react';
// Locked V1 IA: core flow Project → This Week → Workpad; support views below. No top-level Archive.
// Existing paths (/workflow/today, /workflow/todo) are kept so saved Global Tabs keep working.
export const WORKFLOW_NAV_CORE=[{label:'Projects',path:'projects',icon:FolderKanban},{label:'This Week',path:'week',icon:CalendarDays},{label:'Workpad',path:'today',icon:NotebookPen}];
export const WORKFLOW_NAV_SUPPORT=[{label:'All To-dos',path:'todo',icon:ListTodo},{label:'Waiting',path:'waiting',icon:Clock3},{label:'WORK QUEUE',path:'attention',icon:ListChecks},{label:'Timeline',path:'timeline',icon:ChartGantt}];
export default function WorkflowShell({children}:{children:ReactNode}){
 const path=usePathname(),router=useRouter(),tabs=useGlobalTabs();
 const items=(pages:typeof WORKFLOW_NAV_CORE)=>pages.map(page=>({label:page.label,icon:page.icon,active:path===`/workflow/${page.path}`,destination:`/workflow/${page.path}`,action:()=>tabs?tabs.navigate(`/workflow/${page.path}`):router.push(`/workflow/${page.path}`)}));
 return <div className="wf-shell"><SharedSidebar system="WORK FLOW" groups={[{section:'WORK FLOW',items:items(WORKFLOW_NAV_CORE)},{section:'SUPPORT',items:items(WORKFLOW_NAV_SUPPORT)}]}/><div className="workflow wf-content"><WorkflowProvider>{children}</WorkflowProvider></div></div>;
}
