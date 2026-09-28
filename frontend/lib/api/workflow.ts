import { apiClient } from './client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { encodeImage } from './imageUpload';

export type TaskStatus = 'TODO' | 'DOING' | 'WAITING' | 'DONE';
export type PhaseStatus = 'TODO' | 'DOING' | 'DONE';
export type ProjectStatus = 'READY' | 'ACTIVE' | 'PAUSED' | 'DONE';
export type ProjectType = 'GENERAL' | 'DEVELOPMENT' | 'CONTENT' | 'PERSONAL';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
/** V1 fields are optional so legacy payloads and fixtures remain valid; the server always returns them. */
export type Project = {id:string; title:string; status:ProjectStatus; startDate:string|null; endDate:string|null; color:string; memo:string|null; order:number;
  projectType?:ProjectType; goal?:string|null; archivedAt?:string|null; nextTaskId?:string|null; unassignedWeight?:number|null; revision?:number;
  /** Projects catalog group; null/absent = 그룹 없음 (a projection, not a stored group). */ groupId?:string|null};
/** Projects catalog organization only (never Phase, type, status or progress). */
export type ProjectGroup = {id:string; name:string; order:number; revision:number};
export type Phase = {id:string; projectId:string; title:string; status:PhaseStatus; startDate:string|null; endDate:string|null; memo:string|null; order:number;
  weight?:number|null; progressOverride?:number|null; revision?:number};
/** startDate/dueDate are the legacy Timeline range; deadlineDate is the V1 real deadline. */
export type WorkTask = {id:string; title:string; status:TaskStatus; projectId:string|null; phaseId:string|null; priority:Priority; startDate:string|null; dueDate:string|null; memo:string|null; order:number;
  deadlineDate?:string|null; waitingReason?:string|null; waitingNextAction?:string|null; waitingCheckDate?:string|null; waitingFlagged?:boolean;
  nextStep?:string|null; completedAt?:string|null; previousStatus?:TaskStatus|null; archivedAt?:string|null; revision?:number; updatedAt?:string|null};
