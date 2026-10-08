export type Endpoint = { date: string; time: string; zone: string; offset: string; known: boolean };
export type Session = { id: string; revision: number; bedtimeIntentAt: string|null; wakeAt: string|null; bedtimeTimezone?: string; wakeTimezone?: string; bedtimeOffsetMinutes?: number; wakeOffsetMinutes?: number; bedtimeCertainty?: string; wakeCertainty?: string; bedtimeSource?: string; wakeSource?: string; logicalWakeDate: string|null; expectedWakeDate: string; status: string; excludedAt: string|null; intervalMinutes: number|null };
export type Nap = { id: string; revision: number; startAt: string; endAt: string; startTimezone: string; endTimezone: string; startOffsetMinutes: number; endOffsetMinutes: number; startLocalDate: string; intervalMinutes: number };
export type Reminder = { enabled: boolean; localTime: string; weekdays: number[]; profile: string };
export type Settings = { revision: number; recordingStartDate: string|null; reminderDeviceId: string|null; timezoneMode: string; bedtime: Reminder; wake: Reminder };
export type Today = { ownerId: string; serverNow: string; activeSession: Session|null; lastClosed: Session|null; pendingActions: {occurrenceId:string;kind:string;expectedWakeDate:string;relatedSessionId:string|null;status:string}[]; deletedSessionIds:string[]; staleOpen:boolean; settings:Settings; contextRevision:string };
export type Circular = {status:string;sampleCount:number;centerMinutes:number|null;deviationMinutes:number|null;timezoneRegime?:string};
export type Metrics = {from:string;to:string;completeCount:number;meanIntervalMinutes:number|null;bedtime:Circular;wake:Circular;trend:{status:string;comparisonMinutes:number|null;recentN:number;baselineN:number};coverage:Record<string,number>;days:{date:string;quality:string;sessionId:string|null;intervalMinutes:number|null}[]};
export type NapSummary = {from:string;to:string;count:number;totalIntervalMinutes:number;meanIntervalMinutes:number|null;days:{date:string;count:number;totalIntervalMinutes:number}[]};
export type Receipt = {operationId:string;sessionId?:string;napId?:string;eventId:string|null;session?:Session;nap?:Nap;deleted:boolean;newRevision:number;serverCommittedAt:string};
export type Draft = {kind:"main"|"nap";id:string;original:Session|Nap|null;start:Endpoint;end:Endpoint};
export type Pending = {path:string;method:string;body:Record<string,unknown>};
export type Saved = {version:1;owner:string;draft:Draft|null;settings:Settings|null;pending:Pending|null};
export function duration(minutes:number|null|undefined){if(minutes==null)return "—";const total=Math.round(Math.abs(minutes));return `${minutes<0?"−":""}${Math.floor(total/60)}시간 ${total%60}분`;}
export function clockTime(minutes:number|null){if(minutes==null)return "—";const total=((Math.round(minutes)%1440)+1440)%1440;return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;}
export function localParts(at:string,zone:string){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(at));const v=(key:string)=>p.find(x=>x.type===key)!.value;return {date:`${v("year")}-${v("month")}-${v("day")}`,time:`${v("hour")}:${v("minute")}`};}
export function endpoint(at:string|null,zone="Asia/Seoul",offset?:number,date=new Date().toISOString().slice(0,10)):Endpoint{return {date,time:"",zone,offset:offset==null?"":String(offset),known:at!==null,...(at?localParts(at,zone):{})};}
export function draftOf(kind:"main"|"nap",record:Session|Nap|null,date:string):Draft {
 if(kind==="nap"){const n=record as Nap|null;return {kind,id:n?.id??crypto.randomUUID(),original:n,start:endpoint(n?.startAt??null,n?.startTimezone,n?.startOffsetMinutes,date),end:endpoint(n?.endAt??null,n?.endTimezone,n?.endOffsetMinutes,date)};}
 const s=record as Session|null;return {kind,id:s?.id??crypto.randomUUID(),original:s,start:endpoint(s?.bedtimeIntentAt??null,s?.bedtimeTimezone,s?.bedtimeOffsetMinutes,date),end:endpoint(s?.wakeAt??null,s?.wakeTimezone,s?.wakeOffsetMinutes,date)};
}
/** Enumerate valid zone offsets; round-trip rejects DST gaps and exposes both fold choices. */
export function candidates(e:Endpoint):{at:string;offset:number}[]{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!/^\d{2}:\d{2}$/.test(e.time))throw Error("날짜와 시각을 입력해주세요.");
 const naive=Date.parse(`${e.date}T${e.time}:00Z`);if(!Number.isFinite(naive)||new Date(naive).toISOString().slice(0,16)!==`${e.date}T${e.time}`)throw Error("유효한 날짜와 시각을 입력해주세요.");
 const offsets=new Set<number>();for(let h=-36;h<=36;h+=3){const probe=new Date(naive+h*3600000).toISOString();const p=localParts(probe,e.zone);offsets.add((Date.parse(`${p.date}T${p.time}:00Z`)-Date.parse(probe))/60000);}
 return [...offsets].map(offset=>({at:new Date(naive-offset*60000).toISOString(),offset})).filter(x=>{const p=localParts(x.at,e.zone);return p.date===e.date&&p.time===e.time;}).sort((a,b)=>a.at.localeCompare(b.at));
}
export function resolve(e:Endpoint){if(!e.known)return null;const values=candidates(e);if(!values.length)throw Error("이 시간대에 존재하지 않는 시각입니다. DST 전환 시각을 확인해주세요.");if(values.length===1)return values[0];const chosen=values.find(x=>String(x.offset)===e.offset);if(!chosen)throw Error("두 번 존재하는 시각입니다. UTC offset을 선택해주세요.");return chosen;}
export function changed(a:Endpoint,b:Endpoint){if(!a.known&&!b.known)return false;return a.known!==b.known||a.date!==b.date||a.time!==b.time||a.zone!==b.zone||a.offset!==b.offset;}
export function actionBody(d:Draft,zone:string,confirmed=false):Record<string,unknown>{
 const initial=d.original?draftOf(d.kind,d.original,d.start.date):null;const startChanged=initial?changed(d.start,initial.start):d.start.known,endChanged=initial?changed(d.end,initial.end):d.end.known;
 const start=startChanged?resolve(d.start):null,end=endChanged?resolve(d.end):null;
 const original=d.original;const sAt=startChanged?start?.at??null:original?(d.kind==="main"?(original as Session).bedtimeIntentAt:(original as Nap).startAt):null;
 const eAt=endChanged?end?.at??null:original?(d.kind==="main"?(original as Session).wakeAt:(original as Nap).endAt):null;
 if(d.kind==="nap"&&(!sAt||!eAt))throw Error("낮잠 시작과 종료는 모두 필요합니다.");if(!sAt&&!eAt)throw Error("한쪽 이상의 시각을 입력해주세요.");
 for(const value of [sAt,eAt])if(value&&Date.parse(value)>Date.now()+300000)throw Error("미래 시각은 저장할 수 없습니다.");
 if(sAt&&eAt){const interval=Date.parse(eAt)-Date.parse(sAt);if(interval<=0)throw Error("종료는 시작 이후여야 합니다. 양 끝 날짜를 확인해주세요.");if(interval>=18*3600000&&!confirmed)throw Error("LONG_INTERVAL");}
 const payload:Record<string,unknown>={confirmLongInterval:confirmed};
 if(d.kind==="main"){
  const fields:Record<string,unknown>={},fieldTimezones:Record<string,string>={},fieldCertainties:Record<string,string>={};
  for(const [field,e,value,hasChanged] of [["bedtimeIntentAt",d.start,start,startChanged],["wakeAt",d.end,end,endChanged]] as const)if(hasChanged){fields[field]=value?.at??null;fieldTimezones[field]=e.zone;fieldCertainties[field]=value?"RECALLED":"UNKNOWN";}
  if(!Object.keys(fields).length)throw Error("변경한 시각이 없습니다.");Object.assign(payload,{fields,fieldTimezones,fieldCertainties});
 }else{for(const [name,e,value,hasChanged] of [["start",d.start,start,startChanged],["end",d.end,end,endChanged]] as const)if(hasChanged)Object.assign(payload,{[`${name}At`]:value?.at,[`${name}Timezone`]:e.zone,[`${name}OffsetMinutes`]:value?.offset});if(!startChanged&&!endChanged)throw Error("변경한 시각이 없습니다.");}
 return envelope(d.kind==="main"?"CORRECT_SESSION":original?"UPDATE_NAP":"CREATE_NAP",d.id,original?.revision??0,zone,payload,d.kind);
}
export function envelope(type:string,id:string,revision:number,zone:string,payload:Record<string,unknown>={},kind="main"){
 const capturedAt=new Date().toISOString(),p=localParts(capturedAt,zone);const offset=Math.round((Date.parse(`${p.date}T${p.time}:00Z`)-Math.floor(Date.parse(capturedAt)/60000)*60000)/60000);
 let deviceId=localStorage.getItem("sleep.web.device.v1");if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem("sleep.web.device.v1",deviceId);}
 return {operationId:crypto.randomUUID(),actionType:type,[kind==="nap"?"napId":"sessionId"]:id,expectedRevision:revision,capturedAt,timezone:zone,offsetMinutes:offset,deviceId,entryPoint:"HISTORY_EDIT",payload};
}
export const storageKey=(owner:string)=>`sleep.web.v1:${owner}`;
export function readSaved(owner:string):Saved|null {try{const s=JSON.parse(localStorage.getItem(storageKey(owner))??"null");return s?.version===1&&s.owner===owner?s:null;}catch{return null;}}
export function writeSaved(owner:string,s:Omit<Saved,"version"|"owner">){localStorage.setItem(storageKey(owner),JSON.stringify({version:1,owner,...s}));}
