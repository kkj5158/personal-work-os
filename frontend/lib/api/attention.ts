import {apiClient} from './client';
export type AttentionSource={kind:string;reference?:string|null;url?:string|null;producer:string;intent:string;generation:string;completionPolicy:'ACK_ONLY'|'SOURCE_RESOLVED';authoredAt?:string|null};
export type AttentionItem={id:string;action:string;projectId?:string|null;projectLabel:string;displayTitle:string;workTaskId?:string|null;status:'OPEN'|'COMPLETED'|'DISMISSED';laneId:string;stackOrder:number;laneOrder:number;attentionSequence:number;revision:number;source:AttentionSource;sourceKey:string;seenAt?:string|null;createdAt:string;updatedAt:string;completedAt?:string|null;dismissedAt?:string|null};
export type AttentionLane={id:string;name:string;order:number;revision:number};
export type AttentionSnapshot={queueRevision:number;lanes:AttentionLane[];items:AttentionItem[];serverTime:string;capabilities:Record<string,boolean>};
export type AttentionMutation={operationId:string;queueRevision:number;item?:AttentionItem|null;lanes?:AttentionLane[]|null};
export type AttentionHistory={items:AttentionItem[];nextCursor?:string|null};
const base='/api/workflow/attention';
export const attentionApi={snapshot:()=>apiClient.get<AttentionSnapshot>(base+'/snapshot'),history:(status:string,q='',cursor='')=>apiClient.get<AttentionHistory>(base+`/items?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}${cursor?'&cursor='+encodeURIComponent(cursor):''}`),
 create:(body:unknown)=>apiClient.post<AttentionMutation>(base+'/items',body),edit:(id:string,body:unknown)=>apiClient.patch<AttentionMutation>(base+'/items/'+id,body),
 command:(id:string,verb:string,body:unknown)=>apiClient.post<AttentionMutation>(base+'/items/'+id+'/'+verb,body),lane:(verb:string,id:string|undefined,body:unknown)=>verb==='rename'?apiClient.patch<AttentionMutation>(base+'/lanes/'+id,body):apiClient.post<AttentionMutation>(base+'/lanes'+(verb==='create'?'':verb==='order'?'/order':'/'+id+'/remove'),body)};