export type PlanDay = {taskId:string; date:string; order:number};
export type EntityInput<T extends {id:string}> = Omit<T,'id'> & {id?:string};
export type WorkflowImage = {id:string; url?:string; width?:number; height?:number; mimeType?:string; caption?:string; description?:string};
export type WorkpadBlock = {id:string; parentId:string|null; order:number; type:'TEXT'|'NUMBERED'|'BULLET'|'CHECKLIST'|'H1'|'H2'|'H3'|'CALLOUT'|'IMAGE'|'IMAGE_GROUP'|'DIVIDER'; content:string; checked:boolean; workTaskId:string|null; sourceBlockId:string|null; sourceDate:string|null; metadata:{images?:WorkflowImage[]; [key:string]:unknown}};
export type WorkpadDay = {date:string; revision:number; blocks:WorkpadBlock[]};
export type WorkpadDaySave = Pick<WorkpadDay,'revision'|'blocks'> & {taskTitles?:Record<string,string>};
export type WorkpadMove = {blockIds:string[]; targetDate:string; expectedSourceRevision:number; expectedTargetRevision:number; incompleteOnly?:boolean};
export type WorkpadMoveResult = {source:WorkpadDay; target:WorkpadDay; movedBlockIds:string[]; undoToken:string|null};
export type WorkflowData = {projects:Project[]; phases:Phase[]; tasks:WorkTask[]; planDays?:PlanDay[]; groups?:ProjectGroup[]};
export type TaskPatch = Partial<Pick<WorkTask,'title'|'projectId'|'phaseId'|'priority'|'startDate'|'dueDate'|'deadlineDate'|'memo'|'nextStep'|'order'|'waitingReason'|'waitingNextAction'|'waitingCheckDate'|'waitingFlagged'>>;
export type ProjectPatch = Partial<Pick<Project,'title'|'status'|'projectType'|'goal'|'startDate'|'endDate'|'color'|'memo'|'order'|'nextTaskId'|'unassignedWeight'>>;
export type PhasePatch = Partial<Pick<Phase,'title'|'status'|'startDate'|'endDate'|'memo'|'order'|'weight'|'progressOverride'>>;
export type StatusChange = {status:TaskStatus; waitingReason?:string|null; waitingNextAction?:string|null; waitingCheckDate?:string|null; waitingFlagged?:boolean};
export type TaskReferenceResult = {day:WorkpadDay; blockId:string; created:boolean; planDayCreated:boolean};
export type FocusSlot = {slot:number; title:string; memo:string};
export type WeekGoal = {id:string|null; text:string; checked:boolean; order:number};
export type WeekProject = {projectId:string; order:number; scopeLine:string|null};
export type WeekTask = {taskId:string; selected:boolean; selectionOrder:number|null; plannedDates:string[]};
export type WeekView = {weekStart:string; revision:number; focusSlots:FocusSlot[]; goals:WeekGoal[]; projects:WeekProject[]; tasks:WeekTask[]; planDays:PlanDay[]};
export type PlannedTask = {date:string; order:number; task:WorkTask};
export type RecentRecord = {date:string; blockId:string; taskId:string; taskTitle:string; excerpt:string; hasImage:boolean; hasNote:boolean; href:string};
export type WaitingView = {today:string; readyToCheck:WorkTask[]; waiting:WorkTask[]};
export type ResourceType = 'NOTE'|'DRIVE'|'DESIGN'|'GIT'|'AI_CHAT'|'WEB';
export type Resource = {id:string; projectId:string|null; taskId:string|null; noteId:string|null; url:string|null; title:string; type:ResourceType; memo:string|null; order:number; pinned:boolean};
export type ResourceInput = {projectId?:string|null; taskId?:string|null; noteId?:string|null; url?:string|null; title?:string|null; type?:ResourceType|null; memo?:string|null; pinned?:boolean};
export type TaskEvent = {id:string; kind:string; fromStatus:string|null; toStatus:string|null; payload:Record<string,unknown>; createdAt:string};
export type TodoPreferences = {groupMode:'PROJECT'|'FLAT'; projectOrder:string[]; sort:'UPDATED'|'PROJECT'|'DEADLINE'|'PRIORITY'|/** legacy stored keys, read through normalizeSort */'DEFAULT'|'DUE_DATE'|'STATUS'|'START_DATE'|'ORDER'; showCompleted:boolean; showUndated:boolean; rememberCollapse:boolean; collapsedProjects:string[]};
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
  addToToday:(id:string,date:string)=>apiClient.post<TaskReferenceResult>(`${base}/tasks/${id}/today`,{date}),
  continueTask:(id:string,date:string)=>apiClient.post<TaskReferenceResult>(`${base}/tasks/${id}/continue`,{date}),
  patchTask:(id:string,expectedRevision:number,patch:TaskPatch)=>apiClient.patch<WorkTask>(`${base}/tasks/${id}`,{...patch,expectedRevision}),
  patchProject:(id:string,expectedRevision:number,patch:ProjectPatch)=>apiClient.patch<Project>(`${base}/projects/${id}`,{...patch,expectedRevision}),
  patchPhase:(id:string,expectedRevision:number,patch:PhasePatch)=>apiClient.patch<Phase>(`${base}/phases/${id}`,{...patch,expectedRevision}),
  changeStatus:(id:string,expectedRevision:number,change:StatusChange)=>apiClient.post<WorkTask>(`${base}/tasks/${id}/status`,{...change,expectedRevision}),
  archiveTask:(id:string,expectedRevision:number,archived:boolean)=>apiClient.post<WorkTask>(`${base}/tasks/${id}/archive`,{archived,expectedRevision}),
  archiveProject:(id:string,expectedRevision:number,archived:boolean)=>apiClient.post<Project>(`${base}/projects/${id}/archive`,{archived,expectedRevision}),
  duplicateTask:(id:string)=>apiClient.post<WorkTask>(`${base}/tasks/${id}/duplicate`,{}),
  taskEvents:(id:string)=>apiClient.get<TaskEvent[]>(`${base}/tasks/${id}/events`),
  planDays:(id:string)=>apiClient.get<PlanDay[]>(`${base}/tasks/${id}/plan-days`),
  addPlanDay:(id:string,date:string)=>apiClient.put<PlanDay[]>(`${base}/tasks/${id}/plan-days/${date}`,{}),
  removePlanDay:(id:string,date:string)=>apiClient.delete<PlanDay[]>(`${base}/tasks/${id}/plan-days/${date}`),
  movePlanDay:(taskId:string,from:string,to:string)=>apiClient.post<{merged:boolean;planDays:PlanDay[]}>(`${base}/plan-days/move`,{taskId,from,to}),
  plan:(from:string,to:string)=>apiClient.get<PlannedTask[]>(`${base}/plan?from=${from}&to=${to}`),
  week:(weekStart:string)=>apiClient.get<WeekView>(`${base}/weeks/${weekStart}`),
  includeProject:(weekStart:string,projectId:string,scopeLine?:string|null)=>apiClient.put<WeekView>(`${base}/weeks/${weekStart}/projects/${projectId}`,scopeLine===undefined?null:{scopeLine}),
  excludeProject:(weekStart:string,projectId:string)=>apiClient.delete<WeekView>(`${base}/weeks/${weekStart}/projects/${projectId}`),
  selectTask:(weekStart:string,taskId:string)=>apiClient.put<WeekView>(`${base}/weeks/${weekStart}/tasks/${taskId}`,{}),
  unselectTask:(weekStart:string,taskId:string)=>apiClient.delete<WeekView>(`${base}/weeks/${weekStart}/tasks/${taskId}`),
  saveWeekContent:(weekStart:string,expectedRevision:number,focusSlots:FocusSlot[],goals:WeekGoal[])=>apiClient.put<WeekView>(`${base}/weeks/${weekStart}/content`,{expectedRevision,focusSlots,goals}),
  reorder:(scope:string,ids:string[])=>apiClient.put<string[]>(`${base}/order`,{scope,ids}),
  createGroup:(name:string)=>apiClient.post<ProjectGroup>(`${base}/project-groups`,{name}),
  renameGroup:(id:string,expectedRevision:number,name:string)=>apiClient.patch<ProjectGroup>(`${base}/project-groups/${id}`,{name,expectedRevision}),
  deleteGroup:(id:string)=>apiClient.delete<Project[]>(`${base}/project-groups/${id}`),
  /** Atomic catalog move: into groupId (null = 그룹 없음) before beforeProjectId (null = end). Returns the whole catalog. */
  moveProject:(id:string,groupId:string|null,beforeProjectId:string|null,expectedRevision?:number)=>apiClient.post<Project[]>(`${base}/projects/${id}/move`,{groupId,beforeProjectId,expectedRevision}),
  taskRecords:(id:string,limit=10)=>apiClient.get<RecentRecord[]>(`${base}/tasks/${id}/recent-records?limit=${limit}`),
  projectRecords:(id:string,limit=10)=>apiClient.get<RecentRecord[]>(`${base}/projects/${id}/recent-records?limit=${limit}`),
  waiting:()=>apiClient.get<WaitingView>(`${base}/waiting`),
  resources:(owner:{projectId?:string;taskId?:string})=>apiClient.get<Resource[]>(`${base}/resources?`+new URLSearchParams(owner as Record<string,string>).toString()),
  createResource:(input:ResourceInput)=>apiClient.post<Resource>(`${base}/resources`,input),
  patchResource:(id:string,patch:Partial<Pick<Resource,'title'|'memo'|'pinned'|'url'|'type'>>)=>apiClient.patch<Resource>(`${base}/resources/${id}`,patch),
  deleteResource:(id:string)=>apiClient.delete<void>(`${base}/resources/${id}`),
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
