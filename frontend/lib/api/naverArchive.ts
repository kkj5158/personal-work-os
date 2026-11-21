import { apiClient } from "./client";
export type ArchivePost = {id:string;title:string;bodyText:string;sourceHtml:string|null;safeHtml:string;originalPublishedAt:string|null;sourceCategory:string|null;sourceVisibility:string;provenance:string;fidelityStatus:string;externalPostId:string|null;originalUrl:string|null;version:number;sourceSha256:string;archived:boolean;read:boolean;position:number;auditReceipt?:string;assets?:{id:string;mimeType:string;sha256:string;size:number}[]};
export type ArchivePage = {items:ArchivePost[];total:number;unknownDates:number;nextCursor:string|null};
export type ImportPreview = {id?:string;supported:boolean;format?:string;manifestSha256:string;count?:number;bytes?:number;files?:number;htmlFiles?:{path:string;bytes:number;sha256:string}[];warnings?:string[];items?:{index:number;title:string;warnings:string[];images:number;duplicates:unknown[];originalPublishedAt?:string|null;sourceCategory?:string|null;excerpt?:string}[]};
export type ImportStatus = {id:string;state:string;items:{index:number;status:string;postId:string|null;receipt:string|null;errorCode:string|null}[]};
export type RssRun={state:string;discovered?:number;partial?:number;inserted?:number;updated?:number;unchanged?:number;blocked?:number;failed?:number};
export type RssStatus={available:boolean;enabled:boolean;version:number;blogId:string;fullArchiveEnabled:false;backlog:number;policyBlocked:boolean;coverageGap:boolean;lastAttemptAt:string|null;lastSuccessAt:string|null;nextRetryAt:string|null;lastErrorCategory:string|null;lastRun:RssRun|null};
export type RssItem={externalPostId:string;title:string;category:string|null;publishedAt:string|null;originalUrl:string;excerpt:string;sourceSha256:string;state:string;mediaIncomplete:boolean;truncated:boolean;linkedPostId:string|null;duplicateCandidates:{id:string;title:string;version:number;originalPublishedAt:string|null}[]};
const base="/api/naver-archive";
export const naverArchive={
 rssStatus:()=>apiClient.get<RssStatus>(`${base}/sync`),
 rssItems:(cursor?:string)=>apiClient.get<{items:RssItem[];total:number;nextCursor:string|null}>(`${base}/sync/items${cursor?`?cursor=${encodeURIComponent(cursor)}`:""}`),
 rssConfigure:(enabled:boolean,expectedVersion:number,requestId:string)=>apiClient.post<RssStatus>(`${base}/sync/config`,{enabled,expectedVersion,requestId}),
 rssRun:(requestId:string)=>apiClient.post<RssRun>(`${base}/sync/run`,{requestId}),
 rssLink:(external:string,postId:string,expectedVersion:number,requestId:string)=>apiClient.post(`${base}/sync/items/${external}/link`,{postId,expectedVersion,requestId}),
 rssAcknowledge:(external:string,sourceSha256:string,requestId:string)=>apiClient.post(`${base}/sync/items/${external}/ack`,{sourceSha256,requestId}),
 list:(query:URLSearchParams)=>apiClient.get<ArchivePage>(`${base}/posts?${query}`),
 get:(id:string)=>apiClient.get<ArchivePost>(`${base}/posts/${id}`),
 summary:()=>apiClient.get<{counts:{total:number;unknownDates:number;needsReview:number};lastRead:{id:string;position:number;read:boolean}[]}>(`${base}/summary`),
 create:(body:unknown)=>apiClient.post<ArchivePost>(`${base}/posts`,body),
 update:(id:string,body:unknown)=>apiClient.patch<ArchivePost>(`${base}/posts/${id}`,body),
 archive:(id:string,restore:boolean,body:unknown)=>apiClient.post<ArchivePost>(`${base}/posts/${id}/${restore?"restore":"archive"}`,body),
 progress:(id:string,read:boolean,position:number)=>apiClient.put(`${base}/posts/${id}/read-progress`,{read,position}),
 revisions:(id:string)=>apiClient.get<{items:{receipt:string;version:number;action:string;actor:string;createdAt:string}[]}>(`${base}/posts/${id}/revisions`),
 preview:(archiveBase64:string)=>apiClient.post<ImportPreview>(`${base}/imports/preview`,{archiveBase64}),
 nativeUpload:(owner:string)=>apiClient.scoped<{state:string;manifestSha256?:string}>(owner,`${base}/imports/native-upload`),
 uploadNativePart:(owner:string,sha:string,index:number,totalBytes:number,chunkBase64:string)=>
  apiClient.scoped<{state:string;partIndex?:number;manifestSha256?:string}>(owner,`${base}/imports/native-upload/${sha}/${index}`,"PUT",{totalBytes,chunkBase64}),
 previewNative:(owner:string,sha:string)=>apiClient.scoped<ImportPreview>(owner,`${base}/imports/native-upload/${sha}/preview`,"POST"),
 cancelNative:(owner:string,sha:string)=>apiClient.scoped<{discardedParts:number}>(owner,`${base}/imports/native-upload/${sha}`,"DELETE"),
 importStatus:(owner:string,id:string)=>apiClient.scoped<ImportStatus&{manifestSha256:string}>(owner,`${base}/imports/${id}`),
 previewItem:(id:string,index:number)=>apiClient.get<{title:string;bodyText:string;originalPublishedAt:string|null;sourceCategory:string|null}>(`${base}/imports/${id}/items/${index}`),
 execute:(id:string,manifestSha256:string,requestId:string)=>apiClient.post<ImportStatus>(`${base}/imports/${id}/execute`,{manifestSha256,confirmed:true,requestId}),
};
