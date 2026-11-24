import {apiClient, ApiError} from "../api/client";

export type Summary = {title:string; summary:string; topics:string[]; keyTakeaways:string[];
  userInsights:string[]; openQuestions:string[]; nextStudyPoint?:string; summaryCoverage:"AVAILABLE_CONTEXT"|"PARTIAL_CONTEXT"};
export type Allocation = {date:string;effectiveSeconds:number};
export type RecordHeader = {sessionId:string;status:string;source:string;revision:number;deleted:boolean;title:string;
  startedAt:string;endedAt:string|null;effectiveStart:string;effectiveEnd:string|null;provenance:string;sliceSeconds:number};
type Measurement = {measuredSeconds?:number;idleSeconds?:number;awaySeconds?:number;manualPausedSeconds?:number;
  unobservedSeconds?:number;elapsedSeconds?:number;measurementCoverage:string};
export type LearningRecord = RecordHeader & {summary:Summary;effectiveSeconds:number;allocations:Allocation[];
  original?:Measurement & {summary:Summary;receiptId:string};provisional?:Measurement;bindingState?:string};
export type Stats = {daily:(Allocation & {sessionCount:number})[];totalSeconds:number;studyDays:number;averageSeconds:number;distinctSessionCount:number};
export const emptySummary=():Summary=>({title:"",summary:"",topics:[],keyTakeaways:[],userInsights:[],openQuestions:[],summaryCoverage:"PARTIAL_CONTEXT"});
export function learningPort(owner:string){
  const call=<T>(path:string,method="GET",body?:unknown)=>apiClient.scoped<T>(owner,"/api/study/"+path,method,body);
  return {
    stats:(month:string)=>call<Stats>("statistics?month="+encodeURIComponent(month)),
    current:()=>call<{session:LearningRecord|null}>("learning-sessions/current"),
    page:(from:string,to:string,deleted:boolean,cursor="")=>call<{items:RecordHeader[];nextCursor?:string}>("learning-sessions?"+new URLSearchParams({from,to,includeDeleted:String(deleted),cursor,limit:"20"})),
    detail:(id:string)=>call<LearningRecord>("learning-sessions/"+id),
    pair:(id:string,deviceHash:string)=>call<{challenge:string}>("learning-sessions/"+id+"/pairing-challenge","POST",{deviceHash}),
    async write(path:string,method:string,payload:Record<string,unknown>,key:string,uncertain:boolean){
      if(uncertain){
        try{return await call<LearningRecord>("learning-operations/"+key);}
        catch(e){if(!(e instanceof ApiError && e.status===404))throw e;}
      }
      return call<LearningRecord>(path,method,{...payload,operationKey:key});
    }
  };
}
export type LearningPort=ReturnType<typeof learningPort>;
export function duration(s:number){return s<60?s+"초":Math.floor(s/60)+"분"+(s%60?" "+s%60+"초":"");}
