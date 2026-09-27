import type {ReactNode} from 'react';
import WorkflowShell from './WorkflowShell';
import './workflow.css';
import './projects-todo.css';
import './task-detail.css';
import './week.css';
import './projects.css';
export default function Layout({children}:{children:ReactNode}){return <WorkflowShell>{children}</WorkflowShell>;}
