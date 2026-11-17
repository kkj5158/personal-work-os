import { apiClient } from "./client";
export type ArchivePost = {id:string;title:string;bodyText:string;sourceHtml:string|null;safeHtml:string;originalPublishedAt:string|null;sourceCategory:string|null;sourceVisibility:string;provenance:string;fidelityStatus:string;externalPostId:string|null;originalUrl:string|null;version:number;sourceSha256:string;archived:boolean;read:boolean;position:number;auditReceipt?:string};
export type ArchivePage = {items:ArchivePost[];total:number;nextCursor:string|null};
export type ImportPreview = {id?:string;supported:boolean;manifestSha256:string;count?:number;warnings?:string[];items?:{index:number;title:string;warnings:string[];images:number;duplicates:unknown[]}[]};
export type ImportStatus = {id:string;state:string;items:{index:number;status:string;postId:string|null;receipt:string|null;errorCode:string|null}[]};
const base="/api/naver-archive";
export const naverArchive={
 list:(query:URLSearchParams)=>apiClient.get<ArchivePage>(`${base}/posts?${query}`),
 get:(id:string)=>apiClient.get<ArchivePost>(`${base}/posts/${id}`),
 summary:()=>apiClient.get<{counts:{total:number;unknownDates:number;needsReview:number};lastRead:{id:string;position:number;read:boolean}[]}>(`${base}/summary`),
 create:(body:unknown)=>apiClient.post<ArchivePost>(`${base}/posts`,body),
 update:(id:string,body:unknown)=>apiClient.patch<ArchivePost>(`${base}/posts/${id}`,body),
 archive:(id:string,restore:boolean,body:unknown)=>apiClient.post<ArchivePost>(`${base}/posts/${id}/${restore?"restore":"archive"}`,body),
 progress:(id:string,read:boolean,position:number)=>apiClient.put(`${base}/posts/${id}/read-progress`,{read,position}),
 revisions:(id:string)=>apiClient.get<{items:{receipt:string;version:number;action:string;actor:string;createdAt:string}[]}>(`${base}/posts/${id}/revisions`),
 preview:(archiveBase64:string)=>apiClient.post<ImportPreview>(`${base}/imports/preview`,{archiveBase64}),
 execute:(id:string,manifestSha256:string,requestId:string)=>apiClient.post<ImportStatus>(`${base}/imports/${id}/execute`,{manifestSha256,confirmed:true,requestId}),
};
