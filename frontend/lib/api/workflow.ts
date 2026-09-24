import { apiClient } from './client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { encodeImage } from './imageUpload';

export type TaskStatus = 'TODO' | 'DOING' | 'DONE';
export type Project = {id:string; title:string; status:'ACTIVE'|'PAUSED'|'DONE'; startDate:string|null; endDate:string|null; color:string; memo:string|null; order:number};
export type Phase = {id:string; projectId:string; title:string; status:TaskStatus; startDate:string|null; endDate:string|null; memo:string|null; order:number};
export type WorkTask = {id:string; title:string; status:TaskStatus; projectId:string|null; phaseId:string|null; priority:'LOW'|'NORMAL'|'HIGH'; startDate:string|null; dueDate:string|null; memo:string|null; order:number};
export type EntityInput<T extends {id:string}> = Omit<T,'id'> & {id?:string};
export type WorkflowImage = {id:string; url?:string; width?:number; height?:number; mimeType?:string; caption?:string; description?:string};
export type WorkpadBlock = {id:string; parentId:string|null; order:number; type:'TEXT'|'NUMBERED'|'BULLET'|'CHECKLIST'|'H1'|'H2'|'H3'|'CALLOUT'|'IMAGE'|'IMAGE_GROUP'|'DIVIDER'; content:string; checked:boolean; workTaskId:string|null; sourceBlockId:string|null; sourceDate:string|null; metadata:{images?:WorkflowImage[]; [key:string]:unknown}};
export type WorkpadDay = {date:string; revision:number; blocks:WorkpadBlock[]};
export type WorkpadDaySave = Pick<WorkpadDay,'revision'|'blocks'> & {taskTitles?:Record<string,string>};
export type WorkpadMove = {blockIds:string[]; targetDate:string; expectedSourceRevision:number; expectedTargetRevision:number; incompleteOnly?:boolean};
export type WorkpadMoveResult = {source:WorkpadDay; target:WorkpadDay; movedBlockIds:string[]; undoToken:string|null};
export type WorkflowData = {projects:Project[]; phases:Phase[]; tasks:WorkTask[]};
export type TodoPreferences = {groupMode:'PROJECT'|'FLAT'; projectOrder:string[]; sort:'DEFAULT'|'DUE_DATE'|'STATUS'|'PRIORITY'|'START_DATE'|'ORDER'; showCompleted:boolean; showUndated:boolean; rememberCollapse:boolean; collapsedProjects:string[]};
export type TopicNote = {id:string; workspaceId:string|null; scope:string; title:string; content:string; version:number};
export type WorklogBacklink = {date:string; blockId:string; excerpt:string};
export type FixedTab = {id:string; title:string; revision:number; blocks:WorkpadBlock[]};
const base='/api/workflow';
function save<T extends {id:string}>(path:string,input:EntityInput<T>):Promise<T> {return input.id ? apiClient.put(`${base}/${path}/${input.id}`,input) : apiClient.post(`${base}/${path}`,input);}
export const workflowApi = {
  get:()=>apiClient.get<WorkflowData>(base),
  saveProject:(input:EntityInput<Project>)=>save<Project>('projects',input),
  savePhase:(input:EntityInput<Phase>)=>save<Phase>('phases',input),
  saveTask:(input:EntityInput<WorkTask>)=>save<WorkTask>('tasks',input),
  deleteProject:(id:string)=>apiClient.delete<void>(`${base}/projects/${id}`),
  deletePhase:(id:string)=>apiClient.delete<void>(`${base}/phases/${id}`),
  deleteTask:(id:string)=>apiClient.delete<void>(`${base}/tasks/${id}`),
  recordedDates:(direction?:{before?:string;after?:string})=>apiClient.get<string[]>(base+'/days?'+new URLSearchParams(direction).toString()),
  fixedTabs:()=>apiClient.get<FixedTab[]>(base+'/fixed'),
  getFixed:(id:string)=>apiClient.get<FixedTab>(base+'/fixed/'+id),
  saveFixed:(id:string|null,tab:Omit<FixedTab,'id'>)=>id?apiClient.put<FixedTab>(base+'/fixed/'+id,tab):apiClient.post<FixedTab>(base+'/fixed',tab),
  searchNotes:(q:string)=>apiClient.get<TopicNote[]>(base+'/notes?q='+encodeURIComponent(q)),
  getNote:(id:string)=>apiClient.get<TopicNote>(base+'/notes/'+id),
  createNote:(title:string)=>apiClient.post<TopicNote>(base+'/notes',{title,content:'',version:0}),
  resolveNote:(title:string)=>apiClient.post<TopicNote[]>(base+'/notes/resolve',{title}),
  saveNote:(note:TopicNote)=>apiClient.put<TopicNote>(base+'/notes/'+note.id,note),
  backlinks:(id:string)=>apiClient.get<WorklogBacklink[]>(base+'/notes/'+id+'/backlinks'),
  getDay:(date:string)=>apiClient.get<WorkpadDay>(`${base}/days/${date}`),
  saveDay:(date:string,day:WorkpadDaySave)=>apiClient.put<WorkpadDay>(`${base}/days/${date}`,day),
  promote:(date:string,blockId:string)=>apiClient.post<WorkTask>(`${base}/days/${date}/promote`,{blockId}),
  carry:(date:string,blockIds:string[],targetDate:string)=>apiClient.post<WorkpadDay>(`${base}/days/${date}/carry`,{blockIds,targetDate}),
  move:(date:string,input:WorkpadMove)=>apiClient.post<WorkpadMoveResult>(`${base}/days/${date}/move`,input),
  undoMove:(token:string)=>apiClient.post<WorkpadMoveResult>(`${base}/moves/${token}/undo`,{}),
  unlink:(date:string,blockId:string)=>apiClient.post<WorkpadDay>(`${base}/days/${date}/unlink`,{blockId}),
  addToToday:(id:string,date:string)=>apiClient.post<WorkpadDay>(`${base}/tasks/${id}/today`,{date}),
  getPreferences:()=>apiClient.get<Partial<TodoPreferences>>(`${base}/preferences`),
  savePreferences:(input:TodoPreferences)=>apiClient.put<TodoPreferences>(`${base}/preferences`,input),
  uploadImage:async(file:File):Promise<WorkflowImage>=>{
    return apiClient.post<WorkflowImage>(`${base}/images`,await encodeImage(file));
  },
  getImage:async(id:string):Promise<Blob>=>{
    const client=createSupabaseBrowserClient(); const session=client ? (await client.auth.getSession()).data.session : null;
    const response=await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL??'http://localhost:8080'}${base}/images/${encodeURIComponent(id)}`,{headers:session?{Authorization:`Bearer ${session.access_token}`}:{},cache:'no-store'});
    if(!response.ok)throw new Error('이미지를 불러오지 못했습니다.'); return response.blob();
  },
};
