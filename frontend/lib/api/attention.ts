import {apiClient} from './client';
export type SummaryOrigin='SOURCE_PROVIDED'|'LOCAL_EXTRACTIVE'|'EVENT_METADATA'|'TITLE_FALLBACK';
export type Excerpt={text:string;originalLength:number;truncated:boolean;origin:string};
export type BrowserCapture={request:Excerpt|null;response:Excerpt|null;userMessageId:string|null;responseId:string};
export type AttentionSource={capture?:BrowserCapture;kind:string;title?:string|null;reference?:string|null;url?:string|null;producer:string;intent:string;generation:string;completionPolicy:'ACK_ONLY'|'SOURCE_RESOLVED';authoredAt?:string|null;summary?:string|null;summaryOrigin?:SummaryOrigin|null};
export type AttentionGroup='ACTIVE'|'COMPLETED'|'DEFERRED';
type ContentFact={text:string;origin:'AGENT_REPORTED'|'USER_EDITED'|'EVENT_METADATA'|'UNKNOWN'};
export type ManagedContent={requestExcerpt?:Excerpt;responseExcerpt?:Excerpt;schemaVersion:'work-content.v1';contentRevision:number;verificationRevision?:number;quality:'PENDING'|'REPORTED'|'LIMITED';sourceTitle:ContentFact;request:ContentFact;requestProvenance?:'LOCAL_EXTRACTIVE'|'DETAIL_NOT_CAPTURED';performed?:ContentFact[];outcome?:{state:string;fact:ContentFact};evidence?:{kind:string;label:string;verification:string;verifiedResult?:'PASSED'|'FAILED'|'EXISTS';reference?:string|null}[];remaining?:{id:string;kind:string;state:string;fact:ContentFact}[];limitations?:ContentFact[];eventId?:string;receivedAt?:string;sessionId?:string|null};
export type ManagedProposal={schemaVersion:'work-content.v1';logicalTaskId:string;runId:string;environment:'DEV'|'PROD';title:string;request:string;publicKey:string;projectId:string|null;sandboxMode:"read-only"|"workspace-write"};
export type ManagedGrant={itemId:string;logicalTaskId:string;runId:string;environment:'DEV'|'PROD';sourceKey:string;generation:string;createReceipt:string;expiresAt:string;proposalHash:string};
export type AttentionItem={content?:ManagedContent|null;queueGroup?:AttentionGroup;previousOpenGroup?:'ACTIVE'|'DEFERRED';id:string;action:string;projectId?:string|null;projectLabel:string;displayTitle:string;workTaskId?:string|null;status:'OPEN'|'COMPLETED'|'DISMISSED';laneId:string;stackOrder:number;laneOrder:number;attentionSequence:number;revision:number;source:AttentionSource;sourceKey:string;seenAt?:string|null;createdAt:string;updatedAt:string;completedAt?:string|null;dismissedAt?:string|null;memo?:string;memoRevision?:number;summary?:string|null;summaryOrigin?:SummaryOrigin|null};
export type AttentionLane={id:string;name:string;order:number;revision:number};
export type AttentionSnapshot={queueRevision:number;lanes:AttentionLane[];items:AttentionItem[];serverTime:string;capabilities:Record<string,boolean>};
export type AttentionMutation={operationId:string;queueRevision:number;item?:AttentionItem|null;lanes?:AttentionLane[]|null};
export type AttentionHistory={items:AttentionItem[];nextCursor?:string|null};
export type AttentionDevice={id:string;kind:'DEVICE'|'PRODUCER';name:string;namespace:string;expiresAt:string|null;revokedAt:string|null;lastUsedAt?:string|null;persistent?:boolean};
export type AttentionCredential={token:string;ownerId:string;credentialId:string;expiresAt:string;persistent?:boolean};
export type AttentionFeed={queueRevision:number;items:AttentionItem[];nextCursor:string|null;totals:Record<AttentionGroup,number>;serverTime:string;ownerScope:string;managedContentEnabled?:boolean};
export type AttentionFilters={q?:string;kind?:string;intent?:string;incomplete?:boolean};
const base='/api/workflow/attention';
export const attentionApi={
 previewCompleted:(body:{requestId:string;ids?:string[];undoBatch?:string})=>apiClient.post<{data:{candidateCount:number;previewId:string;fingerprint:string}}>(base+'/completed-cards/preview',body),
 executeCompleted:(body:{requestId:string;previewId:string;fingerprint:string;confirmed:true})=>apiClient.post<{data:{status:string;appliedCount:number;restorationBatchId:string}}>(base+'/completed-cards/execute',body),
 item:(id:string,signal?:AbortSignal)=>apiClient.get<AttentionItem>(base+'/items/'+encodeURIComponent(id),signal),
 reserveManaged:(body:ManagedProposal)=>apiClient.post<ManagedGrant>(base+'/managed/reservations',body),
 revokeManaged:(id:string)=>apiClient.delete<void>(base+'/managed/reservations/'+encodeURIComponent(id)),
 feed:(filters:AttentionFilters={},cursor='',etag?:string)=>{const params=new URLSearchParams();for(const [key,value] of Object.entries(filters))if(value)params.set(key,String(value));if(cursor)params.set('cursor',cursor);return apiClient.conditional<AttentionFeed>(base+'/feed?'+params.toString(),etag);},snapshot:()=>apiClient.get<AttentionSnapshot>(base+'/snapshot'),history:(status:string,q='',cursor='')=>apiClient.get<AttentionHistory>(base+`/items?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}${cursor?'&cursor='+encodeURIComponent(cursor):''}`),
 conditionalSnapshot:(etag?:string)=>apiClient.conditional<AttentionSnapshot>(base+'/snapshot',etag),
 memo:(id:string,body:{operationId:string;expectedMemoRevision:number;memo:string})=>apiClient.post<AttentionMutation>(base+'/items/'+id+'/memo',body),
 create:(body:unknown)=>apiClient.post<AttentionMutation>(base+'/items',body),edit:(id:string,body:unknown)=>apiClient.patch<AttentionMutation>(base+'/items/'+id,body),
 command:(id:string,verb:string,body:unknown)=>apiClient.post<AttentionMutation>(base+'/items/'+id+'/'+verb,body),lane:(verb:string,id:string|undefined,body:unknown)=>verb==='rename'?apiClient.patch<AttentionMutation>(base+'/lanes/'+id,body):apiClient.post<AttentionMutation>(base+'/lanes'+(verb==='create'?'':verb==='order'?'/order':'/'+id+'/remove'),body),
 devices:()=>apiClient.get<AttentionDevice[]>(base+'/devices'),
 producer:(name:string,namespace:string)=>apiClient.post<AttentionCredential>(base+'/producer-credentials',{name,namespace}),
 restore:(id:string)=>apiClient.post<void>(base+'/devices/'+encodeURIComponent(id)+'/restore',{}),
 revoke:(id:string)=>apiClient.delete<void>(base+'/devices/'+encodeURIComponent(id))};
