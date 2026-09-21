'use client';
import {usePathname,useRouter} from 'next/navigation';
import {FolderKanban,ChartGantt,ListTodo,NotebookPen} from 'lucide-react';
import {SharedSidebar} from '@/components/Sidebar';
import {useGlobalTabs} from '@/components/GlobalTabs';
import {WorkflowProvider} from './WorkflowContext';
import type {ReactNode} from 'react';
const pages=[{label:'Projects',path:'projects',icon:FolderKanban},{label:'Timeline',path:'timeline',icon:ChartGantt},{label:'To-do',path:'todo',icon:ListTodo},{label:'Workpad',path:'today',icon:NotebookPen}];
export default function WorkflowShell({children}:{children:ReactNode}){
 const path=usePathname(),router=useRouter(),tabs=useGlobalTabs();
 return <div className="wf-shell"><SharedSidebar system="WORK FLOW" groups={[{section:'WORK FLOW',items:pages.map(page=>({label:page.label,icon:page.icon,active:path===`/workflow/${page.path}`,destination:`/workflow/${page.path}`,action:()=>tabs?tabs.navigate(`/workflow/${page.path}`):router.push(`/workflow/${page.path}`)}))}]}/><div className="workflow wf-content"><WorkflowProvider>{children}</WorkflowProvider></div></div>;
}
