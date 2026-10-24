import { apiClient } from "./client";

export type CheckItem = {id:string;title:string;checked:boolean};
export type Timetable = {id:string;title:string;description:string;goal:string;memo:string;defaultColor:string|null;checklist:CheckItem[];sortOrder:number;archivedAt:string|null;version:number;createdAt:string;updatedAt:string};
export type TimetableInput = Pick<Timetable,"title"|"description"|"goal"|"memo"|"defaultColor"|"checklist"> & {version?:number};
export type TimetableBlock = {id:string;timetableId:string;title:string;weekday:number;startMinute:number;durationMinutes:number;memo:string;color:string|null;version:number;deletedAt:string|null;creationGroupId:string|null};
export type BlockInput = Omit<TimetableBlock,"id"|"timetableId"|"version"|"deletedAt"|"creationGroupId"> & {version?:number};
export type Philosophy = {content:string;version:number;updatedAt:string};
const base="/api/calendar/timetables";
export const timetablesApi = {
  context:()=>apiClient.get<{ownerId:string}>(`${base}/context`),
  list:()=>apiClient.get<Timetable[]>(base),
  get:(id:string)=>apiClient.get<Timetable>(`${base}/${id}`),
  create:(input:TimetableInput,key:string)=>apiClient.post<Timetable>(base,input,{"Idempotency-Key":key}),
  update:(id:string,input:TimetableInput)=>apiClient.put<Timetable>(`${base}/${id}`,input),
  archive:(t:Timetable,archived:boolean)=>apiClient.put<Timetable>(`${base}/${t.id}/archive`,{version:t.version,archived}),
  duplicate:(t:Timetable,key:string)=>apiClient.post<Timetable>(`${base}/${t.id}/duplicate`,{version:t.version},{"Idempotency-Key":key}),
  reorder:(ids:string[])=>apiClient.put<Timetable[]>(`${base}/order`,{ids}),
  philosophy:(id:string)=>apiClient.get<Philosophy>(`${base}/${id}/philosophy`),
  savePhilosophy:(id:string,p:Pick<Philosophy,"content"|"version">)=>apiClient.put<Philosophy>(`${base}/${id}/philosophy`,p),
  blocks:(id:string)=>apiClient.get<TimetableBlock[]>(`${base}/${id}/blocks`),
  createBlocks:(id:string,block:BlockInput,weekdays:number[],key:string)=>apiClient.post<{blocks:TimetableBlock[]}>(`${base}/${id}/blocks`,{block,weekdays},{"Idempotency-Key":key}),
  updateGroup:(id:string,group:string,block:BlockInput,weekdays:number[],members:TimetableBlock[],key:string)=>apiClient.put<{blocks:TimetableBlock[]}>(`${base}/${id}/block-groups/${group}`,{block,weekdays,members:members.map(({id,version})=>({id,version}))},{"Idempotency-Key":key}),
  updateBlock:(id:string,b:TimetableBlock)=>apiClient.put<TimetableBlock>(`${base}/${id}/blocks/${b.id}`,b),
  deleteBlock:(id:string,b:TimetableBlock)=>apiClient.delete<TimetableBlock>(`${base}/${id}/blocks/${b.id}?version=${b.version}`),
  restoreBlock:(id:string,b:TimetableBlock)=>apiClient.post<TimetableBlock>(`${base}/${id}/blocks/${b.id}/restore`,{version:b.version}),
};
